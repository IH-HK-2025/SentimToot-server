const app = require("./app");
const { withDB } = require("./db"); // Import the withDB function

const PORT = process.env.PORT || 5005;

// Connect to the database and start the server
withDB(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
