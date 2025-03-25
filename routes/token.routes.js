const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { isAuthenticated } = require("../middleware/jwt.middleware");

const router = express.Router();
const prisma = new PrismaClient();

router.post("/token", isAuthenticated, async (req, res) => {
  const { mastodonToken } = req.body;
  const userId = req.payload.id;

  //   console.log("User ID:", userId);
  //   console.log("Mastodon Token:", mastodonToken);

  if (!mastodonToken) {
    return res.status(400).json({ error: "Mastodon token is required" });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { mastodonToken },
    });

    res
      .status(200)
      .json({ message: "Token saved successfully", user: updatedUser });
  } catch (error) {
    console.error("Error saving Mastodon token:", error.message);
    res.status(500).json({ error: "Failed to save Mastodon token" });
  }
});

router.get("/token", isAuthenticated, async (req, res) => {
  const userId = req.payload.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mastodonToken: true },
    });

    if (!user || !user.mastodonToken) {
      return res.status(404).json({ error: "Mastodon token not found" });
    }

    res.status(200).json({ mastodonToken: user.mastodonToken });
  } catch (error) {
    console.error("Error retrieving Mastodon token:", error.message);
    res.status(500).json({ error: "Failed to retrieve Mastodon token" });
  }
});

module.exports = router;
