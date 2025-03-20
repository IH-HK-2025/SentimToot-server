const express = require("express");
const axios = require("axios");
require("dotenv").config();
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

const getTestUser = async () => {
  return await prisma.user.findUnique({
    where: { email: "test@test.com" },
  });
};

// // Add the analyzeSentiment function
// const analyzeSentiment = async (text) => {
//   try {
//     const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
//     const prompt = `Analyze sentiment of: "${text}". Respond ONLY with: Positive, Negative, or Neutral.`;

//     const result = await model.generateContent(prompt);
//     const response = (await result.response.text()).trim().toLowerCase();

//     if (response.includes("positive")) return "Positive";
//     if (response.includes("negative")) return "Negative";
//     return "Neutral";
//   } catch (error) {
//     console.error("Sentiment analysis error:", error.message);
//     return "Neutral";
//   }
// };

router.get("/reddit", async (req, res) => {
  const token = await getRedditToken();
  if (!token) {
    return res.status(500).json({ error: "Failed to fetch Reddit token" });
  }

  try {
    const { subreddit = "popular", category = "hot", limit = 5 } = req.query;

    const user = await getTestUser();

    // Fetch posts from Reddit API
    const redditResponse = await axios.get(
      `https://oauth.reddit.com/r/${subreddit}/${category}`,
      {
        params: {
          limit: limit,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": process.env.REDDIT_USER_AGENT,
        },
      }
    );

    const posts = redditResponse.data.data.children.map((post) => ({
      id: post.data.id,
      title: post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      author: post.data.author,
      score: post.data.score,
      created: new Date(post.data.created_utc * 1000),
    }));

    // Store posts in database
    await prisma.redditPost.createMany({
      data: posts.map((post) => ({
        postId: post.id,
        title: post.title,
        url: post.url,
        author: post.author,
        score: post.score,
        userId: user.id,
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
        created: post.created,
      })),
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({
      error: "Failed to fetch Reddit posts",
      details: error.response?.data,
    });
  }
});

// Test route
router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;
