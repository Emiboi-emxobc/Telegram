// sub.js — Subscription Module: Trial + Renewal + Broadcast + ₦3,000/week pricing
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

const RenewalRequestSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  plan: { type: String, enum: ["weekly", "monthly", "vip"], default: "weekly" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const RenewalRequest = mongoose.models.RenewalRequest || mongoose.model("RenewalRequest", RenewalRequestSchema);

const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true, default: "free" }, // trial | paid
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

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

// ---------- AUTO-TRIAL FOR NEW ADMINS ----------
async function ensureTrialForAdmin(adminId) {
  if (!adminId) return;

  const existingSub = await Subscription.findOne({ adminId });
  if (existingSub) return existingSub; // already has one

  const expiresAt = addDays(3);
  const trialSub = await Subscription.create({
    adminId,
    tier: "trial",
    startsAt: new Date(),
    expiresAt,
    price: 0,
    status: "active",
  });

  const admin = await Admin.findById(adminId);
  if (admin) {
    admin.isPaid = true;
    admin.paidUntil = expiresAt;
    admin.referralEnabled = false;
    await admin.save();

    await sendTelegram(
      admin.chatId,
      `🎉 Welcome ${admin.username || "Admin"}! Your free trial has started.\nExpires: ${expiresAt.toUTCString()}`
    );
  }

  return trialSub;
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
    }.\n💰 Price: ₦${sub.price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`
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
      details: { tier: sub.tier },
    });
  }
}

// ---------- TRIAL REMINDER ----------
async function notifyTrialAdmins() {
  const reminderTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const trials = await Subscription.find({
    tier: "trial",
    status: "active",
    expiresAt: { $lte: reminderTime },
  });

  for (const sub of trials) {
    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    await sendTelegram(
      admin.chatId,
      `💡 Hey ${admin.username || "Admin"}, your *free trial* will expire on ${sub.expiresAt.toUTCString()}.\n💸 Renewal cost: ₦3,000/week.`
    );

    await Activity.create({
      adminId: admin._id,
      action: "trial_pre_expiry_reminder",
      details: { expiresAt: sub.expiresAt },
    });

    await new Promise((r) => setTimeout(r, 200));
  }
}

// ---------- BROADCAST ON REDEPLOY (SAFE) ----------
async function broadcastTrialUsers() {
  try {
    const trialSubs = await Subscription.find({
      tier: "trial",
      status: "active",
      "meta.broadcasted": { $ne: true },
    }).populate("adminId");

    if (!trialSubs.length) {
      console.log("📭 No new trial users to notify.");
      return;
    }

    for (const sub of trialSubs) {
      const admin = sub.adminId;
      if (!admin?.chatId) continue;

      await sendTelegram(
        admin.chatId,
        `💸 Heads up ${admin.username || "Admin"}!\nWe're moving into paid plans (₦3,000/week).\nYour trial expires: ${sub.expiresAt.toUTCString()}`
      );

      sub.meta = { ...sub.meta, broadcasted: true };
      await sub.save();

      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`📢 Broadcast sent to ${trialSubs.length} new trial users`);
  } catch (err) {
    console.error("Broadcast error:", err.message);
  }
}


// ---------- AUTO-ACTIVATE TRIALS ON SERVER START ----------
async function activateTrialsOnStart() {
  try {
    const admins = await Admin.find({});

    for (const admin of admins) {
      let trialSub = await Subscription.findOne({ adminId: admin._id, tier: "trial" });

      if (!trialSub) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3); // 3 days from now
        trialSub = await Subscription.create({
          adminId: admin._id,
          tier: "trial",
          startsAt: new Date(),
          expiresAt,
          price: 0,
          status: "active",
        });
        console.log(`✅ Trial created for ${admin.username}`);
      } else if (trialSub.status !== "active") {
        trialSub.status = "active";
        await trialSub.save();
        console.log(`🔄 Trial re-activated for ${admin.username}`);
      } else {
        console.log(`⏩ Trial already active for ${admin.username}`);
      }

      // sync admin fields
      admin.isPaid = true;
      admin.paidUntil = trialSub.expiresAt;
      admin.referralEnabled = false;
      await admin.save();
    }

    console.log("✅ All existing admins synced with trial status");
  } catch (err) {
    console.error("Trial activation error:", err.message);
  }
}

// Run on server start
activateTrialsOnStart();

// ---------- ROUTES ----------
export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/subscriptions", router);

  // --- Free 3-day trial endpoint ---
  router.post("/trial", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId || req.body.adminId;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

      const sub = await ensureTrialForAdmin(adminId);
      res.json({ success: true, subscriptionId: sub._id, expiresAt: sub.expiresAt });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

  // --- Approve auto-renew request ---
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

  // --- Manual approval ---
  router.post("/approve", verifyToken, async (req, res) => {
    try {
      const { username, plan = "weekly", enableReferral = true } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Username required" });

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

  // --- Subscription status ---
  router.get("/status/:username", async (req, res) => {
    try {
      const admin = await Admin.findOne({ username: req.params.username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      res.json({
        username: admin.username,
        isPaid: !!admin.isPaid,
        paidUntil: admin.paidUntil,
        referralEnabled: !!admin.referralEnabled,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- CRONS ----------
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", expireSubscriptions); // every 10 min
    nodeCron.schedule("0 * * * *", notifyTrialAdmins); // hourly reminders
    nodeCron.schedule("0 * * * *", async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await RenewalRequest.updateMany({ status: "pending", createdAt: { $lte: cutoff } }, { status: "rejected" });
    });

    broadcastTrialUsers();

    global.__SUBS_CRON_STARTED = true;
  }

  console.log("✅ Subscription system fully active");

  return { router, models: { Admin, Subscription, RenewalRequest, Activity }, activateSubscription, ensureTrialForAdmin, sendTelegram };
}

export { Admin, Subscription, RenewalRequest, Activity, activateSubscription, ensureTrialForAdmin, sendTelegram };