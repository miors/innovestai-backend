const axios = require("axios");

const cache = new Map();
const TTL_MS = 15 * 60 * 1000;

const getNews = async (symbol, type, limit = 5) => {
  const ticker =
    type === "crypto" ? `X:${symbol.toUpperCase()}USD` : symbol.toUpperCase();
  const key = `${ticker}:${limit}`;

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const response = await axios.get("https://api.polygon.io/v2/reference/news", {
    params: {
      ticker,
      limit,
      order: "desc",
      sort: "published_utc",
      apiKey: process.env.POLYGON_API_KEY,
    },
  });

  const data = (response.data.results ?? []).map((a) => ({
    title: a.title,
    publisher: a.publisher?.name ?? null,
    publishedAt: a.published_utc,
    url: a.article_url,
    description: a.description ?? null,
    // Polygon only includes per-ticker sentiment on some articles/plans
    sentiment: a.insights?.find((i) => i.ticker === ticker)?.sentiment ?? null,
  }));

  cache.set(key, { data, expires: Date.now() + TTL_MS });
  return data;
};

module.exports = { getNews };
