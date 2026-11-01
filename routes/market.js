const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getNews } = require("../services/news");

const cache = new Map();

const getCached = (key) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  cache.delete(key);
  return null;
};

const setCached = (key, data, ttlMs) => {
  cache.set(key, { data, expires: Date.now() + ttlMs });
};

const sendPolygonError = (err, res) => {
  const status = err.response?.status;
  console.error("Polygon Failure:", err.response?.data || err.message);

  if (status === 429) {
    return res
      .status(429)
      .json({ error: "Rate limit reached. Wait a minute and try again." });
  }
  if (status === 403) {
    return res
      .status(403)
      .json({ error: "Your market data plan doesn't include this asset." });
  }
  if (status === 404) {
    return res.status(404).json({ error: "Symbol not found." });
  }
  res.status(502).json({ error: "Market data is unavailable right now." });
};

// Proxy route to pull historic equity details safely
router.get("/stocks/history/:symbol", async (req, res, next) => {
  const { symbol } = req.params;
  const { type } = req.query;
  const ticker =
    type === "crypto" ? `X:${symbol.toUpperCase()}USD` : symbol.toUpperCase();

  const key = `history:${ticker}`;
  const cached = getCached(key);
  if (cached) return res.json(cached);
  try {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const targetUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&apiKey=${process.env.POLYGON_API_KEY}`;
    const response = await axios.get(targetUrl);
    if (!response.data.results?.length) {
      return res.status(404).json({ error: "No price data for this symbol." });
    }
    setCached(key, response.data, 10 * 60 * 1000);
    res.json(response.data);
  } catch (err) {
    sendPolygonError(err, res);
  }
});

router.get("/price/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const { type } = req.query;
  const ticker =
    type === "crypto" ? `X:${symbol.toUpperCase()}USD` : symbol.toUpperCase();
  const key = `price:${ticker}`;

  const cached = getCached(key);
  if (cached) return res.json(cached);

  try {
    const response = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`,
    );
    const bar = response.data.results?.[0];
    const data = {
      price: bar?.c ?? null,
      change: bar ? bar.c - bar.o : null,
      changePct: bar && bar.o ? ((bar.c - bar.o) / bar.o) * 100 : null,
    };
    if (data.price !== null) setCached(key, data, 10 * 60 * 1000);
    res.json(data);
  } catch (err) {
    sendPolygonError(err, res);
  }
});

router.get("/news/:symbol", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const news = await getNews(req.params.symbol, req.query.type, limit);
    res.json({ results: news });
  } catch (err) {
    sendPolygonError(err, res);
  }
});

router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const market = req.query.type === "crypto" ? "crypto" : "stocks";
  if (q.length < 1 || q.length > 30) return res.json({ results: [] });

  const key = `search:${market}:${q.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return res.json(cached);

  try {
    const response = await axios.get(
      "https://api.polygon.io/v3/reference/tickers",
      {
        params: {
          search: q,
          market,
          active: true,
          limit: 8,
          apiKey: process.env.POLYGON_API_KEY,
        },
      },
    );
    const data = {
      results: (response.data.results ?? []).map((t) => ({
        symbol:
          market === "crypto"
            ? t.ticker.replace(/^X:/, "").replace(/USD$/, "")
            : t.ticker,
        name: t.name,
      })),
    };
    setCached(key, data, 60 * 60 * 1000);
    res.json(data);
  } catch (err) {
    sendPolygonError(err, res);
  }
});

module.exports = router;
