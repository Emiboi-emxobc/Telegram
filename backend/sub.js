// sub.js — Paid Subscription System + Referrals + Secure Discounts + Auto-Expire
import mongoose from "mongoose";
import express from "express";
import nodeCron from "node-cron";
import axios from "axios";
import Admin from "./models/Admin.js";
import { Subscription, RenewalRequest } from "./models/sub.js";

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- PLAN DATA ----------
export const PLANS = {
  "1day": { price: 500, days: 1 },
  "2days": { price: 1000, days: 2 },
  "3days": { price: 1500, days: 3 },
  "4days": { price: 2000, days: 4 },
  "5days": { price: 2500, days: 5 },
  "6days": { price: 3000, days: 6 },
  "7days": { price: 3500, days: 7 },
  weekly: { price: 3000, days: 7 },
  monthly: { price: 10000, days: 30 },
  yearly: { price: 120000, days: 365 },
  vip: { price: 25000, days: 90 },
};

// ---------- HELPERS ----------
const addDays = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + Number(days));
  return d;
};

export async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN || !text) return;
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

// ---------- CORE SUBSCRIPTION ----------
export async function activateSubscription(adminId, plan, enableReferral = true) {
  const admin = await Admin.findById(adminId);
  if (!admin) throw new Error("Admin not found");

  const planInfo = PLANS[plan];
  if (!planInfo) throw new Error("Invalid plan");

  const now = new Date();

  // --- Extend current active subscription if exists ---
  const activeSub = await Subscription.findOne({
    adminId,
    status: "active",
    expiresAt: { $gt: now },
  });

  const startsAt = activeSub ? activeSub.expiresAt : now;

  // --- Price & discount ---
  let price = planInfo.price;
  const discount = Math.max(0, Number(admin.adminReferralDiscount || 0));
  const usedDiscount = Math.min(discount, price);
  price -= usedDiscount;

  // --- Create new subscription ---
  const sub = await Subscription.create({
    adminId,
    tier: plan,
    startsAt,
    expiresAt: addDays(planInfo.days, startsAt),
    price,
    status: "active",
  });

  // --- Update admin ---
  const activeSubs = await Subscription.find({ adminId: admin._id, status: "active" });
  admin.isPaid = activeSubs.length > 0;
  admin.paidUntil = activeSubs.length
    ? new Date(Math.max(...activeSubs.map(s => s.expiresAt.getTime())))
    : null;
  admin.referralEnabled = enableReferral;
  admin.adminReferralDiscount = Math.max(0, discount - usedDiscount);
  await admin.save();

  // --- REFERRAL BONUS ---
  if (admin.referredBy && price > 0) {
    const inviter = await Admin.findOne({ referralCode: admin.referredBy });
    if (inviter) {
      let bonus = 500;
      if (plan === "monthly") bonus = 1000;
      if (plan === "vip") bonus = 2000;
      if (plan === "yearly") bonus = 10000;

      inviter.adminReferralDiscount = (inviter.adminReferralDiscount || 0) + bonus;
      inviter.adminReferrals = (inviter.adminReferrals || 0) + 1;
      await inviter.save();

      await sendTelegram(
        inviter.chatId,
        `🎉 Your referral ${admin.username} bought a *${plan.toUpperCase()}* subscription!\n₦${bonus.toLocaleString()} discount added.`
      );
    }
    admin.referredBy = null;
    await admin.save();
  }

  // --- NOTIFICATIONS ---
  await sendTelegram(
    admin.chatId,
    `✅ Hi ${admin.username}! Your *${plan.toUpperCase()}* subscription is active.\n💰 Price paid: ₦${price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`
  );

  await sendTelegram(
    ADMIN_CHAT_ID,
    `📢 New subscription: ${admin.username}, Plan: ${plan}, Price: ₦${price.toLocaleString()}`
  );

  return sub;
}

// ---------- AUTO-EXPIRE ----------
export async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });
  const processedAdmins = new Set();

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (!admin || processedAdmins.has(admin._id.toString())) continue;
    processedAdmins.add(admin._id.toString());

    const activeSubs = await Subscription.find({ adminId: admin._id, status: "active" });
    admin.isPaid = activeSubs.length > 0;
    admin.paidUntil = activeSubs.length
      ? new Date(Math.max(...activeSubs.map(s => s.expiresAt.getTime())))
      : null;
    admin.referralEnabled = activeSubs.length > 0;
    await admin.save();

    // Clean old expired subscriptions (keep last 3)
    const expiredSubsForAdmin = await Subscription.find({ adminId: admin._id, status: "expired" }).sort({ expiresAt: -1 });
    if (expiredSubsForAdmin.length > 3) {
      await Subscription.deleteMany({ _id: { $in: expiredSubsForAdmin.slice(3).map(s => s._id) } });
    }

    await sendTelegram(admin.chatId, `⚠️ Your ${sub.tier} subscription expired. Renew to regain access.`);
    await sendTelegram(ADMIN_CHAT_ID, `🚨 Subscription expired: ${admin.username}, Tier: ${sub.tier}`);
  }
}

// ---------- FRONTEND ROUTE ----------
export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/subscriptions", router);

  router.post("/activate", verifyToken, async (req, res) => {
    try {
      const { plan, referralEnabled } = req.body;
      const adminId = req.user._id;

      if (!PLANS[plan]) return res.status(400).json({ error: "Invalid plan" });

      const sub = await activateSubscription(adminId, plan, referralEnabled);
      res.json({ success: true, subscription: sub });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Activation failed" });
    }
  });

  // ---------- CRONS ----------
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", async () => { try { await expireSubscriptions(); } catch(e){console.error(e);} });
    nodeCron.schedule("0 * * * *", async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await RenewalRequest.updateMany(
        { status: "pending", createdAt: { $lte: cutoff } },
        { status: "rejected" }
      );
    });
    global.__SUBS_CRON_STARTED = true;
  }

  return { router, activateSubscription, expireSubscriptions };
}

// ---------- RESET ON START ----------
export async function resetAllPayments() {
  const now = new Date();
  const admins = await Admin.find();

  for (const admin of admins) {
    await Subscription.updateMany(
      { adminId: admin._id, status: "active", expiresAt: { $lte: now } },
      { status: "expired" }
    );

    const activeSubs = await Subscription.find({ adminId: admin._id, status: "active", expiresAt: { $gt: now } });
    admin.isPaid = activeSubs.length > 0;
    admin.paidUntil = activeSubs.length ? new Date(Math.max(...activeSubs.map(s => s.expiresAt.getTime()))) : null;
    admin.referralEnabled = activeSubs.length > 0;
    await admin.save();
  }

  console.log("✅ Payments reset, subscription system ready");
}