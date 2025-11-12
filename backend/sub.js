// sub.js — Manual + Trial + Referral + Expiry Notification + Broadcast + ₦3,000/week pricing
const mongoose = require("mongoose");
const express = require("express");
const nodeCron = require("node-cron");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- MODELS ----------
const Admin = mongoose.model("Admin");

const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true }, // trial | paid
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const Subscription =
  mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

const Activity =
  mongoose.models.Activity ||
  mongoose.model(
    "Activity",
    new mongoose.Schema({
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
      action: String,
      details: { type: mongoose.Schema.Types.Mixed, default: {} },
      createdAt: { type: Date, default: Date.now }
    })
  );

// ---------- TELEGRAM ----------
async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId || ADMIN_CHAT_ID,
      text,
      parse_mode: "Markdown"
    });
  } catch (err) {
    console.warn("Telegram send failed:", err.message);
  }
}

// ---------- HELPERS ----------
function addDays(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now;
}

// ---------- SUBSCRIPTION CORE ----------
async function activateSubscription(sub, enableReferral = false) {
  sub.status = "active";
  await sub.save();

  const admin = await Admin.findById(sub.adminId);
  if (!admin) return;

  admin.isPaid = true;
  admin.paidUntil = sub.expiresAt;
  admin.referralEnabled = enableReferral;
  await admin.save();

  await sendTelegram(
    admin.chatId,
    `✅ Hi ${admin.username || "Admin"}! Your *${sub.tier.toUpperCase()}* subscription is now active ${
      enableReferral ? "with referral enabled ✅" : ""
    }.\n\n💰 Price: ₦${sub.price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`
  );

  await sendTelegram(
    ADMIN_CHAT_ID,
    `📢 *New Subscription*\n👤 ${admin.username}\n💰 ₦${sub.price.toLocaleString()}\n📅 ${sub.tier} active till ${sub.expiresAt.toUTCString()}`
  );

  await Activity.create({
    adminId: admin._id,
    action: "subscription_activated",
    details: { tier: sub.tier, referral: enableReferral, price: sub.price }
  });

  return sub;
}

// ---------- AUTO EXPIRE ----------
async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({
    status: "active",
    expiresAt: { $lte: now }
  });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    admin.isPaid = false;
    admin.paidUntil = null;
    admin.referralEnabled = false;
    await admin.save();

    await sendTelegram(
      admin.chatId,
      `⚠️ Your ${sub.tier} subscription has expired.\nReferral and premium features are now disabled.`
    );

    await sendTelegram(
      ADMIN_CHAT_ID,
      `🚨 *Subscription Expired*\n👤 ${admin.username}\nTier: ${sub.tier}\nExpired: ${new Date().toUTCString()}`
    );

    await Activity.create({
      adminId: admin._id,
      action: "subscription_expired",
      details: { tier: sub.tier }
    });
  }
}

// ---------- TRIAL REMINDER ----------
async function notifyTrialAdmins() {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const trials = await Subscription.find({
    tier: "trial",
    status: "active",
    expiresAt: { $lte: reminderTime }
  });

  for (const sub of trials) {
    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    await sendTelegram(
      admin.chatId,
      `💡 Hey ${admin.username || "Admin"}, your *free trial* will expire on ${sub.expiresAt.toUTCString()}.\n💸 Renewal cost: ₦3,000/week.\nPlease prepare payment to continue access.`
    );

    await Activity.create({
      adminId: admin._id,
      action: "trial_pre_expiry_reminder",
      details: { expiresAt: sub.expiresAt }
    });
  }
}

// ---------- BROADCAST ON REDEPLOY ----------
async function broadcastTrialUsers() {
  try {
    const trialSubs = await Subscription.find({ tier: "trial", status: "active" }).populate("adminId");

    if (trialSubs.length === 0) {
      console.log("📭 No active trial users to notify.");
      return;
    }

    for (const sub of trialSubs) {
      const admin = sub.adminId;
      if (!admin || !admin.chatId) continue;

      await sendTelegram(
        admin.chatId,
        `💸 Heads up ${admin.username || "Admin"}!\nWe're moving into paid plans (₦3,000/week).\nKeep funds ready to maintain your access.\nYour trial expires: ${sub.expiresAt.toUTCString()}`
      );
    }

    console.log(`📢 Broadcast sent to ${trialSubs.length} trial users`);
  } catch (err) {
    console.error("Broadcast error:", err.message);
  }
}

// ---------- ROUTES ----------
module.exports = function (app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/", router);

  // --- Free 3-day trial ---
  router.post("/subscriptions/trial", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId || req.body.adminId;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

      const startsAt = new Date();
      const expiresAt = addDays(3);

      const sub = await Subscription.create({
        adminId,
        tier: "trial",
        startsAt,
        expiresAt,
        price: 0,
        status: "active"
      });

      const admin = await Admin.findById(adminId);
      if (admin) {
        admin.isPaid = true;
        admin.paidUntil = expiresAt;
        admin.referralEnabled = false;
        await admin.save();

        await sendTelegram(
          admin.chatId,
          `🎉 Welcome ${admin.username || "Admin"}! Your 3-day free trial starts now.\nReferral disabled by default.\nExpires: ${expiresAt.toUTCString()}`
        );
      }

      res.json({ success: true, subscriptionId: sub._id, expiresAt });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Manual approval (bank payment) ---
  router.post("/subscriptions/approve", verifyToken, async (req, res) => {
    try {
    const {
  username,
  plan = "weekly", // weekly | monthly | vip
  enableReferral = true
} = req.body;

if (!username) return res.status(400).json({ success: false, error: "Username required" });

const admin = await Admin.findOne({ username });
if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

// Define pricing and duration
const plans = {
  weekly: { price: 3000, days: 7 },
  monthly: { price: 10000, days: 30 },
  vip: { price: 25000, days: 90 },
};

const selected = plans[plan];
if (!selected) return res.status(400).json({ success: false, error: "Invalid plan" });

const startsAt = new Date();
const expiresAt = addDays(selected.days);

const sub = await Subscription.create({
  adminId: admin._id,
  tier: plan,
  startsAt,
  expiresAt,
  price: selected.price,
  status: "active"
});

await activateSubscription(sub, enableReferral);
res.json({ success: true, message: `${plan} plan activated`, expiresAt });

      const sub = await Subscription.create({
        adminId: admin._id,
        tier,
        startsAt,
        expiresAt,
        price,
        status: "active"
      });

      await activateSubscription(sub, enableReferral);
      res.json({ success: true, message: "Subscription activated", expiresAt });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Subscription status (by username) ---
  router.get("/subscriptions/status/:username", async (req, res) => {
    try {
      const admin = await Admin.findOne({ username: req.params.username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      res.json({
        username: admin.username,
        isPaid: !!admin.isPaid,
        paidUntil: admin.paidUntil,
        referralEnabled: !!admin.referralEnabled
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- CRONS ----------
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", expireSubscriptions);
    nodeCron.schedule("0 * * * *", notifyTrialAdmins);
    global.__SUBS_CRON_STARTED = true;

    // 🔥 Broadcast to all active trial users immediately after redeploy
    broadcastTrialUsers();
  }

  console.log("✅ Subscription system fully active (trial + ₦3k/week paid + expiry + broadcast)");
  return router;
};