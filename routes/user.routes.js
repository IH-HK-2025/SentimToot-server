const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { PrismaClient } = require("@prisma/client");
const { isAuthenticated } = require("../middleware/jwt.middleware");
const axios = require("axios");
const { RateLimiter } = require("limiter");
const NodeCache = require("node-cache");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const limiter = new RateLimiter({ tokensPerInterval: 8, interval: "second" });
const sentimentCache = new NodeCache({ stdTTL: 3600 });

const router = express.Router();
const prisma = new PrismaClient();
const saltRounds = 10;

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

//
// POST /auth/signup (Register)
//
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Provide name, email, and password" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Provide a valid email address." });
  }

  const passwordRegex = /(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,}/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message:
        "Password must have at least 6 characters and contain at least one number, one lowercase, and one uppercase letter.",
    });
  }

  try {
    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (foundUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    res
      .status(201)
      .json({ id: newUser.id, name: newUser.name, email: newUser.email });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//
// POST /auth/login (Login)
//
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Provide email and password." });
  }

  try {
    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) {
      return res.status(401).json({ message: "User not found." });
    }

    const passwordCorrect = await bcrypt.compare(password, foundUser.password);
    if (!passwordCorrect) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    const payload = {
      id: foundUser.id,
      email: foundUser.email,
      name: foundUser.name,
    };
    const authToken = jwt.sign(payload, process.env.TOKEN_SECRET, {
      algorithm: "HS256",
      expiresIn: "6h",
    });

    res.json({ authToken });
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//
// PUT /auth/password (Change Password)
//
router.put("/password", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Provide email and new password." });
  }

  try {
    const foundUser = await prisma.user.findUnique({ where: { email } });

    if (!foundUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//
// GET /auth/verify (Verify JWT)
//
router.get("/verify", isAuthenticated, (req, res) => {
  res.json(req.payload);
});

router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        posts: true,
      },
    });

    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// user history end point
router.get("/users/history/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) }, // Ensure ID is an integer
      select: { history: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.history || user.history.length === 0) {
      return res
        .status(200)
        .json({ message: "No history found for this user" });
    }

    // Parse JSON strings into objects before sending the response
    const parsedHistory = user.history.map((entry) => JSON.parse(entry));

    res.json(parsedHistory);
  } catch (err) {
    console.error("Error fetching user history:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// for clearing history of activity of user
router.delete("/users/history/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    // Verify user exists first
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Clear the history array
    await prisma.user.update({
      where: { id: Number(id) },
      data: {
        history: {
          set: [], // Empty array
        },
      },
    });

    res.status(200).json({
      status: "success",
      message: "History cleared successfully",
      count: 0,
    });
  } catch (err) {
    console.error("Error clearing history:", err);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

// get user toots from the Mastodon account
router.get("/users/toots/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = req.params.id;
    const instance = "mastodon.social";

    if (Number(userId) !== req.payload.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.payload.id },
      select: { mastodonToken: true },
    });

    if (!user?.mastodonToken) {
      return res.status(400).json({ error: "Mastodon token missing" });
    }

    const accountInfo = await axios.get(
      `https://${instance}/api/v1/accounts/verify_credentials`,
      { headers: { Authorization: `Bearer ${user.mastodonToken}` } }
    );

    const tootsResponse = await axios.get(
      `https://${instance}/api/v1/accounts/${accountInfo.data.id}/statuses`,
      { headers: { Authorization: `Bearer ${user.mastodonToken}` } }
    );

    const toots = await Promise.all(
      tootsResponse.data.map(async (toot) => ({
        id: toot.id,
        content: toot.content,
        createdAt: toot.created_at,
        sentiment: await getSentiment(toot.content),
      }))
    );

    res.json(toots);
  } catch (error) {
    console.error("Error fetching toots:", error);
    res.status(500).json({ error: "Failed to fetch toots" });
  }
});

// Edit a Mastodon toots
router.patch("/edit-toots/:tootId", isAuthenticated, async (req, res) => {
  const { status } = req.body;
  const { tootId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.payload.id },
      select: { mastodonToken: true },
    });

    if (!user?.mastodonToken) {
      return res.status(400).json({ error: "Mastodon token missing" });
    }
    const MASTODON_INSTANCE = "mastodon.social";

    // Update the toot on Mastodon
    const response = await axios.patch(
      `https://${MASTODON_INSTANCE}/api/v1/statuses/${tootId}`,
      { status },
      {
        headers: {
          Authorization: `Bearer ${user?.mastodonToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const sentiment = await getSentiment(status);

    const responseData = {
      ...response.data,
      content: status,
      sentiment: sentiment,
    };

    res.json(responseData);
  } catch (error) {
    console.error(
      "Error editing status:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      error: error.response?.data || "Failed to edit status",
    });
  }
});

// delete user toots from the Mastodon account
router.delete("/toots/:tootId", isAuthenticated, async (req, res) => {
  try {
    const instance = "mastodon.social";
    const tootId = req.params.tootId;

    const user = await prisma.user.findUnique({
      where: { id: req.payload.id },
      select: { mastodonToken: true },
    });

    if (!user?.mastodonToken) {
      return res.status(400).json({ error: "Mastodon token missing" });
    }

    await axios.delete(`https://${instance}/api/v1/statuses/${tootId}`, {
      headers: { Authorization: `Bearer ${user.mastodonToken}` },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting toot:", error);
    res.status(500).json({ error: "Failed to delete toot" });
  }
});

// DELETE /auth/users/:id (Delete User - Requires Authentication)
//
router.delete("/users/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const userIdFromToken = req.payload.id; // Extract user ID from JWT token

  if (Number(id) !== userIdFromToken) {
    return res
      .status(403)
      .json({ message: "Unauthorized to delete this account" });
  }

  try {
    await prisma.user.delete({
      where: { id: Number(id) }, // Ensure id is treated as an integer
    });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
