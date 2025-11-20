// sub.js — Subscription Module: Renewal + Broadcast + ₦3,000/week pricing + Admin Referral Bonus
import mongoose from "mongoose";
import express from "express";
import nodeCron from "node-cron";
import axios from "axios";

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- PLAN DATA ----------
export const PLANS = {
  weekly: { price: 3000, days: 7 },
  monthly: { price: 10000, days: 30 },
  vip: { price: 25000, days: 90 },
};

// ---------- MODELS ----------
import Admin from './models/Admin.js';
import Activity from './models/Activity.js';
import { Subscription, RenewalRequest } from './models/sub.js';

// ---------- TELEGRAM ----------
async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId || ADMIN_CHAT_ID,
      text,
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.warn("Telegram send failed:", err.message);
  }
}

// ---------- HELPERS ----------
const addDays = (days) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now;
};

// ---------- SUBSCRIPTION CORE ----------
async function activateSubscription(sub, enableReferral = false) {
  sub.status = "active";
  await sub.save();

  const admin = await Admin.findById(sub.adminId);
  if (!admin) return;

  // --- REFERRAL BONUS ---
  if (admin.referredBy && sub.price > 0) {
    const inviter = await Admin.findOne({ referralCode: admin.referredBy });
    if (inviter) {
      inviter.adminReferralDiscount = (inviter.adminReferralDiscount || 0) + 500;
      inviter.adminReferrals += 1;
      await inviter.save();

      await sendTelegram(
        inviter.chatId,
        `🎉 Your referral just bought a subscription! ₦500 discount added to your account.`
      );
    }
    admin.referredBy = null;
    await admin.save();
  }

  // --- APPLY DISCOUNT ---
  let discount = admin.adminReferralDiscount || 0;
  let effectivePrice = sub.price - discount;
  if (effectivePrice < 0) effectivePrice = 0;
  sub.price = effectivePrice;
  await sub.save();

  admin.adminReferralDiscount = Math.max(0, discount - sub.price);
  admin.isPaid = true;
  admin.paidUntil = sub.expiresAt;
  admin.referralEnabled = enableReferral;
  await admin.save();

  // --- NOTIFICATIONS ---
  await sendTelegram(
    admin.chatId,
    `✅ Hi ${admin.username || "Admin"}! Your *${sub.tier.toUpperCase()}* subscription is now active ${
      enableReferral ? "with referral enabled ✅" : ""
    }.\n💰 Price after discount: ₦${sub.price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`
  );

  await sendTelegram(
    ADMIN_CHAT_ID,
    `📢 *New Subscription*\n👤 ${admin.username}\n💰 ₦${sub.price.toLocaleString()}\n📅 ${sub.tier} active till ${sub.expiresAt.toUTCString()}`
  );

  await Activity.create({
    adminId: admin._id,
    action: "subscription_activated",
    details: { tier: sub.tier, referral: enableReferral, price: sub.price },
  });

  return sub;
}

// ---------- AUTO EXPIRE ----------
async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    // Check if admin has other active paid subscriptions
    const activePaidSubs = await Subscription.find({
      adminId: admin._id,
      status: "active",
      price: { $gt: 0 },
    });

    if (activePaidSubs.length === 0) {
      admin.isPaid = false;
      admin.paidUntil = null;
      admin.referralEnabled = false;
      await admin.save();

      await sendTelegram(
        admin.chatId,
        `⚠️ Your ${sub.tier} subscription has expired.\nReferral and premium features are now disabled.`
      );
    }

    await sendTelegram(
      ADMIN_CHAT_ID,
      `🚨 *Subscription Expired*\n👤 ${admin.username}\nTier: ${sub.tier}\nExpired: ${new Date().toUTCString()}`
    );

    await Activity.create({
      adminId: admin._id,
      action: "subscription_expired",
      details: { tier: sub.tier },
    });
  }
}

