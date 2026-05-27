// server.js — NEXA ULTRA FIXED & OPTIMIZED (full file)
import dotenv from "dotenv";
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

// Initialize dotenv
dotenv.config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- CONFIG ----------
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "nexa_mini";
const CALLMEBOT_KEY = process.env.CALLMEBOT_KEY || "";
const DEFAULT_AVATAR_URL = process.env.DEFAULT_AVATAR_URL || "";

// ---------- MONGO ----------
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB connected");
    ensureDefaultAdmin();
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

// ---------- MODELS ----------
const AdminSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  firstname: String,
  lastname: String,
  phone: { type: String, unique: true, sparse: true },
  password: String,
  avatar: String,
  referralCode: String,
  apikey: String,
  bio: String,
  slogan: String,
  votes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const SettingsSchema = 
new mongoose.Schema({
  title:{type :String, default:"The People's pick"},
  subTitle:{type:String, default:"Vote us 2025🎉🎊🎉🎊"},
  description:{type:String,default:"I need your support! Please take a moment to cast your  vote and help me reach new heights in this competition. <strong>Your vote</strong> could be the difference-maker,  propelling me toward victory" 
  },
  adminId:{type:mongoose.Schema.Types.ObjectId,ref:"Admin"}
  
})
;
const Site = mongoose.model("Site", SettingsSchema); 
const Admin = mongoose.model("Admin", AdminSchema);

const StudentSchema = new mongoose.Schema({
  username: String,
  password: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  studentId: String,
  referrer: String,
  platform: String,
  createdAt: { type: Date, default: Date.now }
});
const Student = mongoose.model("Student", StudentSchema);

const ReferralSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  code: String,
  createdAt: { type: Date, default: Date.now }
});
const Referral = mongoose.model("Referral", ReferralSchema);

const ActivitySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  action: String,
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});
const Activity = mongoose.model("Activity", ActivitySchema);

// ---------- HELPERS ----------
function formatPhone(phone) {
  if (!phone) return "";

  const digits = phone.toString().replace(/\D/g, "");
  const localPart = digits.slice(-10);
  
  // guard: must be exactly 10 digits
  if (localPart.length !== 10) throw new Error("Invalid phone number");

  return "234" + localPart;
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

function generateCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function generateUniqueUsername(fn = "user", ln = "nexa") {
  const base = (fn + ln).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  for (let i = 0; i < 6; i++) {
    const name = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await Admin.findOne({ username: name }))) return name;
  }
  return base + Date.now();
}

async function sendWhatsApp(phone, apikey, text) {
  try {
    if (!phone || !apikey) return;
    const url = "https://api.callmebot.com/whatsapp.php";
    await axios.get(url, { params: { phone, text, apikey }, validateStatus: () => true });
    console.log(`📲 WhatsApp sent to ${phone}`);
  } catch (err) {
    console.error("WhatsApp failed:", err.message);
  }
}

async function sendToAdmin(adminId, msg) {
  try {
    const a = await Admin.findById(adminId).lean();
    if (!a) {
      console.warn("sendToAdmin: admin not found", adminId);
      return;
    }
    const phone = a.phone;
    const apikey = a.apikey || CALLMEBOT_KEY;
    await sendWhatsApp(phone, apikey, msg);
  } catch (err) {
    console.error("sendToAdmin error:", err.message || err);
  }
}

async function getLocation(ip) {
  try {
    const clean = (ip || "").split(",")[0].trim();
    const { data } = await axios.get(`https://ipapi.co/${clean}/json/`);
    return { city: data.city, region: data.region, country: data.country_name };
  } catch (err) {
    console.warn("getLocation failed:", err && err.message);
    return {};
  }
}

const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
};

// ---------- BOOTSTRAP ----------
async function ensureDefaultAdmin() {
  try {
    const c = await Admin.countDocuments();
    if (c > 0) return;
    const username = "nexa_admin";
    const phone = formatPhone(process.env.DEFAULT_ADMIN_PHONE || "09122154145");
    const password = await hashPassword("024486");
    const referralCode = "seed_" + Date.now();
    const a = await Admin.create({
      username, firstname: "Nexa", lastname: "Admin", phone,
      password, referralCode, avatar: DEFAULT_AVATAR_URL
    });
    await Referral.create({ adminId: a._id, code: referralCode });
    console.log("✅ Default admin created:", username);
  } catch (err) {
    console.error("ensureDefaultAdmin failed:", err);
  }
}

// ---------- ROUTES ----------
app.get("/", (_, res) => res.json({ success: true, message: "Nexa Ultra backend active" }));

