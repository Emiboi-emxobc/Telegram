// sub.js
// Subscription module for Nexa Ultra
// Usage: require('./sub')(app)
// IMPORTANT: require this file AFTER your models (Admin, Activity, Referral) are declared in server.js

const mongoose = require("mongoose");
const express = require("express");
const nodeCron = require("node-cron");

// env
const OWNER_USERNAME = process.env.OWNER_USERNAME || "nexa_admin";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN; // used by sendTelegram if available

// Ensure mongoose connection exists
if (!mongoose.connection || mongoose.connection.readyState === 0) {
  console.warn("sub.js: mongoose not connected yet. Make sure you require('./sub') after server connects to MongoDB.");
}

// Create Subscription model (isolated)
const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true }, // "24h","3d","7d","14d","30d","1y","custom"
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true }, // smallest currency unit (e.g., kobo)
  provider: { type: String, default: "" },
  providerSessionId: { type: String, default: "" },
  providerPaymentId: { type: String, default: "" },
  status: { type: String, enum: ["pending", "active", "failed", "cancelled", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

// price map (naira)
const PRICE_NAIRA_BASE_WEEK = 2000; // default: ₦2000 per week
const PRICE_NAIRA = {
  "24h": Math.round(PRICE_NAIRA_BASE_WEEK / 7), // pro-rata
  "3d": Math.round((PRICE_NAIRA_BASE_WEEK / 7) * 3),
  "7d": PRICE_NAIRA_BASE_WEEK,
  "14d": PRICE_NAIRA_BASE_WEEK * 2,
  "30d": PRICE_NAIRA_BASE_WEEK * 4,
  "1y": PRICE_NAIRA_BASE_WEEK * 52,
};

function priceInKobo(tier) {
  const naira = PRICE_NAIRA[tier] || PRICE_NAIRA["7d"];
  return Math.round(naira * 100);
}

function computeDiscountPercent(inviteCount = 0) {
  if (inviteCount >= 100) return 50;
  if (inviteCount >= 50) return 30;
  if (inviteCount >= 20) return 15;
  if (inviteCount >= 5) return 5;
  return 0;
}

function discountedPrice(amountKobo, inviteCount = 0) {
  const pct = computeDiscountPercent(inviteCount);
  return Math.round(amountKobo * (100 - pct) / 100);
}

// activate subscription helper
async function activateSubscription(subscriptionId, providerPaymentId) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw new Error("Subscription not found");

  if (sub.status === "active") return sub;

  sub.providerPaymentId = providerPaymentId || sub.providerPaymentId;
  sub.status = "active";
  await sub.save();

  // update admin document (assumes Admin model exists)
  const Admin = mongoose.model("Admin");
  const admin = await Admin.findById(sub.adminId);
  if (admin) {
    admin.paidUntil = sub.expiresAt;
    admin.isPaid = true;
    await admin.save();
    // create activity if model exists
    try {
      const Activity = mongoose.model("Activity");
      await Activity.create({
        adminId: admin._id,
        action: "subscription_activated",
        details: { subscriptionId: sub._id, expiresAt: sub.expiresAt }
      });
    } catch (e) {
      // ignore if Activity model missing
    }
  }
  return sub;
}

// expiry checker (called by cron)
async function expireSubscriptionsAndNotify(sendTelegramFn) {
  try {
    const now = new Date();
    const expiredSubs = await Subscription.find({ status: "active", expiresAt: { $lte: now } }).lean();
    if (!expiredSubs || expiredSubs.length === 0) return;

    const Admin = mongoose.model("Admin");
    const Activity = mongoose.model("Activity");

    for (const s of expiredSubs) {
      try {
        // mark subscription expired
        await Subscription.findByIdAndUpdate(s._id, { status: "expired" });

        // mark admin as unpaid
        const admin = await Admin.findById(s.adminId);
        if (admin) {
          admin.isPaid = false;
          admin.paidUntil = null;
          await admin.save();

          // log activity
          if (Activity) {
            await Activity.create({
              adminId: admin._id,
              action: "subscription_expired",
              details: { subscriptionId: s._id }
            });
          }

          // notify admin and owner
          const adminChat = admin.chatId || ADMIN_CHAT_ID;
          const ownerChat = ADMIN_CHAT_ID;

          const msg = `⚠️ Subscription expired for *${admin.username || admin.firstname || "an admin"}*\nReferral features disabled. Renew to re-enable referral benefits.`;
          if (sendTelegramFn) {
            try { await sendTelegramFn(adminChat, msg); } catch (e) { console.warn("notify admin failed", e && e.message); }
            try { await sendTelegramFn(ownerChat, `ℹ️ Subscription expired for ${admin.username}`); } catch(e){/*ignore*/ }
          }
        }
      } catch (e) {
        console.error("expireSubscriptionsAndNotify error for sub", s._id, e && e.message);
      }
    }
  } catch (err) {
    console.error("expireSubscriptionsAndNotify failed:", err && err.message);
  }
}

// Express router for subscription endpoints
module.exports = function (app, options = {}) {
  // options may pass helper functions already present in your server:
  // { verifyToken, sendTelegram, isOwner: (admin)=>boolean }
  const router = express.Router();

  const verifyToken = options.verifyToken || (req => { throw new Error("verifyToken middleware required in sub module options"); });
  const sendTelegram = options.sendTelegram || (async (chatId, text) => {
    // if your server has sendTelegram globally available, prefer to pass it in options
    // fallback: attempt to use axios to call BOT_TOKEN from env
    const axios = require("axios");
    if (!process.env.BOT_TOKEN) {
      console.warn("sub.js sendTelegram fallback: missing BOT_TOKEN env");
      return;
    }
    await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      chat_id: chatId || ADMIN_CHAT_ID,
      text,
      parse_mode: "Markdown"
    });
  });

  // attach router under /subscriptions
  app.use("/", router);

  /**
   * POST /checkout
   * Body: { tier: "7d" }
   * Protected: verifyToken (expects req.userId)
   * Returns: { success:true, paymentUrl, subscriptionId }
   *
   * NOTE: this function returns a generic paymentUrl placeholder. Replace the "create provider session" part
   * with your payment provider integration (Paystack / Flutterwave / Stripe).
   */
  router.post("/checkout", async (req, res) => {
    try {
      // call verifyToken middleware (your server normally uses verifyToken(req,res,next))
      // here we expect that verifyToken was passed as option and used in server routes.
      // But to keep compatibility, we'll check req.userId set by your existing verifyToken middleware.
      if (!req.userId) {
        return res.status(401).json({ success: false, error: "Not authenticated (req.userId missing). Ensure you use verifyToken before this handler." });
      }

      const adminId = req.userId;
      const { tier } = req.body || {};
      if (!tier) return res.status(400).json({ success: false, error: "Missing tier" });

      const Admin = mongoose.model("Admin");
      const admin = await Admin.findById(adminId);
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const basePrice = priceInKobo(tier);
      const priceAfterDiscount = discountedPrice(basePrice, admin.inviteCount || 0);

      // compute expiry
      const startsAt = new Date();
      const expiresAt = new Date(startsAt);
      switch (tier) {
        case "24h": expiresAt.setHours(expiresAt.getHours() + 24); break;
        case "3d": expiresAt.setDate(expiresAt.getDate() + 3); break;
        case "7d": expiresAt.setDate(expiresAt.getDate() + 7); break;
        case "14d": expiresAt.setDate(expiresAt.getDate() + 14); break;
        case "30d": expiresAt.setDate(expiresAt.getDate() + 30); break;
        case "1y": expiresAt.setFullYear(expiresAt.getFullYear() + 1); break;
        default: expiresAt.setDate(expiresAt.getDate() + 7);
      }

      // create pending subscription
      const sub = await Subscription.create({
        adminId,
        tier,
        startsAt,
        expiresAt,
        price: priceAfterDiscount,
        provider: process.env.PAYMENT_PROVIDER || "manual",
        status: "pending",
        meta: { inviteCount: admin.inviteCount || 0 }
      });

      // TODO: Create provider session here (Paystack/Flutterwave/Stripe)
      // Example: For Paystack you'd call transaction/initialize using amount=priceAfterDiscount and
      // set metadata.subscriptionId=sub._id then return authorization_url to the frontend.
      //
      // For now, we return a placeholder URL that includes the subscription id so you can test flow.
      const paymentUrl = process.env.PAYMENT_REDIRECT_BASE
        ? `${process.env.PAYMENT_REDIRECT_BASE}?sub=${sub._id}`
        : `https://example-pay.local/checkout?sub=${sub._id}`;

      return res.json({ success: true, paymentUrl, subscriptionId: sub._id, amount: priceAfterDiscount });
    } catch (err) {
      console.error("checkout error:", err && err.stack || err);
      return res.status(500).json({ success: false, error: "Checkout failed", details: err && err.message });
    }
  });

  /**
   * POST /payments/webhook
   * Webhook receiver for payment provider. IMPORTANT: verify signature using provider guidelines.
   *
   * This generic handler expects the provider to send metadata.subscriptionId or you to map providerSessionId.
   * Replace the verification/parsing section with provider-specific logic.
   */
  // Use raw body if you need HMAC verification (some providers require express.raw body)
  // If you mount server-level express.raw for this route, adjust accordingly.
  router.post("/payments/webhook", express.json(), async (req, res) => {
    try {
      // Example: provider might return { status: "success", data: { metadata: { subscriptionId }, id } }
      // Replace below parsing with actual provider payload parsing & verification.
      const payload = req.body;
      // TODO: verify signature here (very important)

      // Try common places for subscriptionId
      let subscriptionId = null;
      if (payload?.data?.metadata?.subscriptionId) subscriptionId = payload.data.metadata.subscriptionId;
      if (!subscriptionId && payload?.metadata?.subscriptionId) subscriptionId = payload.metadata.subscriptionId;
      if (!subscriptionId && payload?.reference) subscriptionId = payload.reference; // fallback

      // Provider status check (customize)
      const success = payload?.status === "success" || payload?.data?.status === "success" || payload?.event === "charge.success" || payload?.type === "charge.succeeded";

      if (!subscriptionId) {
        // If you used providerSessionId pattern, map it to subscription via Subscription.findOne({providerSessionId: ...})
        console.warn("Webhook: subscriptionId not found in payload. Raw payload logged.");
        console.warn(JSON.stringify(payload).slice(0, 2000));
        return res.status(400).send("missing subscription id");
      }

      const sub = await Subscription.findById(subscriptionId);
      if (!sub) {
        console.warn("Webhook: subscription not found for id", subscriptionId);
        return res.status(404).send("sub not found");
      }

      if (sub.status === "active") {
        return res.status(200).send("already active");
      }

      if (success) {
        // providerPaymentId: try multiple fields
        const providerPaymentId = payload?.data?.id || payload?.id || payload?.data?.reference || payload?.reference || null;
        sub.providerPaymentId = providerPaymentId || sub.providerPaymentId;
        sub.status = "active";
        await sub.save();

        // activate subscription (update admin paidUntil)
        await activateSubscription(sub._id, providerPaymentId);

        // respond
        return res.status(200).send("ok");
      } else {
        sub.status = "failed";
        await sub.save();
        return res.status(200).send("marked failed");
      }
    } catch (err) {
      console.error("payments/webhook error:", err && err.stack || err);
      return res.status(500).send("error");
    }
  });

  /**
   * GET /admin/subscription-status
   * Returns status for logged-in admin
   */
  router.get("/admin/subscription-status", async (req, res) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: "Not authenticated" });
      const adminId = req.userId;
      const Admin = mongoose.model("Admin");
      const admin = await Admin.findById(adminId).lean();
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const now = new Date();
      const active = admin.isPaid && admin.paidUntil && new Date(admin.paidUntil) > now;
      const until = admin.paidUntil || null;

      return res.json({ success: true, isPaid: !!active, paidUntil: until, inviteCount: admin.inviteCount || 0 });
    } catch (err) {
      console.error("subscription-status error:", err && err.message);
      return res.status(500).json({ success: false, error: "Failed to get status" });
    }
  });

  /**
   * POST /admin/grant-free
   * Owner-only endpoint to give free subscription for some days
   * Body: { adminId, days }
   */
  router.post("/admin/grant-free", async (req, res) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: "Not authenticated" });
      // owner check: compare username of req.userId to OWNER_USERNAME
      const Admin = mongoose.model("Admin");
      const actor = await Admin.findById(req.userId);
      if (!actor) return res.status(403).json({ success: false, error: "Forbidden" });
      if (actor.username !== OWNER_USERNAME) return res.status(403).json({ success: false, error: "Only owner can grant free" });

      const { adminId, days } = req.body || {};
      if (!adminId) return res.status(400).json({ success: false, error: "adminId required" });

      const target = await Admin.findById(adminId);
      if (!target) return res.status(404).json({ success: false, error: "Target admin not found" });

      const daysNum = Number(days) || 365;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

      target.isFree = true;
      target.isPaid = true;
      target.paidUntil = expiresAt;
      await target.save();

      // log activity if model exists
      try {
        const Activity = mongoose.model("Activity");
        await Activity.create({ adminId: target._id, action: "granted_free", details: { grantedBy: actor._id, days: daysNum } });
      } catch (e) { /* ignore */ }

      // notify target admin and owner
      await sendTelegram(target.chatId || ADMIN_CHAT_ID, `🎁 You were granted free access for ${daysNum} days by ${actor.username}. Expires: ${expiresAt}`);
      await sendTelegram(ADMIN_CHAT_ID, `✅ Granted ${daysNum} days free to ${target.username}`);

      return res.json({ success: true, message: "Granted free access", admin: { id: target._id, username: target.username, paidUntil: target.paidUntil } });
    } catch (err) {
      console.error("grant-free error:", err && err.stack || err);
      return res.status(500).json({ success: false, error: "Grant failed", details: err && err.message });
    }
  });

  /**
   * POST /admin/compute-price (optional helper)
   * Body: { tier }
   * returns computed price after invite discount for current admin (if logged in)
   */
  router.post("/admin/compute-price", async (req, res) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: "Not authenticated" });
      const { tier } = req.body || {};
      if (!tier) return res.status(400).json({ success: false, error: "tier required" });

      const Admin = mongoose.model("Admin");
      const admin = await Admin.findById(req.userId).lean();
      const base = priceInKobo(tier);
      const final = discountedPrice(base, admin?.inviteCount || 0);

      return res.json({ success: true, base, final, discountPercent: computeDiscountPercent(admin?.inviteCount || 0) });
    } catch (err) {
      console.error("compute-price error:", err && err.message);
      return res.status(500).json({ success: false, error: "Failed to compute price" });
    }
  });

  // Cron job: every 10 minutes, expire subscriptions and notify
  // Only start cron if configured (avoid duplicate cron in dev where you may reload)
  try {
    if (!global.__SUBSCRIPTION_CRON_STARTED) {
      nodeCron.schedule("*/10 * * * *", async () => {
        try {
          await expireSubscriptionsAndNotify(sendTelegram);
        } catch (e) {
          console.error("subscription cron job failed:", e && e.message);
        }
      });
      global.__SUBSCRIPTION_CRON_STARTED = true;
      console.log("Subscription cron scheduled: runs every 10 minutes");
    }
  } catch (e) {
    console.warn("Failed to schedule subscription cron:", e && e.message);
  }

  // expose helpers on app (optional)
  app.locals.subscriptionHelpers = {
    activateSubscription,
    priceInKobo,
    discountedPrice,
    computeDiscountPercent
  };

  console.log("Subscriptions module initialized (sub.js). Endpoints mounted: /checkout, /payments/webhook, /admin/subscription-status, /admin/grant-free, /admin/compute-price");
  return router;
};