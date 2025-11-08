// ✅ server.js — Full Telegram Integration Version

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";
import bodyParser from "body-parser";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// ================== DB CONNECT ==================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== CLOUDINARY ==================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

// ================== SCHEMAS ==================
const AdminSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  telegramId: { type: String, default: "" }, // 👈 New field for Telegram notifications
});

const ReferralSchema = new mongoose.Schema({
  code: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

const SettingsSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  title: { type: String, default: "The People's pick" },
  subTitle: { type: String, default: "Vote us 2025🎉🎊🎉🎊" },
  description: {
    type: String,
    default:
      "I need your support! Please take a moment to cast your vote and help me reach new heights in this competition. <strong>Your vote</strong> could be the difference-maker, propelling me toward victory",
  },
});

// ================== MODELS ==================
const Admin = mongoose.model("Admin", AdminSchema);
const Referral = mongoose.model("Referral", ReferralSchema);
const Site = mongoose.model("Site", SettingsSchema);

// ================== AUTH MIDDLEWARE ==================
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(403).json({ success: false, error: "Invalid token" });
  }
}

// ================== TELEGRAM NOTIFICATION HELPER ==================
async function notify(identity, message) {
  try {
    const admin =
      typeof identity === "string"
        ? await Admin.findById(identity)
        : identity;

    if (!admin || !admin.telegramId) {
      console.warn("⚠️ No Telegram ID found for admin:", admin?._id);
      return;
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const text = encodeURIComponent(message);

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${admin.telegramId}&text=${text}&parse_mode=HTML`;

    await axios.get(url);
    console.log(`📩 Telegram message sent to ${admin.name || admin._id}`);
  } catch (err) {
    console.error("❌ Error sending Telegram message:", err.message);
  }
}

// ================== ROUTES ==================

// 🧠 Admin site creation/update
app.post("/admin/site", verifyToken, async (req, res) => {
  try {
    const { title, subTitle, description } = req.body;
    let site = await Site.findOne({ adminId: req.userId });

    if (!site) {
      site = await Site.create({
        adminId: req.userId,
        title,
        subTitle,
        description,
      });
    } else {
      if ("title" in req.body) site.title = title;
      if ("subTitle" in req.body) site.subTitle = subTitle;
      if ("description" in req.body) site.description = description;
      await site.save();
    }

    await notify(req.userId, "✅ Your site settings were updated successfully!");

    res.json({
      success: true,
      message: "Site updated successfully",
      site,
    });
  } catch (err) {
    console.error("Error updating site:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong",
      details: err.message,
    });
  }
});

// 🌐 Student fetches site by referral
app.get("/student/site", async (req, res) => {
  try {
    const { referralCode } = req.body;
    const ref = await Referral.findOne({ code: referralCode });

    if (!ref)
      return res.json({
        success: false,
        error: "Invalid referral code",
        referralCode,
      });

    const adminId = ref.adminId;
    if (!adminId)
      return res.json({
        success: false,
        error: "Admin not found with provided referral code",
        status: 404,
      });

    const site = await Site.findOne({ adminId });
    if (!site)
      return res.json({
        success: false,
        error: "Settings not found",
        status: 404,
      });

    res.json({
      success: true,
      message: "Done",
      site,
    });
  } catch (err) {
    console.error("Error fetching student site:", err);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
});

// ✉️ Send code route — notify via Telegram
app.post("/send-code", async (req, res) => {
  try {
    const { referralCode, studentName } = req.body;

    const ref = await Referral.findOne({ code: referralCode });
    if (!ref)
      return res.json({ success: false, error: "Referral code not found" });

    const admin = await Admin.findById(ref.adminId);
    if (!admin)
      return res.json({ success: false, error: "Admin not found for referral" });

    const message = `🎯 New vote received from <b>${studentName}</b> using your referral code: <code>${referralCode}</code>`;
    await notify(admin, message);

    res.json({
      success: true,
      message: "Code sent and admin notified successfully!",
    });
  } catch (err) {
    console.error("Error in /send-code:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
  }
});

// ================== ROOT ==================
app.get("/", (req, res) => {
  res.send("✅ Nexa Server with Telegram Notifications is Live!");
});

// ================== START ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);