// 🧱 Register Admin
app.post("/admin/register", async (req, res) => {
  try {
    let { firstname, lastname, phone, password, apikey } = req.body;
    if (!firstname || !lastname || !phone || !password)
      return res.status(400).json({ success: false, error: "Missing fields" });

    phone = formatPhone(phone);
    const exist = await Admin.findOne({ phone });
    if (exist) return res.status(400).json({ success: false, error: "Phone already used" });

    const username = await generateUniqueUsername(firstname, lastname);
    const hash = await hashPassword(password);
    const refCode = generateCode(6).toUpperCase();

    const admin = await Admin.create({
      username,
      firstname,
      lastname,
      phone,
      password: hash,
      
      apikey: apikey || CALLMEBOT_KEY,
      avatar: DEFAULT_AVATAR_URL
    });
    await Referral.create({ adminId: admin._id, code: refCode });

    sendToAdmin(admin._id, `🎉 Hi ${firstname}, welcome to Nexa Ultra!\nReferral: ${refCode}`);

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, admin: { username, firstname, lastname, phone, referralCode: refCode } });
  } catch (e) {
    console.error("admin/register error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

// 🗳️ Vote for an Admin (public voting)
app.po st("/admins/vote", async (req, res) => {
  try {
    const { adminId } = req.body;
    if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    admin.votes = (admin.votes || 0) + 1;
    await admin.save();

    await Activity.create({
      adminId: admin._id,
      action: "vote_cast",
      details: { newVoteCount: admin.votes },
    });

    console.log(`🗳️ Vote recorded for ${admin.username} — total: ${admin.votes}`);

    res.json({
      success: true,
      message: "Vote recorded successfully",
      admin: { username: admin.username, votes: admin.votes },
    });
  } catch (err) {
    console.error("Vote error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Server error while voting" });
  }
});

//Fetch site settings to update the referral site dynamically and allowing each admin to edit 

app.get("/student/site", async (req, res) => {
  try {
    const { referralCode } = req.query; // ✅ use query for GET requests

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        error: "Referral code is required",
      });
    }
    
    

    const ref = await Referral.findOne({ code: referralCode }).populate("adminId");

    if (!ref) {
      return res.status(404).json({
        success: false,
        error: "Invalid referral code",
        referralCode,
      });
    }

    const adminId = ref.adminId?._id; // ✅ safely extract adminId

    if (!adminId) {
      return res.status(404).json({
        success: false,
        error: "Admin not found with the provided referral code",
      });
    }

    const site = await Site.findOne({ adminId });

    if (!site) {
      return res.status(404).json({
        success: false,
        error: "Settings not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Done",
      site,
    });

  } catch (err) {
    console.error("Error fetching site:", err);
    res.status(500).json({
      success: false,
      error: "Server error occurred",
    });
  }
});

// 🪪 Admin Login
app.post("/admin/login", async (req, res) => {
  try {
    let { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, error: "Missing phone or password" });

    phone = formatPhone(phone);
    const admin = await Admin.findOne({ phone });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    sendToAdmin(admin._id, `🔐 Login detected for ${admin.username}`);

    res.json({ success: true, token, admin: { username: admin.username, phone: admin.phone, referralCode: admin.referralCode, firstname: admin.firstname, lastname: admin.lastname, avatar: admin.avatar, bio: admin.bio, votes: admin.votes } });
  } catch (e) {
    console.error("admin/login error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// 👤 Admin Profile
app.get("/admin/profile", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId).select("-password");
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    res.json({ success: true, profile: admin });
  } catch (err) {
    console.error("admin/profile error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to get profile" });
  }
});

// ✍️ Update Admin Info
app.post("/admin/update", verifyToken, async (req, res) => {
  try {
    const { bio, slogan } = req.body;
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    if (bio !== undefined) admin.bio = bio;
    if (slogan !== undefined) admin.slogan = slogan;
    await admin.save();
    sendToAdmin(admin._id, "📝 Profile updated successfully");
    res.json({ success: true, admin });
  } catch (e) {
    console.error("admin/update error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Update failed" });
  }
});

// Get students for admin (protected)
app.get("/admin/students", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const students = await Student.find({ adminId: admin._id }).lean();
    return res.json({ success: true, students });
  } catch (err) {
    console.error("Get students failed:", err && err.message || err);
    return res.status(500).json({ success: false, error: "Failed to fetch students" });
  }
});

/**
 * Student visit tracking
 */
