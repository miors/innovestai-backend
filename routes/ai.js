const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const requireAuth = require("../middleware/auth");
const { getNews } = require("../services/news");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const crypto = require("crypto");

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

router.post("/analyze", async (req, res, next) => {
  const { portfolioContext } = req.body;

  if (!Array.isArray(portfolioContext) || portfolioContext.length === 0) {
    return res
      .status(400)
      .json({ error: "Cannot process analysis for an empty portfolio map." });
  }
  if (portfolioContext.length > 50) {
    return res
      .status(400)
      .json({ error: "portfolioContext cannot exceed 50 items." });
  }
  for (const item of portfolioContext) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.symbol !== "string" ||
      !item.symbol.trim() ||
      item.symbol.length > 20 ||
      !["stock", "crypto"].includes(item.asset_type)
    ) {
      return res.status(400).json({
        error:
          "Each item needs a symbol (max 20 chars) and asset_type of stock or crypto.",
      });
    }
    if (
      item.notes_content != null &&
      (typeof item.notes_content !== "string" ||
        item.notes_content.length > 5000)
    ) {
      return res.status(400).json({
        error: "notes_content must be a string of 5000 characters or fewer.",
      });
    }
  }

  try {
    if (!portfolioContext || portfolioContext.length === 0) {
      return res
        .status(400)
        .json({ error: "Cannot process analysis for an empty portfolio map." });
    }

    // Fetch headlines server-side; a failed lookup must not break the analysis
    const lines = await Promise.all(
      portfolioContext.slice(0, 8).map(async (item) => {
        let headlines = "None available";
        try {
          const news = await getNews(item.symbol, item.asset_type, 3);
          if (news.length) {
            headlines = news
              .map(
                (n) => `"${n.title}"${n.sentiment ? ` (${n.sentiment})` : ""}`,
              )
              .join("; ");
          }
        } catch {
          // fall through with "None available"
        }
        return `- Asset: ${item.symbol}, Strategy Note: "${item.notes_content || "None entered"}", Recent headlines: ${headlines}`;
      }),
    );
    const promptSummary = lines.join("\n");

    const key = `ai:${req.user.id}:${crypto.createHash("sha256").update(promptSummary).digest("hex")}`;
    const hit = getCached(key);
    if (hit) return res.json({ analysis: hit });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective, high-speed execution target
      messages: [
        {
          role: "system",
          content:
            // "You are an institutional financial portfolio risk analyst. Review the user's asset lists and custom operational strategies. Provide 3 short, high-impact bullet points identifying systemic market macro-risks or diversification changes based on their strategy. Keep formatting tight using bold markdown tags.",
            "You are an institutional financial portfolio risk analyst. Review the user's asset lists, custom strategies, and recent news headlines. Provide 3 short, high-impact bullet points identifying systemic market macro-risks or diversification changes. Reference specific headlines where relevant, and don't invent news that isn't listed. Keep formatting tight using bold markdown tags.",
        },
        {
          role: "user",
          content: `Analyze this portfolio structure:\n${promptSummary}`,
        },
      ],
      temperature: 0.7,
    });

    const analysis = completion.choices[0].message.content;
    setCached(key, analysis, 30 * 60 * 1000);
    res.json({ analysis });
  } catch (err) {
    console.error("AI Generation Failure:", err.message);
    res
      .status(500)
      .json({ error: "Failed to generate structural portfolio insights." });
    next(err);
  }
});

module.exports = router;
