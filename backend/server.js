// server.js — NEXA ULTRA (Telegram Integrated) — PART 1/3
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import axios from "axios";
import bcrypt from "bcryptjs";
import { v2 as cloudinary } from "cloudinary";
import nodeCron from "node-cron";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

import Admin from "./models/Admin.js";
import Site from './models/Site.js';
import { Subscription, RenewalRequest } from './models/sub.js';
import Student from './models/Child.js';
import Referral from "./models/Referral.js";
import Activity from "./models/Activity.js";
import subRoutes from "./sub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// ---------- CONFIG ----------
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "nexa_mini";
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const DEFAULT_AVATAR_URL = process.env.DEFAULT_AVATAR_URL || "";
const DEFAULT_ADMIN_PHONE = process.env.DEFAULT_ADMIN_PHONE || "09122154145";
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin";

// ---------- GLOBAL TELEGRAM BOT ----------
import TelegramBot from "node-telegram-bot-api";
export const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// sendTelegram helper (single global bot)
export async function sendTelegram(chatId, text) {
  try {
    const target = chatId || ADMIN_CHAT_ID;
    if (!target) return console.warn("No chatId to send Telegram");
    await bot.sendMessage(target, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.warn("Telegram send failed:", err?.response?.data || err?.message);
  }
}

// ---------- CORS ----------
const allowedOrigins = [
  "https://aminpanel.vercel.app",
  "https://cctv-ujg4.vercel.app",
  "http://localhost:7700"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (!allowedOrigins.includes(origin)) {
      return callback(new Error(`❌ CORS policy does not allow access from: ${origin}`), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ---------- MONGO ----------
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB connected");
    ensureDefaultAdmin().catch(err => console.error("ensureDefaultAdmin:", err));
  })
  .catch((err) => console.error("❌ MongoDB connection failed:", err.message));

// ---------- CLOUDINARY ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || "",
  api_key: process.env.CLOUDINARY_KEY || "",
  api_secret: process.env.CLOUDINARY_SECRET || "",
});

// ---------- MULTER ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- HELPERS ----------
function formatPhone(phone) {
  if (!phone) return "";
  const digits = phone.toString().replace(/\D/g, "");
  const localPart = digits.slice(-10);
  if (localPart.length !== 10) throw new Error("Invalid phone number");
  return "234" + localPart;
}

async function hashPassword(pw) { return bcrypt.hash(pw, 10); }

function generateCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

async function generateUniqueUsername(fn = "user", ln = "nexa") {
  const base = (fn + ln).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "usern";
  for (let i = 0; i < 6; i++) {
    const name = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await Admin.findOne({ username: name }))) return name;
  }
  return base + Date.now();
}

function escapeMarkdown(text = "") {
  return text.toString().replace(/([_*[\]()~>#+\-=|{}.!`])/g, "\\$1");
}

// Cloudinary upload helper
function uploadToCloudinaryBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

// Get location via ipwho.is
async function getLocation(ip) {
  try {
    if (!ip) return {};
    const clean = (ip || "").split(",")[0].trim();
    const { data } = await axios.get(`https://ipwho.is/${clean}`, { timeout: 3000 });
    if (!data || data.success === false) return {};
    return {
      city: data.city,
      region: data.region,
      country: data.country,
      country_code: data.country_code,
      flag: data.flag || {}
    };
  } catch (err) {
    console.warn("getLocation failed:", err?.response?.status || err?.message);
    return {};
  }
}

// ---------- AUTH MIDDLEWARE ----------
export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
};

// updateLastSeen middleware
export async function updateLastSeen(req, res, next) {
  try {
    if (req.userId) {
      await Admin.findByIdAndUpdate(req.userId, { lastSeen: new Date() }).catch(() => null);
    }
  } catch (err) {
    console.warn("Couldn't update last seen:", err.message);
  }
  next();
}

// ---------- SUB MODULE ----------
if (typeof subRoutes === "function") subRoutes(app, { verifyToken, sendTelegram });

// ---------- DEFAULT ADMIN BOOTSTRAP ----------
async function ensureDefaultAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return;
    const username = DEFAULT_ADMIN_USERNAME;
    let phone = DEFAULT_ADMIN_PHONE;
    try { phone = formatPhone(phone); } catch(e){ console.warn("Default admin phone invalid."); }
    const password = await hashPassword("024486");
    const referralCode = "seed_" + Date.now();
    const a = await Admin.create({
      username,
      firstname: "Nexa",
      lastname: "Admin",
      phone,
      password,
      referralCode,
      avatar: DEFAULT_AVATAR_URL,
      chatId: ADMIN_CHAT_ID,
      isPaid: true
    });
    await Referral.create({ adminId: a._id, code: referralCode, type: "admin", referrals: [] });
    console.log("✅ Default admin created:", username);
  } catch (err) {
    console.error("ensureDefaultAdmin failed:", err);
  }
}

// ---------- ROOT ROUTE ----------
app.get("/", (_, res) => res.json({ success: true, message: "Nexa Ultra backend active (Telegram)" }));

