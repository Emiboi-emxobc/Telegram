// server.js — deploy-ready
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// ---------- ROUTES ----------
import "./routes.js";       // main API routes
import subModule from "./sub.js";       // subscriptions
import "./bot.js";                      // Telegram bot (auto-start)

// ---------- EXPRESS SETUP ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- MOUNT ROUTES ----------


// ---------- MONGODB ----------
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexa";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log("✅ MongoDB connected");

    // Subscription module
    if (typeof subModule === "function") {
      subModule(app);  // attach subscription routes
    } else {
      app.use("/api/subscriptions", subModule);
    }

    // ---------- START SERVER ----------
    const PORT = process.env.PORT || 7700;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ---------- GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});