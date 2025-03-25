const express = require("express");
const axios = require("axios");
require("dotenv").config();
const { isAuthenticated } = require("../middleware/jwt.middleware");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PrismaClient } = require("@prisma/client");
const { convert } = require("html-to-text");
const { RateLimiter } = require('limiter');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const prisma = new PrismaClient();
const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const limiter = new RateLimiter({ tokensPerInterval: 8, interval: 'second' });
const sentimentCache = new NodeCache({ stdTTL: 3600 });

function getCacheKey(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function getSentiment(text) {
  const cleanText = text.slice(0, 500).replace(/\n/g, ' ').trim();
  const cacheKey = `sentiment:${getCacheKey(cleanText)}`;
  const cached = sentimentCache.get(cacheKey);
  if (cached) return cached;

  try {
    await limiter.removeTokens(1);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze sentiment of: "${cleanText}". Reply ONLY with Positive, Negative, or Neutral.`;
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toLowerCase();
    
    let sentiment = 'Neutral';
    if (response.includes('positive')) sentiment = 'Positive';
    if (response.includes('negative')) sentiment = 'Negative';
    
    sentimentCache.set(cacheKey, sentiment);
    return sentiment;
  } catch (error) {
    console.error('Sentiment analysis error:', error.message);
    if (error.message.includes('quota')) await new Promise(resolve => setTimeout(resolve, 2000));
    return 'Neutral';
  }
}

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

router.get("/mastodon", isAuthenticated, async (req, res) => {
<<<<<<< Updated upstream
  const { instance = "mastodon.social", keyword, limit = 10 } = req.query;
  const userId = req.payload.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mastodonToken: true },
  });

  const token = user.mastodonToken;
  // console.log(token);

  if (!user || !user.mastodonToken) {
    return res.status(404).json({ error: "Mastodon token not found" });
  }
=======
  const { instance = "mastodon.social", keyword = "Tech", limit = 10 } = req.query;
  const token = process.env.MASTODON_ACCESS_TOKEN;
>>>>>>> Stashed changes

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const userId = req.payload.id;
    const toots = await getData(instance, token, keyword, limit);
    if (!toots.length) return res.status(404).json({ error: "No toots found" });

    const responseSentiment = await Promise.all(toots.map((t) => getSentiment(t.content)));
    const newArr = toots.map((element, i) => ({ ...element, sentiment: responseSentiment[i] }));
    const overallSentiment = await getSentiment(toots.map((t) => convert(t.content, { wordwrap: false }).replace(/\n/g, " ").trim()).join(" "));

<<<<<<< Updated upstream
    const newArr = toots.map((element, i) => ({
      ...element,
      sentiment: responseSentiment[i],
    }));

    const overallSentiment = await getSentiment(
      toots
        .map((t) =>
          convert(t.content, { wordwrap: false }).replace(/\n/g, " ").trim()
        )
        .join(" ")
    );

    // Construct the full response object
    const responseObject = {
      keyword,
      instance,
      count: toots.length,
      sentiment: overallSentiment,
      data: newArr,
    };

    // Convert the response to a string and store in history
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { history: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        history: {
          set: [...user.history, JSON.stringify(responseObject)],
        },
      },
=======
    const responseObject = { keyword, instance, count: toots.length, sentiment: overallSentiment, data: newArr };
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { history: true } });
    
    if (!user) throw new Error("User not found");
    await prisma.user.update({
      where: { id: userId },
      data: { history: { set: [...user.history, JSON.stringify(responseObject)] } },
>>>>>>> Stashed changes
    });

    res.json(responseObject);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: "Processing failed" });
  }
});

router.post("/toot", isAuthenticated, async (req, res) => {
  const { content, visibility = "public" } = req.body;
  const instance = "mastodon.social";
  const userId = req.payload.id;
<<<<<<< Updated upstream
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mastodonToken: true },
  });

  const token = user.mastodonToken;
  // console.log(token);

  if (!user || !user.mastodonToken) {
    return res.status(404).json({ error: "Mastodon token not found" });
  }

=======

  if (!token) return res.status(500).json({ error: "Server configuration error" });
>>>>>>> Stashed changes
  if (!content) return res.status(400).json({ error: "Content is required" });
  if (content.length > 500) return res.status(400).json({ error: "Toot too long (max 500 characters)" });

  try {
    const response = await axios.post(
      `https://${instance}/api/v1/statuses`,
      { status: content, visibility },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const createdToot = await prisma.toot.create({
      data: {
        mastodonId: response.data.id,
        content: response.data.content,
        url: response.data.url,
        visibility: response.data.visibility,
        userId: userId,
        createdAt: new Date(response.data.created_at),
      },
    });

    res.status(201).json(createdToot);
  } catch (error) {
    console.error("Toot creation error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to post toot", details: error.response?.data || error.message });
  }
});

router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;