const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { isAuthenticated } = require("../middleware/jwt.middleware");
const axios = require("axios");
const { RateLimiter } = require("limiter");
const NodeCache = require("node-cache");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();
const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const limiter = new RateLimiter({ tokensPerInterval: 8, interval: "second" });
const sentimentCache = new NodeCache({ stdTTL: 3600 });

function getCacheKey(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

async function getSentiment(text) {
  const cleanText = text.slice(0, 500).replace(/\n/g, " ").trim();
  const cacheKey = `sentiment:${getCacheKey(cleanText)}`;
  const cached = sentimentCache.get(cacheKey);
  if (cached) return cached;

  try {
    await limiter.removeTokens(1);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze sentiment of: "${cleanText}". Reply ONLY with Positive, Negative, or Neutral.`;
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toLowerCase();

    let sentiment = "Neutral";
    if (response.includes("positive")) sentiment = "Positive";
    if (response.includes("negative")) sentiment = "Negative";

    sentimentCache.set(cacheKey, sentiment);
    return sentiment;
  } catch (error) {
    console.error("Sentiment analysis error:", error.message);
    if (error.message.includes("quota")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return "Neutral";
  }
}

router.post("/", isAuthenticated, async (req, res) => {
  const { numTrends, numPosts } = req.body;
  const instance = "mastodon.social";

  if (numTrends < 1 || numPosts < 1) {
    return res.status(400).json({
      error: "Minimum 1 trend and 1 post per trend required",
    });
  }

  try {
    const userId = req.payload.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mastodonToken: true },
    });

    if (!user?.mastodonToken) {
      return res.status(400).json({
        error: "Mastodon token is required",
      });
    }

    const { mastodonToken } = user;

    const [trendsResponse] = await Promise.all([
      axios.get(`https://${instance}/api/v1/trends`, {
        headers: { Authorization: `Bearer ${mastodonToken}` },
      }),
      limiter.removeTokens(1),
    ]);

    const trends = trendsResponse.data.slice(0, numTrends);
    const trendAnalyses = await Promise.all(
      trends.map(async (trend) => {
        try {
          const searchResponse = await axios.get(
            `https://${instance}/api/v2/search`,
            {
              params: {
                q: `#${trend.name}`,
                type: "statuses",
                limit: numPosts,
                resolve: true,
              },
              headers: { Authorization: `Bearer ${mastodonToken}` },
            }
          );

          const posts = await Promise.all(
            searchResponse.data.statuses.map(async (post) => {
              const sentiment = await getSentiment(post.content);
              return {
                id: post.id,
                content: post.content,
                author: post.account.username,
                sentiment,
                created_at: new Date(post.created_at),
              };
            })
          );

          const sentimentCounts = posts.reduce(
            (acc, { sentiment }) => {
              const key = sentiment.toLowerCase();
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            { positive: 0, neutral: 0, negative: 0 }
          );

          const totalPosts = posts.length || 1;
          const sentimentDistribution = {
            positive: Number(
              ((sentimentCounts.positive / totalPosts) * 100).toFixed(1)
            ),
            neutral: Number(
              ((sentimentCounts.neutral / totalPosts) * 100).toFixed(1)
            ),
            negative: Number(
              ((sentimentCounts.negative / totalPosts) * 100).toFixed(1)
            ),
          };

          const overallSentiment = Object.entries(sentimentCounts)
            .reduce((a, b) => (a[1] > b[1] ? a : b))[0]
            .toLowerCase()
            .replace(/^\w/, (c) => c.toUpperCase());

          return {
            name: trend.name,
            posts,
            sentimentDistribution,
            overallSentiment,
          };
        } catch (error) {
          console.error(`Error processing trend ${trend.name}:`, error.message);
          return null;
        }
      })
    );

    const validAnalyses = trendAnalyses.filter(Boolean);

    res.json({
      data: {
        trends: validAnalyses,
        meta: {
          totalTrends: validAnalyses.length,
          totalPosts: validAnalyses.reduce((sum, t) => sum + t.posts.length, 0),
          requestedTrends: numTrends,
          requestedPostsPerTrend: numPosts,
          instance,
        },
      },
    });
  } catch (error) {
    console.error("Analysis failed:", error.message);
    res.status(500).json({
      error: error.response?.data?.error || "Trend analysis failed",
    });
  }
});

module.exports = router;
