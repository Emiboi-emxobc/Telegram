// sub.js — Paid Subscription System + Referrals + Secure Discounts + Auto-Expire
import mongoose from "mongoose";
import express from "express";
import nodeCron from "node-cron";
import axios from "axios";
import Admin from './models/Admin.js';
import { Subscription, RenewalRequest } from './models/sub.js';
import Referral from './models/Referral.js';

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- PLAN DATA ----------
export const PLANS = {
  weekly: { price: 3000, days: 7 },
  monthly: { price: 10000, days: 30 },
  vip: { price: 25000, days: 90 },
};

// ---------- HELPERS ----------
const addDays = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
};

export async function sendTelegram(chatId, text) {
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

// ---------- CORE SUBSCRIPTION ----------
export async function activateSubscription(adminId, plan, enableReferral = true) {
  const admin = await Admin.findById(adminId);
  if (!admin) throw new Error("Admin not found");

  const planInfo = PLANS[plan];
  if (!planInfo) throw new Error("Invalid plan");

  const now = new Date();

  // handle overlapping: extend from current active subscription
  let activeSub = await Subscription.findOne({ adminId, status: "active" });
  let startsAt = now;
  if (activeSub && activeSub.expiresAt > now) {
    startsAt = activeSub.expiresAt;
    activeSub.status = "expired";
    await activeSub.save();
  }

  // compute price with referral discount if any
  let price = planInfo.price;
  let discount = admin.adminReferralDiscount || 0;
  const usedDiscount = Math.min(discount, price);
  price -= usedDiscount;

  // create subscription
  const sub = await Subscription.create({
    adminId,
    tier: plan,
    startsAt,
    expiresAt: addDays(planInfo.days, startsAt),
    price,
    status: "active",
  });

  // mark admin as paid
  const activeSubs = await Subscription.find({ adminId: admin._id, status: "active" });
  admin.isPaid = activeSubs.length > 0;
  admin.paidUntil = activeSubs.length ? new Date(Math.max(...activeSubs.map(s => s.expiresAt.getTime()))) : null;
  admin.referralEnabled = enableReferral;
  admin.adminReferralDiscount = Math.max(0, discount - usedDiscount);
  await admin.save();

  // REFERRAL BONUS: inviter gets bonus if this admin was referred
  if (admin.referredBy && price > 0) {
    const inviter = await Admin.findOne({ referralCode: admin.referredBy });
    if (inviter) {
      let bonus = 500;
      if(plan === "monthly") bonus = 1000;
      if(plan === "vip") bonus = 2000;

      inviter.adminReferralDiscount = (inviter.adminReferralDiscount || 0) + bonus;
      inviter.adminReferrals = (inviter.adminReferrals || 0) + 1;
      await inviter.save();

      await sendTelegram(inviter.chatId, `🎉 Your referral ${admin.username} bought a *${plan.toUpperCase()}* subscription! ₦${bonus.toLocaleString()} discount added.`);
    }
    admin.referredBy = null; // prevent abuse
    await admin.save();
  }

  // notifications
  await sendTelegram(admin.chatId, `✅ Hi ${admin.username}! Your *${plan.toUpperCase()}* subscription is active.\n💰 Price paid: ₦${price.toLocaleString()}\n⏳ Expires: ${sub.expiresAt.toUTCString()}`);
  await sendTelegram(ADMIN_CHAT_ID, `📢 New subscription: ${admin.username}, Plan: ${plan}, Price: ₦${price.toLocaleString()}`);

  return sub;
}

// ---------- RESET ALL ADMIN PAYMENTS ON START ----------
export async function resetAllPayments() {
  
}

// ---------- AUTO-EXPIRE ----------
export async function expireSubscriptions() {
  const now = new Date();
  const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();

    const admin = await Admin.findById(sub.adminId);
    if (!admin) continue;

    const activeSubs = await Subscription.find({ adminId: admin._id, status: "active" });
    admin.isPaid = activeSubs.length > 0;
    admin.paidUntil = activeSubs.length ? new Date(Math.max(...activeSubs.map(s => s.expiresAt.getTime()))) : null;
    admin.referralEnabled = activeSubs.length > 0;
    await admin.save();

    await sendTelegram(admin.chatId, `⚠️ Your ${sub.tier} subscription expired. Renew to regain access.`);
    await sendTelegram(ADMIN_CHAT_ID, `🚨 Subscription expired: ${admin.username}, Tier: ${sub.tier}, Expired: ${now.toUTCString()}`);
  }
}