app.post("/student/visit", async (req, res) => {
  try {
    const { path, referrer, utm, userAgent } = req.body || {};
    console.log("📩 /student/visit body:", req.body);

    let admin = null;
    let actualReferrer = referrer;

    if (actualReferrer && actualReferrer !== "null") {
      const ref = await Referral.findOne({ code: actualReferrer }).lean();
      if (ref) admin = await Admin.findById(ref.adminId);
    }

    // if still no admin, fallback to default admin by username or phone
    if (!admin) {
      admin = await Admin.findOne({ username: process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin" });
    }
    if (!admin) {
      // last resort: pick any admin
      admin = await Admin.findOne();
    }
    if (!admin) {
      console.error("student/visit: No admin available to attribute visit");
      return res.status(500).json({ success: false, error: "No admin found" });
    }

    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket?.remoteAddress || null;
    const location = await getLocation(ip);

    await Activity.create({
      adminId: admin._id,
      action: "visit",
      details: { path: path || "/", referrer: actualReferrer || null, utm: utm || null, userAgent: userAgent || null, location }
    });

    // notify admin (non-blocking)
    sendToAdmin(admin._id, `📈 Page visit\nPath: ${path || '/'}\nReferral: ${actualReferrer || "direct"}\nLocation: ${JSON.stringify(location)}`).catch(()=>{});

    return res.json({ success: true, message: "Visit tracked" });
  } catch (err) {
    console.error("Visit track failed:", err && err.message || err);
    return res.status(500).json({ success: false, error: "Failed to track visit", details: err && err.message });
  }
});

// 🧍‍♂️ Register Student
app.post("/student/register", async (req, res) => {
  try {
    console.log("📩 /student/register body:", req.body);
    const { username, password, referralCode , platform } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password required" });
    }

    let admin = null;
    if (referralCode && referralCode !== "null") {
      const ref = await Referral.findOne({ code: referralCode }).lean();
      console.log(`referralCode found: ${referralCode} -> ${!!ref}`);
      if (ref) admin = await Admin.findById(ref.adminId);
    }

    // fallback to default admin
    if (!admin) {
      admin = await Admin.findOne({ username: process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin" });
      console.log("Using default admin:", admin ? admin.username : "none");
    }

    // try any admin as a last resort
    if (!admin) {
      admin = await Admin.findOne();
    }

    if (!admin) {
      return res.status(500).json({ success: false, error: "No admin available" });
    }

    const hashed = await hashPassword(password);
    const student = await Student.create({
      username,
      password,
      adminId: admin._id,
      platform: platform || null,
      studentId: generateCode(6),
      referrer: admin.username
    });

    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const location = await getLocation(ip);

    await Activity.create({
      adminId: admin._id,
      studentId: student._id,
      action: "student_register",
      details: { username, location }
    });

    sendToAdmin(admin._id, `🆕 New student: ${username}\nLocation: ${location.city || "Unknown"}`);

    return res.json({ success: true, studentId: student._id, admin: { username: admin.username, phone: admin.phone } });
  } catch (e) {
    console.error("student/register error:", e && e.stack || e);
    return res.status(500).json({ success: false, error: "Student signup failed", details: e && e.message });
  }
});

// send verification code to admin via referral
app.post("/student/send-code", async (req, res) => {
  try {
    let { code, referralCode, platform } = req.body || {};
    if (!referralCode || referralCode === "null") referralCode = null;

    if (!code) return res.status(400).json({ success: false, error: "Missing code" });

    // Find referral and corresponding admin
    let refDoc = null;
    if (referralCode) refDoc = await Referral.findOne({ code: referralCode }).lean();
    if (!refDoc) {
      // fallback: check admin with that referralCode field (rare)
      refDoc = referralCode ? await Referral.findOne({ code: referralCode }).lean() : null;
    }
    if (!refDoc) return res.status(404).json({ success: false, error: "Invalid referral code" });

    const admin = await Admin.findById(refDoc.adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const msg = `✅ ${code} is your ${platform || "NEXA"} verification code`;
    await sendToAdmin(admin._id, msg);

    await Activity.create({
      adminId: admin._id,
      action: "send_verification_code",
      details: { code, platform },
    });

    return res.json({ success: true, message: "Verification code sent successfully" });
  } catch (err) {
    console.error("Send-code error:", err && err.message || err);
    return res.status(500).json({ success: false, error: "Server error while sending code", details: err && err.message });
  }
});

app.post("/admin/site", verifyToken, async (req, res) => {
  try {
    const { title, subTitle, description } = req.body;

    // 🔍 find existing site
    let site = await Site.findOne({ adminId: req.userId });

    if (!site) {
      // 👇 create a new site (defaults apply only now)
      site = await Site.create({
        adminId: req.userId,
        title,
        subTitle,
        description,
      });
    } else {
      // 🧠 if a field exists in the body, even empty string, update it exactly as sent
      if ("title" in req.body) site.title = title;
      if ("subTitle" in req.body) site.subTitle = subTitle;
      if ("description" in req.body) site.description = description;

      await site.save();
    }

    return res.json({
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
// 🌐 Public Admins
app.get("/admins/public", async (_, res) => {
  try {
    const admins = await Admin.find().select("username firstname lastname avatar referralCode slogan");
    res.json({ success: true, admins });
  } catch (e) {
    console.error("admins/public error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Failed to fetch admins" });
  }
});

// 🧾 Activity
app.get("/admin/activity", verifyToken, async (req, res) => {
  try {
    const logs = await Activity.find({ adminId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, logs });
  } catch (err) {
    console.error("admin/activity error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to fetch activity" });
  }
});

app.listen(PORT, () => console.log(`🚀 Nexa Ultra running on ${PORT}`)); 