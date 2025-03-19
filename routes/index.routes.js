const router = require("express").Router();
require("dotenv").config();
const axios = require("axios");

const OpenAI = require("openai");

router.get("/", (req, res) => {
  res.json("All good in here");
});

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const getRedditToken = async () => {
  const auth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString("base64");

  // console.log("Auth: ", auth);
  // console.log("ENV: ", process.env.REDDIT_USER_AGENT);

  try {
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
    // console.log(response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching Reddit token:", error.message);
    return null;
  }
};

// Route to fetch Reddit data
router.get("/reddit", async (req, res) => {
  const token = await getRedditToken();
  if (!token) {
    return res.status(500).json({ error: "Failed to fetch Reddit token" });
  }
  try {
    // Fetch top posts from Reddit
    const redditResponse = await axios.get(
      "https://oauth.reddit.com/r/popular",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": process.env.REDDIT_USER_AGENT,
        },
      }
    );

    const posts = redditResponse.data.data.children;
    const text = posts.map((x) => x.data.title);

    if (text.length === 0) {
      return res.status(500).json({ error: "No Reddit posts found" });
    }

    // Send first Reddit post to DeepSeek AI for sentiment analysis
    const responseAI = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: `Analyze sentiment: ${text[0]}` }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Extract the AI response
    const aiSentiment = responseAI.data.choices[0].message.content;

    res.json({ post: text[0], sentiment: aiSentiment });
  } catch (error) {
    console.error("Error fetching AI response:", error.message);
    res.status(500).json({ error: "Failed to process AI response" });
  }
});

module.exports = router;