// ---------- ROUTES ----------
export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req,res,next)=>next());
  app.use("/subscriptions", router);

  // --- Request auto-renew ---
  router.post("/request-renew", verifyToken, async (req,res)=>{
    try {
      const adminId = req.userId || req.body.adminId;
      const { plan = "weekly" } = req.body;
      if (!adminId) return res.status(400).json({ success:false, error:"Missing adminId" });
      if (!PLANS[plan]) return res.status(400).json({ success:false, error:"Invalid plan" });

      const existing = await RenewalRequest.findOne({ adminId, status:"pending" });
      if (existing) return res.json({ success:true, message:"You already have a pending renewal request" });

      await RenewalRequest.create({ adminId, plan });
      const admin = await Admin.findById(adminId);
      if (admin?.chatId) await sendTelegram(admin.chatId, `🔁 Your renewal request for *${plan}* plan has been sent.`);
      await sendTelegram(ADMIN_CHAT_ID, `🧾 Renewal Request: ${admin?.username || "Unknown"}, Plan: ${plan}`);

      res.json({ success:true, message:"Renewal request sent" });
    } catch(err) {
      res.status(500).json({ success:false, error:err.message });
    }
  });

  // --- Approve renewal ---
  router.post("/approve-renewal", verifyToken, async (req,res)=>{
    try{
      const { username } = req.body;
      if(!username) return res.status(400).json({ success:false, error:"Username required" });
      const admin = await Admin.findOne({ username });
      if(!admin) return res.status(404).json({ success:false, error:"Admin not found" });

      const renewReq = await RenewalRequest.findOne({ adminId: admin._id, status:"pending" });
      if(!renewReq) return res.status(404).json({ success:false, error:"No pending request found" });

      renewReq.status = "approved";
      await renewReq.save();

      const sub = await activateSubscription(admin._id, renewReq.plan, admin.referralEnabled);
      res.json({ success:true, message:"Renewal approved and activated", subscriptionId: sub._id, expiresAt: sub.expiresAt });
    } catch(err){ res.status(500).json({ success:false, error:err.message }); }
  });

  // --- Manual approve ---
  router.post("/approve", verifyToken, async (req,res)=>{
    try{
      const { username, plan = "weekly", enableReferral = true } = req.body;
      if(!username) return res.status(400).json({ success:false, error:"Admin username required" });
      const admin = await Admin.findOne({ username });
      if(!admin) return res.status(404).json({ success:false, error:"Admin not found" });

      const sub = await activateSubscription(admin._id, plan, enableReferral);
      res.json({ success:true, message:`${plan} plan activated`, subscriptionId: sub._id, expiresAt: sub.expiresAt });
    } catch(err){ res.status(500).json({ success:false, error:err.message }); }
  });

  // --- Status check ---
  router.get("/status/:username", async (req,res)=>{
    try{
      const admin = await Admin.findOne({ username: req.params.username });
      if(!admin) return res.status(404).json({ success:false, error:"Admin not found" });

      const activeSubs = await Subscription.find({ adminId: admin._id, status:"active" });

      res.json({
        username: admin.username,
        isPaid: !!admin.isPaid,
        paidUntil: admin.paidUntil,
        activeSubscriptions: activeSubs.map(s => ({
          tier: s.tier,
          expiresAt: s.expiresAt,
          price: s.price,
        })),
        referralEnabled: !!admin.referralEnabled,
        referralDiscount: admin.adminReferralDiscount || 0,
      });
    } catch(err){ res.status(500).json({ success:false, error:err.message }); }
  });

  // ---------- CRONS ----------
  if (!global.__SUBS_CRON_STARTED) {
    nodeCron.schedule("*/10 * * * *", async()=>{ try{ await expireSubscriptions(); }catch(e){ console.error(e); } });
    nodeCron.schedule("0 * * * *", async()=>{
      const cutoff = new Date(Date.now() - 48*60*60*1000);
      await RenewalRequest.updateMany({ status:"pending", createdAt:{ $lte: cutoff } }, { status:"rejected" });
    });
    global.__SUBS_CRON_STARTED = true;
  }

  return { router, activateSubscription, expireSubscriptions };
}

// ---------- INITIALIZATION ----------
export async function startSubscriptionSystem() {
  await resetAllPayments();
  console.log("✅ Subscription system ready: paid-only mode active");
}