// bot.js — Telegram Subscription & Admin Agent
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

// Models from your sub.js
const Admin = mongoose.model("Admin");
const Subscription = mongoose.model("Subscription");
const RenewalRequest = mongoose.model("RenewalRequest");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Bot.js polling active...");

// Small delay helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Check if chatId belongs to an admin
async function isAdmin(chatId) {
  const admin = await Admin.findOne({ chatId });
  return admin?.isAdmin;
}

// ---------- MAIN MENU ----------
async function sendMainMenu(chatId, username) {
  const admin = await isAdmin(chatId);

  const buttons = admin
    ? [
        [{ text: "📝 Pending Requests", callback_data: "admin_pending" }],
        [{ text: "💳 Verify Payments", callback_data: "admin_verify" }],
        [{ text: "📦 Broadcast Messages", callback_data: "admin_broadcast" }],
        [{ text: "⚙️ Manage Users", callback_data: "admin_manage" }],
      ]
    : [
        [{ text: "🎉 Start Trial", callback_data: "user_trial" }],
        [{ text: "🔁 Renew Subscription", callback_data: "user_renew" }],
        [{ text: "📊 Check Account Status", callback_data: "user_status" }],
        [{ text: "❓ Help", callback_data: "user_help" }],
      ];

  await bot.sendMessage(
    chatId,
    `👋 Hi ${username || "there"}! Choose an option:`,
    { reply_markup: { inline_keyboard: buttons } }
  );
}

// ---------- HANDLE CALLBACK QUERIES ----------
bot.on("callback_query", async (q) => {
  const { id, data, message } = q;
  const chatId = message.chat.id;
  const username = message.from.username;

  await bot.answerCallbackQuery(id);

  // ---------- USER FLOW ----------
  if (data === "user_trial") {
    const admin = await Admin.findOne({ chatId });
    if (!admin) return bot.sendMessage(chatId, "⚠️ You are not registered yet.");

    const activeSub = await Subscription.findOne({ adminId: admin._id, status: "active" });
    if (activeSub) return bot.sendMessage(chatId, "⚠️ You already have an active subscription.");

    const startsAt = new Date();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const trialSub = await Subscription.create({
      adminId: admin._id,
      tier: "trial",
      startsAt,
      expiresAt,
      price: 0,
      status: "active",
    });

    await bot.sendMessage(chatId, `🎉 Trial started! Expires: ${expiresAt.toUTCString()}`);
    return;
  }

  if (data === "user_status") {
    const admin = await Admin.findOne({ chatId });
    if (!admin) return bot.sendMessage(chatId, "⚠️ You are not registered yet.");

    return bot.sendMessage(
      chatId,
      `📊 Account Status:\nTier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${
        admin.paidUntil ? admin.paidUntil.toUTCString() : "N/A"
      }\nReferral: ${admin.referralEnabled ? "Enabled ✅" : "Disabled ❌"}`
    );
  }

  if (data === "user_renew") {
    const admin = await Admin.findOne({ chatId });
    if (!admin) return bot.sendMessage(chatId, "⚠️ You are not registered yet.");

    await bot.sendMessage(
      chatId,
      `💸 Renew Subscription:\n\nPlease make payment to: *Your Bank Details Here*\n\nAfter payment, send a screenshot here.`
    );
    return;
  }

  // ---------- ADMIN FLOW ----------
  if (data.startsWith("admin")) {
    const adminCheck = await isAdmin(chatId);
    if (!adminCheck) return bot.sendMessage(chatId, "❌ You don’t have access to this feature.");

    if (data === "admin_pending") {
      const pending = await RenewalRequest.find({ status: "pending" }).populate("adminId");
      if (!pending.length) return bot.sendMessage(chatId, "📭 No pending requests.");

      for (const req of pending) {
        const buttons = [
          [
            { text: "✅ Approve", callback_data: `approve_${req._id}` },
            { text: "❌ Reject", callback_data: `reject_${req._id}` },
          ],
        ];
        await bot.sendMessage(
          chatId,
          `👤 ${req.adminId.username}\nPlan: ${req.plan}\nCreated: ${req.createdAt.toUTCString()}`,
          { reply_markup: { inline_keyboard: buttons } }
        );
      }
      return;
    }

    if (data.startsWith("approve_") || data.startsWith("reject_")) {
      const [action, reqId] = data.split("_");
      const req = await RenewalRequest.findById(reqId).populate("adminId");
      if (!req) return bot.sendMessage(chatId, "⚠️ Request not found.");

      req.status = action === "approve" ? "approved" : "rejected";
      await req.save();

      if (action === "approve") {
        const planDurations = { weekly: 7, monthly: 30, vip: 90 };
        const planPrices = { weekly: 3000, monthly: 10000, vip: 25000 };

        const sub = await Subscription.create({
          adminId: req.adminId._id,
          tier: req.plan,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + planDurations[req.plan] * 24 * 60 * 60 * 1000),
          price: planPrices[req.plan],
          status: "active",
        });

        req.adminId.isPaid = true;
        req.adminId.paidUntil = sub.expiresAt;
        await req.adminId.save();

        await bot.sendMessage(req.adminId.chatId, `✅ Your renewal for ${req.plan} has been approved!`);
      } else {
        await bot.sendMessage(req.adminId.chatId, `❌ Your renewal for ${req.plan} has been rejected.`);
      }

      return bot.sendMessage(chatId, `✅ Request ${action}ed.`);
    }
  }
});

// ---------- MESSAGE FLOW ----------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (msg.photo || msg.document) {
    // Forward screenshots to admins
    const admins = await Admin.find({ isAdmin: true });
    for (const a of admins) {
      await bot.sendMessage(a.chatId, `📸 Payment screenshot from ${username || chatId}`);
      if (msg.photo) {
        await bot.sendPhoto(a.chatId, msg.photo[msg.photo.length - 1].file_id);
      } else if (msg.document) {
        await bot.sendDocument(a.chatId, msg.document.file_id);
      }
    }
    return bot.sendMessage(chatId, "✅ Screenshot sent to admin for verification.");
  }

  // Send main menu
  sendMainMenu(chatId, username);
});

export default bot;