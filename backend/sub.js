// sub.js — Manual subscription + referral activation + 3-day trial
const mongoose = require("mongoose");
const express = require("express");
const nodeCron = require("node-cron");
const axios = require("axios");

const OWNER_USERNAME = process.env.OWNER_USERNAME || "nexa_admin";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

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

// Activate subscription + referral
async function activateSubscription(subscriptionId, enableReferral = false) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw new Error("Subscription not found");
  if (sub.status === "active") return sub;

  sub.status = "active";
  await sub.save();

  const Admin = mongoose.model("Admin");
  const admin = await Admin.findById(sub.adminId);
  if (admin) {
    admin.isPaid = true;
    admin.paidUntil = sub.expiresAt;
    if (enableReferral) admin.referralEnabled = true;
    await admin.save();

    // Telegram notification
    await sendTelegram(admin.chatId, `🎉 Hi ${admin.username || "Admin"}! Your subscription is active${enableReferral ? " and referral is enabled ✅" : ""}. Expires: ${sub.expiresAt}`);
  }

  return sub;
}

// Expire subscriptions
async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });
  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const Admin = mongoose.model("Admin");
    const admin = await Admin.findById(sub.adminId);
    if (admin) {
      admin.isPaid = false;
      admin.paidUntil = null;
      admin.referralEnabled = false;
      await admin.save();
      await sendTelegram(admin.chatId, `⚠️ Your trial/subscription has expired. Referral features disabled.`);
    }
  }
}

module.exports = function(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());

  app.use("/", router);

  // Auto 3-day trial + referral disabled
  router.post("/subscriptions/trial", verifyToken, async (req, res) => {
    const adminId = req.userId;
    if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
    const price = 0;

    const sub = await Subscription.create({ adminId, tier: "trial", startsAt, expiresAt, price, status: "active" });

    const Admin = mongoose.model("Admin");
    const admin = await Admin.findById(adminId);
    if (admin) {
      admin.isPaid = true;
      admin.paidUntil = expiresAt;
      admin.referralEnabled = false;
      await admin.save();
      await sendTelegram(admin.chatId, `🎉 Welcome ${admin.username || "Admin"}! Your 3-day free trial starts now. Referral disabled by default. Expires: ${expiresAt}`);
    }

    res.json({ success: true, subscriptionId: sub._id, expiresAt });
  });

  // Manual approval + optional referral
  router.post("/subscriptions/approve", verifyToken, async (req, res) => {
    const { subscriptionId, enableReferral = true } = req.body;
    if (!subscriptionId) return res.status(400).json({ success: false, error: "subscriptionId required" });

    try {
      const sub = await activateSubscription(subscriptionId, enableReferral);
      res.json({ success: true, message: "Subscription activated", subscriptionId: sub._id });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Check subscription + referral status
  router.get("/subscriptions/status/:adminId", async (req, res) => {
    const { adminId } = req.params;
    const Admin = mongoose.model("Admin");
    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });
    res.json({ isPaid: !!admin.isPaid, paidUntil: admin.paidUntil, referralEnabled: !!admin.referralEnabled });
  });

  // Cron: expire subscriptions every 10 minutes
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", expireSubscriptions);
    global.__SUBS_CRON_STARTED = true;
  }

  console.log("Manual subscriptions + referral module with 3-day trial initialized");
  return router;
};