import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "./models/Admin.js";
import Student from "./models/Child.js";
import Referral from "./models/Referral.js";
import Activity from "./models/Activity.js";
import Site from "./models/Site.js";
import { Subscription, RenewalRequest } from "./models/sub.js";
import {
  verifyToken,
  hashPassword,
  formatPhone,
  generateUniqueUsername,
  generateCode,
  escapeMarkdown,
  uploadToCloudinaryBuffer,
  getLocation,
  sendTelegram,
} from "./helpers.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const DEFAULT_AVATAR_URL = process.env.DEFAULT_AVATAR_URL || "";
const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || "nexa_admin";

// ---------- ADMIN REGISTER ----------
router.post(" /register", async (req, res) => {
  try {
    let { firstname, lastname, phone, password, chatId, referredByCode } = req.body || {};
    if (!firstname || !lastname || !phone || !password)
      return res.status(400).json({ success: false, error: "Missing fields" });

    phone = formatPhone(phone);
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
      referralCode: refCode,
      password: hash,
      chatId: chatId || "",
      avatar: DEFAULT_AVATAR_URL,
      isPaid: true,
    });

    await Referral.create({ adminId: admin._id, code: refCode, type: "admin", referrals: [] });
    await Subscription.create({
      adminId: admin._id,
      tier: "trial",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      price: 0,
      status: "active",
    });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    await sendTelegram(process.env.ADMIN_CHAT_ID, `✅ New admin registered: ${username}`);
    res.json({ success: true, token, admin: { username, firstname, lastname, phone, referralCode: refCode } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ADMIN LOGIN ----------
router.post("/login", async (req, res) => {
  try {
    let { phone, password } = req.body || {};
    phone = formatPhone(phone);
    const admin = await Admin.findOne({ phone });
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
    await sendTelegram(process.env.ADMIN_CHAT_ID, `🔐 Admin ${admin.username} logged in`);
    res.json({ success: true, token, admin });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- ADMIN UPDATE ----------
router.post("/update", verifyToken, async (req, res) => {
  try {
    const { bio, slogan, chatId } = req.body;
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    if (bio !== undefined) admin.bio = bio;
    if (slogan !== undefined) admin.slogan = slogan;
    if (chatId !== undefined) admin.chatId = chatId;
    await admin.save();
    await sendTelegram(process.env.ADMIN_CHAT_ID, `📝 Admin updated profile: ${admin.username}`);
    res.json({ success: true, admin });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- ADMIN AVATAR ----------
router.post("/avatar", verifyToken, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    const result = await uploadToCloudinaryBuffer(req.file.buffer);
    const admin = await Admin.findById(req.userId);
    admin.avatar = result.secure_url;
    await admin.save();
    res.json({ success: true, avatar: admin.avatar });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- ADMIN BROADCAST ----------
router.post("/broadcast", verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    const admin = await Admin.findById(req.userId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

    const students = await Student.find({});
    for (let s of students) {
      await sendTelegram(s.chatId || admin.chatId, escapeMarkdown(message));
    }

    await Activity.create({
      adminId: admin._id,
      action: "broadcast",
      details: { message, count: students.length },
    });

    res.json({ success: true, sent: students.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- STUDENT REGISTER ----------
router.post("/register", async (req, res) => {
  try {
    const { username, password, referralCode, platform } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: "Missing username/password" });

    const existing = await Student.findOne({ username });
    if (existing) return res.status(400).json({ success: false, error: "Username exists" });

    let admin = null;
    if (referralCode) {
      const ref = await Referral.findOne({ code: referralCode });
      if (ref) admin = await Admin.findById(ref.adminId);
    }
    if (!admin) admin = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME }) || await Admin.findOne();
    if (!admin) return res.status(500).json({ success: false, error: "No admin available" });

    const hashed = await hashPassword(password);
    const student = await Student.create({
      username,
      password: hashed,
      adminId: admin._id,
      platform,
      studentId: generateCode(6),
      referrer: admin.username,
    });

    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const location = await getLocation(ip);
    await Activity.create({ adminId: admin._id, studentId: student._id, action: "student_register", details: { username, location } });
    await sendTelegram(admin.chatId || process.env.ADMIN_CHAT_ID, `🆕 Student registered: ${username}`);

    res.json({ success: true, studentId: student._id, admin: { username: admin.username, phone: admin.phone } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- STUDENT LOGIN ----------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const student = await Student.findOne({ username });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: student._id }, JWT_SECRET, { expiresIn: "7d" });
    const admin = await Admin.findById(student.adminId);
    await sendTelegram(admin.chatId || process.env.ADMIN_CHAT_ID, `🔐 Student ${username} logged in`);

    res.json({ success: true, token, student });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- SITE MANAGEMENT ----------
router.post("/site", verifyToken, async (req, res) => {
  try {
    const { url, name, ref } = req.body;
    const admin = await Admin.findById(req.userId);
    const site = await Site.create({ adminId: admin._id, url, name, ref });
    res.json({ success: true, site });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/site/:ref", verifyToken, async (req, res) => {
  try {
    const site = await Site.findOne({ ref: req.params.ref });
    if (!site) return res.status(404).json({ success: false, error: "Site not found" });
    res.json({ success: true, site });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- REFERRALS ----------
router.get("/referrals", verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId);
    const referrals = await Referral.find({ adminId: admin._id });
    res.json({ success: true, referrals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- SUBSCRIPTIONS ----------
router.get("/subscriptions", verifyToken, async (req, res) => {
  try {
    const subs = await Subscription.find({ adminId: req.userId });
    res.json({ success: true, subscriptions: subs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- RENEWAL REQUEST ----------
router.post("/renew", verifyToken, async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const request = await RenewalRequest.create({ subscriptionId, requestedAt: new Date() });
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- ACTIVITY LOG ----------
router.get("/activity", verifyToken, async (req, res) => {
  try {
    const logs = await Activity.find({ adminId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
