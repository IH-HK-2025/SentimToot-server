const express = require("express");
const axios = require("axios");
require("dotenv").config();
const { isAuthenticated } = require("../middleware/jwt.middleware");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PrismaClient } = require("@prisma/client");
const { convert } = require("html-to-text");
const prisma = new PrismaClient();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getData(instance, token, keyword, limit = 10) {
  try {
    const { data } = await axios.get(`https://${instance}/api/v2/search`, {
      params: { q: keyword, type: "statuses", limit },
      headers: { Authorization: `Bearer ${token}` },
    });

    return data.statuses.map(({ id, content, account, created_at }) => ({
      id,
      content,
      author: account.username,
      sentiment: "",
      created_at: new Date(created_at),
    }));
  } catch (error) {
    console.error("Fetch error:", error.message);
    return [];
  }
}

async function getSentiment(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze sentiment of this post title: "${text}". Reply ONLY with Positive, Negative, or Neutral.`;

    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toLowerCase();

    if (response.includes("positive")) return "Positive";
    if (response.includes("negative")) return "Negative";
    if (response.includes("neutral")) return "Neutral";
  } catch (error) {
    console.error("Sentiment analysis error:", error.message);
    return "Sentiment analysis error";
  }
}

router.get("/mastodon", async (req, res) => {
  const {
    instance = "mastodon.social",
    keyword = "Tech",
    limit = 10,
  } = req.query;
  const token = process.env.MASTODON_ACCESS_TOKEN;

  if (!token) return res.status(500).json({ error: "Missing API token" });
  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const toots = await getData(instance, token, keyword, limit);
    if (!toots.length) return res.status(404).json({ error: "No toots found" });

    const responseSentiment = await Promise.all(
      toots.map((t) => getSentiment(t.content))
    );

    const newArr = toots.map((element, i) => ({
      ...element,
      content: convert(element.content, { wordwrap: false }).replace(/\n/g, " ").trim(),
      sentiment: responseSentiment[i],
    }));

    const overallSentiment = await getSentiment(
      toots
        .map((t) =>
          convert(t.content, { wordwrap: false }).replace(/\n/g, " ").trim()
        )
        .join(" ")
    );

    res.json({
      keyword,
      instance,
      count: toots.length,
      sentiment: overallSentiment,
      data: newArr,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Processing failed" });
  }
});

router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;
