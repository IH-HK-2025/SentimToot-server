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
    res.status(500).json({ error: "Failed to fetch Reddit token" });
  }
  try {
    const redditResponse = await axios.get(
      "https://oauth.reddit.com/r/popular",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": process.env.REDDIT_USER_AGENT,
        },
      }
    );
    // console.log(redditResponse.data);
    const posts = redditResponse.data.data.children;
    const text = posts.map((x) => {
      return x.data.title;
    });
    // // Send POST request to DeepSeek API with the provided text
    // const responseAI = await axios.post("https://api.deepseek.com", text[0], {
    //   headers: {
    //     Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    //     "Content-Type": "application/json",
    //   },
    // });

    // Send back the sentiment analysis result
    console.log("responseAI");
    res.json(text);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Reddit data" });
  }
});

module.exports = router;