// ---------- EXPIRED NOTIFICATIONS ----------
async function notifyExpiredAdmins() {
  try {
    const expiredSubs = await Subscription.find({ status: "expired" }).populate("adminId");
    for (const sub of expiredSubs) {
      const admin = sub.adminId;
      if (!admin) continue;

      await sendTelegram(
        admin.chatId,
        `⚠️ Hi ${admin.username || "Admin"}, your ${sub.tier} subscription has expired.\n💸 Renew to regain full access.`
      );

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("Expired reminder error:", err.message);
  }
}

// ---------- ROUTES ----------
export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/subscriptions", router);

  // --- Request auto-renew ---
  router.post("/request-renew", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId || req.body.adminId;
      const { plan = "weekly" } = req.body;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

      const existing = await RenewalRequest.findOne({ adminId, status: "pending" });
      if (existing) return res.json({ success: true, message: "You already have a pending renewal request" });

      await RenewalRequest.create({ adminId, plan });
      const admin = await Admin.findById(adminId);
      if (admin?.chatId) await sendTelegram(admin.chatId, `🔁 Your renewal request for *${plan}* plan has been sent.`);
      await sendTelegram(ADMIN_CHAT_ID, `🧾 *Renewal Request*\n👤 ${admin?.username || "Unknown"}\nPlan: ${plan}`);

      res.json({ success: true, message: "Renewal request sent" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Approve auto-renew ---
  router.post("/approve-renewal", verifyToken, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Username required" });

      const admin = await Admin.findOne({ username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const renewReq = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
      if (!renewReq) return res.status(404).json({ success: false, error: "No pending request found" });

      const activeSub = await Subscription.findOne({ adminId: admin._id, status: "active" });
      if (activeSub) {
        activeSub.status = "expired";
        await activeSub.save();
      }

      renewReq.status = "approved";
      await renewReq.save();

      const planInfo = PLANS[renewReq.plan];
      const newSub = await Subscription.create({
        adminId: admin._id,
        tier: renewReq.plan,
        startsAt: new Date(),
        expiresAt: addDays(planInfo.days),
        price: planInfo.price,
        status: "active",
      });

      await activateSubscription(newSub, admin.referralEnabled);

      res.json({ success: true, message: "Renewal approved and activated" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Manual approve ---
  router.post("/approve", verifyToken, async (req, res) => {
    try {
      const { username, plan = "weekly", enableReferral = true } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Admin username required" });

      const admin = await Admin.findOne({ username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const planInfo = PLANS[plan];
      if (!planInfo) return res.status(400).json({ success: false, error: "Invalid plan" });

      const newSub = await Subscription.create({
        adminId: admin._id,
        tier: plan,
        startsAt: new Date(),
        expiresAt: addDays(planInfo.days),
        price: planInfo.price,
        status: "active",
      });

      await activateSubscription(newSub, enableReferral);

      res.json({ success: true, message: `${plan} plan activated`, expiresAt: newSub.expiresAt });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Status check ---
  router.get("/status/:username", async (req, res) => {
    try {
      const admin = await Admin.findOne({ username: req.params.username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      res.json({
        username: admin.username,
        isPaid: !!admin.isPaid,
        paidUntil: admin.paidUntil,
        referralEnabled: !!admin.referralEnabled,
        referralDiscount: admin.adminReferralDiscount || 0,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- CRONS ----------
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", expireSubscriptions);
    nodeCron.schedule("0 12 * * *", notifyExpiredAdmins);

    nodeCron.schedule("0 * * * *", async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await RenewalRequest.updateMany({ status: "pending", createdAt: { $lte: cutoff } }, { status: "rejected" });
    });

    global.__SUBS_CRON_STARTED = true;
  }

  console.log("✅ Subscription system fully active");

  return { router, models: { Admin, Subscription, RenewalRequest, Activity }, activateSubscription, sendTelegram };
}

export { Admin, Subscription, RenewalRequest, Activity, activateSubscription, sendTelegram };