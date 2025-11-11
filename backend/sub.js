// sub.js — Manual subscription + referral + 3-day trial + pre-expiry notification
const mongoose = require("mongoose");
const express = require("express");
const nodeCron = require("node-cron");
const axios = require("axios");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// ---------- SCHEMAS ----------
const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true }, // "trial" or "paid"
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);
const Admin = mongoose.model("Admin");
const Activity = mongoose.models.Activity || mongoose.model("Activity", new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  action: String,
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}));

// ---------- TELEGRAM ----------
async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId || ADMIN_CHAT_ID,
      text,
      parse_mode: "Markdown"
    });
  } catch (e) {
    console.warn("Telegram send failed:", e.message);
  }
}

// ---------- SUBSCRIPTION LOGIC ----------
async function activateSubscription(sub, enableReferral = false) {
  if (sub.status === "active") return sub;

  sub.status = "active";
  await sub.save();

  const admin = await Admin.findById(sub.adminId);
  if (admin) {
    admin.isPaid = true;
    admin.paidUntil = sub.expiresAt;
    admin.referralEnabled = enableReferral;
    await admin.save();

    await sendTelegram(admin.chatId, `🎉 Hi ${admin.username || "Admin"}! Subscription active${enableReferral ? " and referral enabled ✅" : ""}. Expires: ${sub.expiresAt}`);

    await Activity.create({ adminId: admin._id, action: "subscription_activated", details: { tier: sub.tier, referral: enableReferral } });
  }

  return sub;
}

async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (admin) {
      admin.isPaid = false;
      admin.paidUntil = null;
      admin.referralEnabled = false;
      await admin.save();

      await sendTelegram(admin.chatId, `⚠️ Your trial/subscription has expired. Referral features disabled.`);
      await Activity.create({ adminId: admin._id, action: "subscription_expired", details: { tier: sub.tier } });
    }
  }
}

// --- NEW: Pre-expiry reminder for 3-day trial ---
async function notifyTrialAdmins() {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now
  const trials = await Subscription.find({
    tier: "trial",
    status: "active",
    expiresAt: { $lte: reminderTime }
  });

  for (const sub of trials) {
    const admin = await Admin.findById(sub.adminId);
    if (admin) {
      await sendTelegram(admin.chatId, `💡 Hi ${admin.username || "Admin"}, your 3-day free trial will expire on ${sub.expiresAt}. Make sure you have funds ready to continue your subscription.`);
      await Activity.create({ adminId: admin._id, action: "trial_pre_expiry_reminder", details: { expiresAt: sub.expiresAt } });
    }
  }
}

// ---------- ROUTES ----------
module.exports = function(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/", router);

  // --- 3-day trial ---
  router.post("/subscriptions/trial", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + 3 * 24 * 60 * 60 * 1000);

      const sub = await Subscription.create({ adminId, tier: "trial", startsAt, expiresAt, price: 0, status: "active" });

      const admin = await Admin.findById(adminId);
      if (admin) {
        admin.isPaid = true;
        admin.paidUntil = expiresAt;
        admin.referralEnabled = false;
        await admin.save();

        await sendTelegram(admin.chatId, `🎉 Welcome ${admin.username || "Admin"}! Your 3-day trial starts now. Referral disabled by default. Expires: ${expiresAt}`);
        await Activity.create({ adminId: admin._id, action: "trial_started", details: { expiresAt } });
      }

      res.json({ success: true, subscriptionId: sub._id, expiresAt });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Manual approval by username ---
  router.post("/subscriptions/approve", verifyToken, async (req, res) => {
    try {
      const { username, tier = "paid", price = 1000, durationDays = 30, enableReferral = true } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "username required" });

      const admin = await Admin.findOne({ username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const sub = await Subscription.create({ adminId: admin._id, tier, startsAt, expiresAt, price, status: "active" });

      await activateSubscription(sub, enableReferral);

      res.json({ success: true, message: "Subscription activated", subscriptionId: sub._id, expiresAt });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Subscription status ---
  router.get("/subscriptions/status/:adminId", async (req, res) => {
    try {
      const { adminId } = req.params;
      const admin = await Admin.findById(adminId);
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      res.json({
        isPaid: !!admin.isPaid,
        paidUntil: admin.paidUntil,
        referralEnabled: !!admin.referralEnabled
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Cron jobs ---
  if (!global.__SUBS_CRON_STARTED) {
    // Expire subscriptions every 10 minutes
    nodeCron.schedule("*/10 * * * *", expireSubscriptions);

    // Notify trial admins 24h before expiration, run hourly
    nodeCron.schedule("0 * * * *", notifyTrialAdmins);

    global.__SUBS_CRON_STARTED = true;
  }

  console.log("✅ Subscriptions module ready (manual + trial + referral + pre-expiry notifications)");
  return router;
};