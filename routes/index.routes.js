const express = require("express");
const axios = require("axios");
require("dotenv").config();
const { isAuthenticated } = require("../middleware/jwt.middleware");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Function to get Reddit OAuth token
const getRedditToken = async () => {
  try {
    const auth = Buffer.from(
      `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      "https://www.reddit.com/api/v1/access_token",
      `grant_type=password&username=${process.env.REDDIT_USERNAME}&password=${process.env.REDDIT_PASSWORD}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": process.env.REDDIT_USER_AGENT,
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching Reddit token:", error.message);
    return null;
  }
};

// function delay(ms) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

// Analyze Sentiment function
const analyzeSentiment = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze sentiment of this post title: "${text}". Reply ONLY with Positive, Negative, or Neutral.`;

    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toLowerCase();

    if (response.includes("positive")) {
      return "Positive";
    }
    if (response.includes("negative")) {
      return "Negative";
    }
    if (response.includes("neutral")) {
      return "Neutral";
    }
  } catch (error) {
    console.error("Sentiment analysis error:", error.message);
    return "Sentiment analysis error";
  }
};

router.get("/reddit", isAuthenticated, async (req, res) => {
  const token = await getRedditToken();
  if (!token) {
    return res.status(500).json({ error: "Failed to fetch Reddit token" });
  }

  try {
    const { subreddit = "popular", category = "hot", limit = 10 } = req.query;
    const userId = req.payload.id;

    // Fetch posts from Reddit API
    const redditResponse = await axios.get(
      `https://oauth.reddit.com/r/${subreddit}/${category}`,
      {
        params: { limit: limit },
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": process.env.REDDIT_USER_AGENT,
        },
      }
    );

    // Process posts with sentiment analysis
    const posts = [];
    for (const post of redditResponse.data.data.children) {
      const postData = post.data;
      try {
        const sentiment = await analyzeSentiment(postData.title);
        posts.push({
          id: postData.id,
          title: postData.title,
          url: `https://reddit.com${postData.permalink}`,
          author: postData.author,
          score: postData.score,
          sentiment,
          created: new Date(postData.created_utc * 1000),
        });
      } catch (error) {
        console.error("Error analyzing sentiment:", error);
      }
    }

    // Store posts into Prisma model, linked to user
    await prisma.redditPost.createMany({
      data: posts.map((post) => ({
        postId: post.id,
        title: post.title,
        url: post.url,
        author: post.author,
        score: post.score,
        userId,
      })),
      skipDuplicates: true,
    });

    res.json({
      subreddit,
      category,
      posts: posts.map((post) => ({
        title: post.title,
        url: post.url,
        score: post.score,
        author: post.author,
        sentiment: post.sentiment,
        created: post.created,
      })),
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({
      error: "Failed to process Reddit posts",
      details: error.response?.data,
    });
  }
});

// Test route
router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;