// ---------- ADMIN REGISTER ROUTE (start of admin routes, Part 1/3) ----------
app.post("/admin/register", async (req, res) => {
  try {
    let { firstname, lastname, phone, password, chatId, referredByCode } = req.body || {};
    let isAdmin = false;

    if (!firstname || !lastname || !phone || !password) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    try { phone = formatPhone(phone); } catch(err){ return res.status(400).json({ success:false, error:"Invalid phone" }); }

    // Super admin check
    let candTag = "cand";
    try {
      if (phone === formatPhone(DEFAULT_ADMIN_PHONE) && chatId === ADMIN_CHAT_ID) {
        candTag = "admin";
        isAdmin = true;
      }
    } catch(e){}

    // Prevent duplicates
    const exist = await Admin.findOne({ phone });
    if (exist) return res.status(400).json({ success: false, error: "Phone already used" });

    const username = await generateUniqueUsername(firstname, lastname);
    const hash = await hashPassword(password);
    const refCode = generateCode(6);

    const admin = await Admin.create({
      username,
      firstname,
      lastname,
      phone,
      referralCode: refCode || "direct",
      password: hash,
      chatId: chatId || "",
      isAdmin,
      candTag,
      avatar: DEFAULT_AVATAR_URL,
      isPaid: true
    });

    await Referral.create({ adminId: admin._id, code: refCode, type: "admin", referrals: [] });

    // handle referredByCode
    if (referredByCode) {
      const inviterRef = await Referral.findOne({ code: referredByCode });
      if (inviterRef && inviterRef.adminId.toString() !== admin._id.toString()) {
        inviterRef.referrals = inviterRef.referrals || [];
        inviterRef.referrals.push(admin._id);
        await inviterRef.save();

        const inviterAdmin = await Admin.findById(inviterRef.adminId);
        if (inviterAdmin) await sendTelegram(inviterAdmin.chatId || ADMIN_CHAT_ID, `👋 Yo ${inviterAdmin.username}, someone registered using your referral code!`);
      }
    }

    // Auto trial
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    await Subscription.create({
      adminId: admin._id,
      tier: "trial",
      startsAt: new Date(),
      expiresAt,
      price: 0,
      status: "active",
    });

    admin.isPaid = true;
    admin.trialActive = true;
    admin.paidUntil = expiresAt;
    await admin.save();

    await sendTelegram(ADMIN_CHAT_ID, `✅ New admin registered: *${firstname} ${lastname}* (${username})`);
    if (admin.chatId) await sendTelegram(admin.chatId, `🎉 Hi ${firstname}, welcome! Your referral code: *${refCode}*\n🆓 Free trial active until ${expiresAt.toUTCString()}`);

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      token,
      admin: { username, firstname, lastname, phone, trialExpires: expiresAt, referralCode: refCode }
    });

  } catch (e) {
    console.error("admin/register error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Registration failed: " + (e && e.message) });
  }
});
// ---------- ADMIN LOGIN ----------
app.post("/admin/login", async (req, res) => {
  try {
    let { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, error: "Missing fields" });
    try { phone = formatPhone(phone); } catch(err){ return res.status(400).json({ success:false, error:"Invalid phone" }); }

    const admin = await Admin.findOne({ phone });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ success: false, error: "Wrong password" });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });

    await sendTelegram(ADMIN_CHAT_ID, `🔑 Admin login: ${admin.firstname} ${admin.lastname} (${admin.username})`);

    res.json({ success: true, token, admin: { username: admin.username, firstname: admin.firstname, lastname: admin.lastname, phone: admin.phone } });
  } catch (err) {
    console.error("admin/login error:", err.message);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// ---------- ADMIN PROFILE ----------
app.get("/admin/profile", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    res.json({ success: true, admin });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ADMIN AVATAR ----------
app.post("/admin/avatar", verifyToken, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const result = await uploadToCloudinaryBuffer(req.file.buffer, { folder: CLOUDINARY_FOLDER });

    const admin = await Admin.findByIdAndUpdate(req.userId, { avatar: result.secure_url }, { new: true });
    res.json({ success: true, avatar: admin.avatar });
  } catch (err) {
    console.error("admin/avatar error:", err.message);
    res.status(500).json({ success: false, error: "Avatar upload failed" });
  }
});

