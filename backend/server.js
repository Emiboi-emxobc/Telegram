// server.js — deploy-ready
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";


// ---------- ROUTES ----------
import routes from "./routes.js";       // main API routes
import subModule from "./sub.js";       // subscriptions
import initBot from "./bot.js";         // Telegram bot (exported as function)

// ---------- EXPRESS SETUP ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev")); // logs requests in dev-friendly format

// ---------- MOUNT ROUTES ----------
app.use("/api", routes);                   // main API routes prefixed with /api

// ---------- MONGODB ----------
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexa";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Mount subscription routes after DB ready
    if (typeof subModule === "function") {
      subModule(app); // call function to attach /subscriptions routes
    } else {
      app.use("/api/subscriptions", subModule); // if router export
    }

    // Initialize Telegram bot after DB ready
    if (typeof initBot === "function") initBot();

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