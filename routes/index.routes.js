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

router.get("/mastodon", isAuthenticated, async (req, res) => {
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

  if (!keyword) return res.status(400).json({ error: "Keyword required" });

  try {
    const userId = req.payload.id;

    const toots = await getData(instance, token, keyword, limit);
    if (!toots.length) return res.status(404).json({ error: "No toots found" });

    const responseSentiment = await Promise.all(
      toots.map((t) => getSentiment(t.content))
    );

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
    });

    // Send the same response back to the user
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mastodonToken: true },
  });

  const token = user.mastodonToken;
  // console.log(token);

  if (!user || !user.mastodonToken) {
    return res.status(404).json({ error: "Mastodon token not found" });
  }

  if (!content) return res.status(400).json({ error: "Content is required" });
  if (content.length > 500)
    return res
      .status(400)
      .json({ error: "Toot too long (max 500 characters)" });

  try {
    const response = await axios.post(
      `https://${instance}/api/v1/statuses`,
      { status: content, visibility },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
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
    console.error(
      "Toot creation error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to post toot",
      details: error.response?.data || error.message,
    });
  }
});

router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;
