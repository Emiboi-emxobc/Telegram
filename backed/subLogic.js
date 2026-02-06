// subLogic.js — Fortified Subscription Module
import mongoose from "mongoose";
import axios from "axios";
import nodeCron from "node-cron";
import Admin from './models/Admin.js';
import Activity from './models/Activity.js';
import { Subscription, RenewalRequest } from './models/sub.js';

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- PLAN DATA ----------
export const PLANS = {
  daily: { price: 500, days: 1 },
  weekly: { price: 3000, days: 7 },
  monthly: { price: 12000, days: 30 },
  yearly: { price: 120000, days: 365 },
  vip: { price: 25000, days: 90 },
};

// ---------- TELEGRAM ----------
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

// ---------- HELPERS ----------
export const addDays = (days) => {
  const now = new Date();
  now.setDate(now.getDate() + (Number(days) || 0));
  return now;
};

async function safeSendTelegram(chatId, message) {
  if (!chatId || !message) return;
  await sendTelegram(chatId, message);
}

// ---------- SUBSCRIPTION CORE ----------
export async function activateSubscription(sub, enableReferral = false) {
  if (!sub) throw new Error("No subscription object provided");
  sub.status = "active";
  await sub.save();

  const admin = await Admin.findById(sub.adminId);
  if (!admin) return;

  // --- REFERRAL BONUS ---
  if (admin.referredBy && sub.price > 0) {
    const inviter = await Admin.findOne({ referralCode: admin.referredBy });
    if (inviter) {
      inviter.adminReferralDiscount = Math.max(0, (inviter.adminReferralDiscount || 0) + 500);
      inviter.adminReferrals = (inviter.adminReferrals || 0) + 1;
      await inviter.save();
      await safeSendTelegram(inviter.chatId, `🎉 Your referral just bought a subscription! ₦500 discount added.`);
    }
    admin.referredBy = null;
    await admin.save();
  }

  // --- APPLY DISCOUNT ---
  let discount = Number(admin.adminReferralDiscount || 0);
  let effectivePrice = Math.max(0, Number(sub.price) - discount);
  sub.price = effectivePrice;
  await sub.save();

  admin.adminReferralDiscount = Math.max(0, discount - sub.price);
  admin.isPaid = true;
  admin.paidUntil = sub.expiresAt;
  admin.referralEnabled = !!enableReferral;
  admin.tier = sub.tier;
  await admin.save();

  // --- NOTIFICATIONS ---
  await safeSendTelegram(
    admin.chatId,
    `✅ Hi ${admin.username || "Admin"}! Your *${sub.tier.toUpperCase()}* subscription is active ${
      enableReferral ? "with referral enabled ✅" : ""
    }.\n💰 Price after discount: ₦${sub.price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`
  );
  await safeSendTelegram(
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

// ---------- EXPIRE SUBSCRIPTIONS ----------
export async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    const activePaidSubs = await Subscription.find({
      adminId: admin._id,
      status: "active",
      price: { $gt: 0 },
    });

    admin.isPaid = activePaidSubs.length > 0;
    if (!admin.isPaid) {
      admin.paidUntil = null;
      admin.referralEnabled = false;
      await safeSendTelegram(admin.chatId, `⚠️ Your ${sub.tier} subscription expired. Premium features disabled.`);
    }

    await admin.save();
    await safeSendTelegram(
      ADMIN_CHAT_ID,
      `🚨 *Subscription Expired*\n👤 ${admin.username}\nTier: ${sub.tier}\nExpired: ${now.toUTCString()}`
    );
    await Activity.create({ adminId: admin._id, action: "subscription_expired", details: { tier: sub.tier } });
  }
}

// ---------- RENEWAL LOGIC ----------
export async function requestRenewal(adminId, plan) {
  if (!PLANS[plan]) return { success: false, message: "Invalid plan" };
  const existing = await RenewalRequest.findOne({ adminId, status: "pending" });
  if (existing) return { success: false, message: "Pending renewal exists" };

  await RenewalRequest.create({ adminId, plan });
  const admin = await Admin.findById(adminId);
  await safeSendTelegram(admin?.chatId, `🔁 Your renewal request for *${plan}* plan has been sent.`);
  await safeSendTelegram(ADMIN_CHAT_ID, `🧾 *Renewal Request*\n👤 ${admin?.username || "Unknown"}\nPlan: ${plan}`);
  return { success: true, message: "Renewal requested" };
}

export async function approveRenewal(username) {
  const admin = await Admin.findOne({ username });
  if (!admin) return { success: false, message: "Admin not found" };

  const renewReq = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
  if (!renewReq) return { success: false, message: "No pending renewal" };

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
  return { success: true, message: "Renewal approved and activated" };
}

// ---------- BROADCAST ----------
export async function broadcastAdmins(message, filterPaid = true) {
  const admins = await Admin.find({});
  for (const admin of admins) {
    if (filterPaid && !admin.isPaid) continue;
    await safeSendTelegram(admin.chatId, message);
    await new Promise(r => setTimeout(r, 200)); // throttle
  }
}

// ---------- RECONCILIATION ----------
export async function reconcilePaidStatus() {
  const admins = await Admin.find({});
  for (const admin of admins) {
    admin.isPaid = await Subscription.exists({ adminId: admin._id, status: "active" });
    await admin.save();
  }
}

// ---------- CLEAN STALE RENEWALS ----------
export async function cleanStaleRenewals(days = 2) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await RenewalRequest.updateMany({ status: "pending", createdAt: { $lte: cutoff } }, { status: "rejected" });
}

// ---------- NOTIFY EXPIRED ----------
export async function notifyExpiredAdmins() {
  try {
    const expiredSubs = await Subscription.find({ status: "expired" }).populate("adminId");
    for (const sub of expiredSubs) {
      await safeSendTelegram(sub.adminId?.chatId, `⚠️ Hi ${sub.adminId?.username || "Admin"}, your ${sub.tier} subscription has expired.\n💸 Renew to regain full access.`);
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("Expired notification error:", err.message);
  }
}

// ---------- INITIALIZE CRON ----------
if (!global.__SUBS_CRON_STARTED) {
  nodeCron.schedule("*/10 * * * *", expireSubscriptions);
  nodeCron.schedule("0 12 * * *", notifyExpiredAdmins);
  nodeCron.schedule("0 * * * *", reconcilePaidStatus);
  nodeCron.schedule("0 * * * *", async () => await cleanStaleRenewals(2));
  global.__SUBS_CRON_STARTED = true;
  console.log("✅ Subscription system fully active with CRONs");
}

// ---------- EXPORTS ----------
export { Admin, Subscription, RenewalRequest, Activity };