const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const requireAuth = require("./middleware/auth");

//load environment configurations
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

//middleware configuration
app.use(cors());
app.use(express.json()); //parse incoming JSON requests

//mount modular endpoint routes
app.use("/api/market", requireAuth, require("./routes/market"));
app.use("/api/watchlist", require("./routes/watchlist"));
app.use("/api/ai", requireAuth, require("./routes/ai"));

//global error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  res.status(500).json({ error: "Internal Server Error" });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 InnovestAI API running smoothly on port ${port}`);
  });
}

module.exports = app;
