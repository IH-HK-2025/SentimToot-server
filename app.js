// ℹ️ Gets access to environment variables/settings
// https://www.npmjs.com/package/dotenv
require("dotenv").config();

// Handles http requests (express is node js framework)
// https://www.npmjs.com/package/express
const express = require("express");

const app = express();

// ℹ️ This function is getting exported from the config folder. It runs most pieces of middleware
require("./config")(app);

// 👇 Start handling routes here
const indexRoutes = require("./routes/index.routes");
const userRoutes = require("./routes/user.routes");
const tokenRoutes = require("./routes/token.routes");
const trendsRoutes = require("./routes/trends.routes");

app.use("/api", indexRoutes);
app.use("/api/auth", userRoutes);
app.use("/api/user", tokenRoutes);
app.use("/api/trends", trendsRoutes);

// ❗ To handle errors. Routes that don't exist or errors that you handle in specific routes
require("./error-handling")(app);

module.exports = app;
