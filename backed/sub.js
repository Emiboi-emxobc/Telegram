// sub.js — Subscription Module: Full-featured + frontend activation + extended plans
import express from "express";
import {
  PLANS as BASE_PLANS,
  sendTelegram,
  addDays,
  activateSubscription,
  expireSubscriptions,
  requestRenewal,
  approveRenewal,
  broadcastAdmins,
  reconcilePaidStatus,
  cleanStaleRenewals,
  notifyExpiredAdmins,
  Admin,
  Subscription,
  RenewalRequest,
  Activity,
} from "./subLogic.js";

export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());

  // --- Admin-only middleware ---
  const requireAdmin = async (req, res, next) => {
    const user = await Admin.findById(req.userId);
    if (!user || !user.isAdmin)
      return res.status(403).json({ success: false, error: "Forbidden" });
    req.user = user;
    next();
  };

  app.use("/subscriptions", router);

  // --- Extended plans ---
  const PLANS = {
    daily: { price: 500, days: 1 },
    weekly: { price: 3000, days: 7 },
    monthly: { price: 12000, days: 30 },
    yearly: { price: 120000, days: 365 },
    vip: { price: 25000, days: 90 },
    ...BASE_PLANS,
  };

  // ---------- FRONTEND: ACTIVATE LOGGED-IN USER ----------
  router.post("/activate-me", verifyToken, async (req, res) => {
    try {
      const user = await Admin.findById(req.userId);
      if (!user) return res.status(404).json({ success: false, error: "User not found" });

      const { plan = "weekly", enableReferral = true } = req.body;
      const planInfo = PLANS[plan];
      if (!planInfo) return res.status(400).json({ success: false, error: "Invalid plan" });

      const sub = await Subscription.create({
        adminId: user._id,
        tier: plan,
        startsAt: new Date(),
        expiresAt: addDays(planInfo.days),
        price: planInfo.price,
        status: "active",
      });

      await activateSubscription(sub, enableReferral);

      if (user.chatId) {
        await sendTelegram(
          user.chatId,
          `✅ Hi ${user.username}! Your ${plan.toUpperCase()} subscription is active. Price: ₦${sub.price.toLocaleString()} Expires: ${sub.expiresAt.toUTCString()}`
        );
      }

      return res.json({
        success: true,
        message: `Subscription activated for ${plan} plan`,
        expiresAt: sub.expiresAt,
      });
    } catch (err) {
      console.error("ACTIVATE-ME ERROR:", err);
      res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---------- ADMIN: ACTIVATE OTHER USERS ----------
  router.post("/activate", verifyToken, requireAdmin, async (req, res) => {
    try {
      const { username, plan = "weekly", enableReferral = true } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Username required" });

      const admin = await Admin.findOne({ username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const planInfo = PLANS[plan];
      if (!planInfo) return res.status(400).json({ success: false, error: "Invalid plan" });

      const sub = await Subscription.create({
        adminId: admin._id,
        tier: plan,
        startsAt: new Date(),
        expiresAt: addDays(planInfo.days),
        price: planInfo.price,
        status: "active",
      });

      await activateSubscription(sub, enableReferral);

      if (admin.chatId) {
        await sendTelegram(
          admin.chatId,
          `✅ ${plan.toUpperCase()} subscription activated. Price: ₦${sub.price.toLocaleString()} Expires: ${sub.expiresAt.toUTCString()}`
        );
      }

      res.json({ success: true, message: `${plan} plan activated`, expiresAt: sub.expiresAt });
    } catch (err) {
      console.error("ACTIVATE ERROR:", err);
      res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---------- Other routes: reuse existing logic ----------
  router.post("/request-renewal", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId || req.body.adminId;
      const { plan = "weekly" } = req.body;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });
      const planInfo = PLANS[plan];
      if (!planInfo) return res.status(400).json({ success: false, error: "Invalid plan" });

      const result = await requestRenewal(adminId, plan);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/approve-renewal", verifyToken, requireAdmin, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Username required" });

      const result = await approveRenewal(username);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/status/:username", verifyToken, async (req, res) => {
    try {
      const admin = await Admin.findOne({ username: req.params.username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      res.json({
        username: admin.username,
        isPaid: !!admin.isPaid,
        tier: admin.tier || null,
        paidUntil: admin.paidUntil,
        referralEnabled: !!admin.referralEnabled,
        referralDiscount: admin.adminReferralDiscount || 0,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/all", verifyToken, requireAdmin, async (req, res) => {
    try {
      const subs = await Subscription.find({}).populate("adminId", "username");
      res.json(subs);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/broadcast", verifyToken, requireAdmin, async (req, res) => {
    try {
      const { message, onlyPaid = true } = req.body;
      if (!message) return res.status(400).json({ success: false, error: "Message required" });

      await broadcastAdmins(message, onlyPaid);
      res.json({ success: true, message: "Broadcast sent" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/expire", verifyToken, requireAdmin, async (req, res) => {
    try {
      await expireSubscriptions();
      res.json({ success: true, message: "Expired subscriptions updated" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/reconcile", verifyToken, requireAdmin, async (req, res) => {
    try {
      await reconcilePaidStatus();
      res.json({ success: true, message: "Paid status reconciled for all admins" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/clean-renewals", verifyToken, requireAdmin, async (req, res) => {
    try {
      const { days = 2 } = req.body;
      await cleanStaleRenewals(days);
      res.json({ success: true, message: `Stale renewals older than ${days} days cleaned` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/my-subs/:username", verifyToken, async (req, res) => {
    try {
      const admin = await Admin.findOne({ username: req.params.username });
      if (!admin) return res.status(404).json({ success: false, error: "Admin not found" });

      const subs = await Subscription.find({ adminId: admin._id }).sort({ startsAt: -1 });
      res.json({ success: true, subscriptions: subs });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("✅ Subscription routes fully active");
  return { router, PLANS };
}

export { PLANS, Admin, Subscription, RenewalRequest, Activity };