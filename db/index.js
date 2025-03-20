const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Function for database connection
const withDB = async (callback) => {
  try {
    await prisma.$connect();
    console.log("Connected to the database successfully!");
    callback();
  } catch (error) {
    console.error("Error connecting to the database:", error);
    process.exit(1);
  }
};

module.exports = { prisma, withDB };
