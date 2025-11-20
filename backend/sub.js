// sub.js — Subscription Module: Full-featured routes + premium + referral + renewal + broadcast
import express from "express";
import {
  PLANS,
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
  Activity
} from "./subLogic.js"; // the core logic from previous file

export default function subModule(app, options = {}) {
  const router = express.Router();
  const verifyToken = options.verifyToken || ((req, res, next) => next());
  app.use("/subscriptions", router);

  // ---------- CREATE / APPROVE SUBSCRIPTIONS ----------
  router.post("/activate", verifyToken, async (req, res) => {
    try {
      const { username, plan = "weekly", enableReferral = true } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Admin username required" });

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
      res.json({ success: true, message: `${plan} plan activated`, expiresAt: sub.expiresAt });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- REQUEST RENEWAL ----------
  router.post("/request-renewal", verifyToken, async (req, res) => {
    try {
      const adminId = req.userId || req.body.adminId;
      const { plan = "weekly" } = req.body;
      if (!adminId) return res.status(400).json({ success: false, error: "Missing adminId" });

      const result = await requestRenewal(adminId, plan);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- APPROVE RENEWAL ----------
  router.post("/approve-renewal", verifyToken, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ success: false, error: "Username required" });

      const result = await approveRenewal(username);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- STATUS CHECK ----------
  router.get("/status/:username", async (req, res) => {
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

  // ---------- LIST ALL SUBSCRIPTIONS ----------
  router.get("/all", verifyToken, async (req, res) => {
    try {
      const subs = await Subscription.find({}).populate("adminId", "username");
      res.json(subs);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- BROADCAST ----------
  router.post("/broadcast", verifyToken, async (req, res) => {
    try {
      const { message, onlyPaid = true } = req.body;
      if (!message) return res.status(400).json({ success: false, error: "Message required" });

      await broadcastAdmins(message, onlyPaid);
      res.json({ success: true, message: "Broadcast sent" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- MANUAL EXPIRE SUBSCRIPTIONS ----------
  router.post("/expire", verifyToken, async (req, res) => {
    try {
      await expireSubscriptions();
      res.json({ success: true, message: "Checked and expired subscriptions updated" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- RECONCILE PAID STATUS ----------
  router.post("/reconcile", verifyToken, async (req, res) => {
    try {
      await reconcilePaidStatus();
      res.json({ success: true, message: "Paid status reconciled for all admins" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- CLEAN STALE RENEWALS ----------
  router.post("/clean-renewals", verifyToken, async (req, res) => {
    try {
      const { days = 2 } = req.body;
      await cleanStaleRenewals(days);
      res.json({ success: true, message: `Stale renewal requests older than ${days} days cleaned` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------- GET ADMIN SUBSCRIPTIONS ----------
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
  return { router };
} 