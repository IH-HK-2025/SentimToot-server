const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { isAuthenticated } = require("../middleware/jwt.middleware");

const router = express.Router();
const prisma = new PrismaClient();
const saltRounds = 10;

//
// POST /auth/signup (Register)
//
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Provide name, email, and password" });
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

    res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email });
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

    const payload = { id: foundUser.id, email: foundUser.email, name: foundUser.name };
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
      select: { id: true, name: true, email: true, createdAt: true, posts:true },
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
      return res.status(200).json({ message: "No history found for this user" });
    }

    // Parse JSON strings into objects before sending the response
    const parsedHistory = user.history.map((entry) => JSON.parse(entry));

    res.json(parsedHistory);
  } catch (err) {
    console.error("Error fetching user history:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// user toot end point 

router.get("/users/toots/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      select: { toots: true }, // Select the related 'toots' from the database
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.toots || user.toots.length === 0) {
      return res.status(200).json({ message: "No toots found for this user" });
    }

    res.json(user.toots); // No need to parse, Prisma already returns an array
  } catch (err) {
    console.error("Error fetching user toots:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// for clearing history of activity of user

router.get("/users/history/:id/empty", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      select: { history: true },
    });

    if (!user) {
      return res.status(404).json({ 
        status: "error",
        message: "User not found",
        isEmpty: null 
      });
    }

    const isEmpty = !user.history || user.history.length === 0;
    
    res.status(200).json({
      status: "success",
      message: isEmpty ? "History is empty" : "History contains items",
      isEmpty: isEmpty,
      count: isEmpty ? 0 : user.history.length
    });

  } catch (err) {
    console.error("Error checking history:", err);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      isEmpty: null 
    });
  }
});

// for clearing toots history 

router.get("/users/toots/:id/empty", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      select: { toots: true },
    });

    if (!user) {
      return res.status(404).json({ 
        status: "error",
        message: "User not found",
        isEmpty: null 
      });
    }

    const isEmpty = !user.toots || user.toots.length === 0;
    
    res.status(200).json({
      status: "success",
      message: isEmpty ? "Toots array is empty" : "Toots array contains items",
      isEmpty: isEmpty,
      count: isEmpty ? 0 : user.toots.length
    });

  } catch (err) {
    console.error("Error checking toots:", err);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      isEmpty: null 
    });
  }
});



// DELETE /auth/users/:id (Delete User - Requires Authentication)
//
router.delete("/users/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const userIdFromToken = req.payload.id; // Extract user ID from JWT token

  if (Number(id) !== userIdFromToken) {
    return res.status(403).json({ message: "Unauthorized to delete this account" });
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
