const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const requireAuth = require("../middleware/auth");

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

  try {
    if (!portfolioContext || portfolioContext.length === 0) {
      return res
        .status(400)
        .json({ error: "Cannot process analysis for an empty portfolio map." });
    }

    const promptSummary = portfolioContext
      .map(
        (item) =>
          `- Asset: ${item.symbol}, Strategy Note: "${item.notes_content || "None entered"}"`,
      )
      .join("\n");

    const key = `ai:${req.user.id}:${crypto.createHash("sha256").update(promptSummary).digest("hex")}`;
    const hit = getCached(key);
    if (hit) return res.json({ analysis: hit });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective, high-speed execution target
      messages: [
        {
          role: "system",
          content:
            "You are an institutional financial portfolio risk analyst. Review the user's asset lists and custom operational strategies. Provide 3 short, high-impact bullet points identifying systemic market macro-risks or diversification changes based on their strategy. Keep formatting tight using bold markdown tags.",
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
    // res.status(500).json({ error: "Failed to generate structural portfolio insights." });
    next(err);
  }
});

module.exports = router;