// ---------- STUDENT REGISTER ----------
app.post("/student/register", async (req, res) => {
  try {
    let { firstname, lastname, phone, referredByCode } = req.body || {};
    if (!firstname || !lastname || !phone) return res.status(400).json({ success: false, error: "Missing fields" });

    try { phone = formatPhone(phone); } catch(err){ return res.status(400).json({ success:false, error:"Invalid phone" }); }

    const exist = await Student.findOne({ phone });
    if (exist) return res.status(400).json({ success: false, error: "Phone already used" });

    const username = await generateUniqueUsername(firstname, lastname);
    const refCode = generateCode(6);

    const student = await Student.create({
      username,
      firstname,
      lastname,
      phone,
      referralCode: refCode,
      avatar: DEFAULT_AVATAR_URL
    });

    if (referredByCode) {
      const inviterRef = await Referral.findOne({ code: referredByCode });
      if (inviterRef) {
        inviterRef.referrals = inviterRef.referrals || [];
        inviterRef.referrals.push(student._id);
        await inviterRef.save();

        const inviterAdmin = await Admin.findById(inviterRef.adminId);
        if (inviterAdmin) await sendTelegram(inviterAdmin.chatId || ADMIN_CHAT_ID, `👋 Yo ${inviterAdmin.username}, a student registered using your referral code!`);
      }
    }

    await sendTelegram(ADMIN_CHAT_ID, `🎓 New student registered: *${firstname} ${lastname}* (${username})`);
    res.json({ success: true, student: { username, firstname, lastname, phone, referralCode: refCode } });
  } catch (err) {
    console.error("student/register error:", err.message);
    res.status(500).json({ success: false, error: "Student registration failed" });
  }
});

// ---------- STUDENT LIST ----------
app.get("/students", verifyToken, async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- REFERRAL LIST ----------
app.get("/referrals/:adminId", verifyToken, async (req, res) => {
  try {
    const { adminId } = req.params;
    const referrals = await Referral.find({ adminId }).populate("referrals", "firstname lastname username");
    res.json({ success: true, referrals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- VOTING & ACTIVITY ----------
app.post("/vote", verifyToken, async (req, res) => {
  try {
    const { studentId, voteType } = req.body;
    if (!studentId || !voteType) return res.status(400).json({ success: false, error: "Missing fields" });

    const activity = await Activity.create({
      adminId: req.userId,
      studentId,
      type: voteType,
      timestamp: new Date()
    });

    await sendTelegram(ADMIN_CHAT_ID, `🗳️ Admin voted: ${voteType} for student ${studentId}`);

    res.json({ success: true, activity });
  } catch (err) {
    console.error("vote error:", err.message);
    res.status(500).json({ success: false, error: "Voting failed" });
  }
});

// ---------- SUBSCRIPTION CHECK ----------
app.get("/subscription/status", verifyToken, async (req, res) => {
  try {
    const active = await Subscription.findOne({
      adminId: req.userId,
      status: "active",
      expiresAt: { $gt: new Date() }
    });
    res.json({ success: true, active: !!active, expiresAt: active?.expiresAt || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ADMIN BROADCAST ----------
app.post("/admin/broadcast", verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "Missing message" });

    const allAdmins = await Admin.find();
    for (const a of allAdmins) {
      if (a.chatId) await sendTelegram(a.chatId, message);
    }

    res.json({ success: true, sentTo: allAdmins.length });
  } catch (err) {
    console.error("broadcast error:", err.message);
    res.status(500).json({ success: false, error: "Broadcast failed" });
  }
});

// ---------- ACTIVITY LOG ----------
app.get("/activities", verifyToken, async (req, res) => {
  try {
    const logs = await Activity.find().sort({ timestamp: -1 }).populate("adminId studentId", "username firstname lastname");
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ---------- CRON JOBS ----------

// Example: daily cleanup or subscription checks
nodeCron.schedule("0 0 * * *", async () => {
  try {
    console.log("⏱ Running daily subscription check...");
    const now = new Date();
    const expiredSubs = await Subscription.find({ expiresAt: { $lt: now }, status: "active" });
    for (const sub of expiredSubs) {
      sub.status = "expired";
      await sub.save();
      const admin = await Admin.findById(sub.adminId);
      if (admin) {
        await sendTelegram(admin.chatId || process.env.ADMIN_CHAT_ID, `⚠️ Your subscription expired on ${sub.expiresAt.toUTCString()}`);
      }
    }
  } catch (err) {
    console.error("Daily cron error:", err.message || err);
  }
});

// ---------- ERROR HANDLING ----------
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack || err);
  res.status(500).json({ success: false, error: "Server error", details: err.message || err });
});

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// ---------- BOOTSTRAP DEFAULT ADMIN ----------
async function ensureDefaultAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return;

    const username = process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin";
    let phone = process.env.DEFAULT_ADMIN_PHONE || "09122154145";
    try { phone = formatPhone(phone); } catch(e){ console.warn("Default admin phone invalid, using raw."); }

    const password = await bcrypt.hash("024486", 10);
    const referralCode = "seed_" + Date.now();

    const admin = await Admin.create({
      username,
      firstname: "Nexa",
      lastname: "Admin",
      phone,
      password,
      referralCode,
      avatar: process.env.DEFAULT_AVATAR_URL || "",
      chatId: process.env.ADMIN_CHAT_ID || "",
      isPaid: true
    });

    await Referral.create({ adminId: admin._id, code: referralCode, type: "admin", referrals: [] });

    console.log("✅ Default admin created:", username);
  } catch (err) {
    console.error("ensureDefaultAdmin error:", err);
  }
}

// ---------- SERVER START ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Nexa Ultra running on port ${PORT}`);
  await ensureDefaultAdmin();
});