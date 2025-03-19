const express = require("express");
const axios = require("axios");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

// Function to analyze sentiment using Gemini AI
const analyzeSentiment = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const chat = model.startChat();
   
    const prompt = `Determine the sentiment of this text: "${text}". Reply with either Positive, Negative, or Neutral.`;

    const result = await chat.sendMessage(prompt);
    const aiResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Sentiment analysis failed.";

    console.log("AI Response:", aiResponse); // Debugging

    return aiResponse;
  } catch (error) {
    console.error("Error analyzing sentiment:", error.message);
    return "Sentiment analysis failed.";
  }
};


// Route to fetch Reddit posts and analyze sentiment
router.get("/reddit", async (req, res) => {
  const token = await getRedditToken();
  if (!token) {
    return res.status(500).json({ error: "Failed to fetch Reddit token" });
  }

  try {
    // Fetch top posts from Reddit
    const redditResponse = await axios.get("https://oauth.reddit.com/r/popular", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": process.env.REDDIT_USER_AGENT,
      },
    });

    const posts = redditResponse.data.data.children.map((x) => x.data.title);
    if (posts.length === 0) {
      return res.status(500).json({ error: "No Reddit posts found" });
    }

    // Analyze sentiment of the first Reddit post
    const sentiment = await analyzeSentiment(`Analyze sentiment: ${posts}`);

    res.json({ post: posts[0], sentiment });
  } catch (error) {
    console.error("Error fetching Reddit posts:", error.message);
    res.status(500).json({ error: "Failed to process AI response" });
  }
});

// Test route
router.get("/", (req, res) => {
  res.json("All good in here");
});

module.exports = router;
