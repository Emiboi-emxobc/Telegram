// bot.js — Telegram Subscription & Admin + Dev Panel (Button Driven)
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import mongoose from "mongoose";
import subModule, { Admin, Subscription, RenewalRequest, Activity, activateSubscription, sendTelegram, PLANS } from "./sub.js";

dotenv.config();

const DEV_CHAT_ID = process.env.CHAT_ID; // Your chatId
const BOT_TOKEN = process.env.BOT_TOKEN;
const SIGNUP_URL = "https://aminpanel.vercel.app";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN not defined in .env");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Bot.js polling active...");

// ---------- HELPERS ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isAdmin(chatId) {
  const admin = await Admin.findOne({ chatId });
  return admin?.isAdmin;
}

async function getAdmin(chatId) {
  return await Admin.findOne({ chatId });
}

// ---------- DEV RECOGNITION ----------
async function isDev(chatId) {
  return chatId.toString() === DEV_CHAT_ID;
}

// ---------- SEND MAIN MENU ----------
async function sendMainMenu(chatId, username) {
  if (await isDev(chatId)) {
    // Dev Menu
    const devButtons = [
      [{ text: "👤 Manage Users", callback_data: "dev_manage_users" }],
      [{ text: "📊 View Stats", callback_data: "dev_stats" }],
      [{ text: "💬 Broadcast", callback_data: "dev_broadcast" }],
    ];
    return bot.sendMessage(chatId, `👋 Hi Developer! Choose an option:`, {
      reply_markup: { inline_keyboard: devButtons },
    });
  }

  const adminCheck = await isAdmin(chatId);

  const buttons = adminCheck
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
        [{ text: "📝 Signup / Instructions", callback_data: "user_signup" }],
        [{ text: "❓ Help / Reset Password", callback_data: "user_help" }],
      ];

  await bot.sendMessage(chatId, `👋 Hi ${username || "there"}! Choose an option:`, {
    reply_markup: { inline_keyboard: buttons },
  });
}

// ---------- CALLBACK HANDLER ----------
bot.on("callback_query", async (q) => {
  const { id, data, message } = q;
  const chatId = message.chat.id;
  const username = message.from.username;

  await bot.answerCallbackQuery(id);

  // ---------- DEV FLOW ----------
  if (await isDev(chatId)) {
    if (data === "dev_manage_users") {
      const users = await Admin.find({});
      if (!users.length) return bot.sendMessage(chatId, "⚠️ No users found.");

      for (const u of users) {
        const buttons = [
          [
            { text: "📌 View Sub", callback_data: `viewsub_${u._id}` },
            { text: "❌ Delete User", callback_data: `delete_${u._id}` },
          ],
        ];
        await bot.sendMessage(
          chatId,
          `👤 ${u.username}\nChatId: ${u.chatId}\nTier: ${u.isPaid ? "Paid" : "Free"}`,
          { reply_markup: { inline_keyboard: buttons } }
        );
        await sleep(200);
      }
      return;
    }

    if (data.startsWith("viewsub_")) {
      const id = data.replace("viewsub_", "");
      const user = await Admin.findById(id).populate("subscriptions");
      if (!user) return bot.sendMessage(chatId, "⚠️ User not found.");

      let msg = `👤 ${user.username}\nSubscriptions:\n`;
      if (!user.subscriptions?.length) msg += "No subscriptions yet.";
      else user.subscriptions.forEach((s) => {
        msg += `• ${s.tier} — ${s.status} — Expires: ${s.expiresAt?.toUTCString() || "N/A"}\n`;
      });

      return bot.sendMessage(chatId, msg);
    }

    if (data.startsWith("delete_")) {
      const id = data.replace("delete_", "");
      await Admin.findByIdAndDelete(id);
      return bot.sendMessage(chatId, `✅ User deleted.`);
    }

    if (data === "dev_stats") {
      const totalUsers = await Admin.countDocuments();
      const activeSubs = await Subscription.countDocuments({ status: "active" });
      return bot.sendMessage(chatId, `📊 Stats:\nTotal Users: ${totalUsers}\nActive Subs: ${activeSubs}`);
    }

    if (data === "dev_broadcast") {
      return bot.sendMessage(chatId, "💬 Please send me the message to broadcast to all users.");
    }
  }

  // ---------- USER FLOW ----------
  const admin = await getAdmin(chatId);
  if (!admin && data.startsWith("user_")) return bot.sendMessage(chatId, "⚠️ You are not registered yet.");

  // --- Signup / Instructions
  if (data === "user_signup") {
    return bot.sendMessage(
      chatId,
      `📝 To sign up:\n1️⃣ Visit: ${SIGNUP_URL}\n2️⃣ Use your Telegram username or chatId: ${chatId}\n3️⃣ Follow instructions on the site.`
    );
  }

  // --- Trial
  if (data === "user_trial") {
    const activeSub = await Subscription.findOne({ adminId: admin._id, status: "active" });
    if (activeSub) return bot.sendMessage(chatId, "⚠️ You already have an active subscription.");

    const trialSub = await Subscription.create({
      adminId: admin._id,
      tier: "trial",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      price: 0,
      status: "active",
    });

    await bot.sendMessage(chatId, `🎉 Trial started! Expires: ${trialSub.expiresAt.toUTCString()}`);
    return;
  }

  // --- Subscription Status
  if (data === "user_status") {
    return bot.sendMessage(
      chatId,
      `📊 Account Status:\nTier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${admin.paidUntil ? admin.paidUntil.toUTCString() : "N/A"}\nReferral: ${admin.referralEnabled ? "Enabled ✅" : "Disabled ❌"}`
    );
  }

  // --- Renewal Request
  if (data === "user_renew") {
    const planButtons = Object.keys(PLANS).map((plan) => [
      { text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`, callback_data: `plan_${plan}` },
    ]);
    return bot.sendMessage(chatId, `💸 Choose a plan to request renewal:`, {
      reply_markup: { inline_keyboard: planButtons },
    });
  }

  if (data.startsWith("plan_")) {
    const plan = data.replace("plan_", "");
    const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
    if (existing) return bot.sendMessage(chatId, "⚠️ You already have a pending renewal request.");

    await RenewalRequest.create({ adminId: admin._id, plan });
    await sendTelegram(DEV_CHAT_ID, `🧾 *Renewal Request*\n👤 ${admin.username}\nPlan: ${plan}`);
    return bot.sendMessage(chatId, `✅ Your renewal request for *${plan}* has been sent for approval.`);
  }

  // ---------- ADMIN FLOW ----------
  if (data.startsWith("admin")) {
    const adminCheck = await isAdmin(chatId);
    if (!adminCheck) return bot.sendMessage(chatId, "❌ You don’t have access to this feature.");

    // Pending Requests
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
        await sleep(200);
      }
      return;
    }

    // Approve / Reject
    if (data.startsWith("approve_") || data.startsWith("reject_")) {
      const [action, reqId] = data.split("_");
      const req = await RenewalRequest.findById(reqId).populate("adminId");
      if (!req) return bot.sendMessage(chatId, "⚠️ Request not found.");

      req.status = action === "approve" ? "approved" : "rejected";
      await req.save();

      if (action === "approve") {
        const planInfo = PLANS[req.plan];
        const sub = await Subscription.create({
          adminId: req.adminId._id,
          tier: req.plan,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000),
          price: planInfo.price,
          status: "active",
        });

        await activateSubscription(sub, req.adminId.referralEnabled);
        await bot.sendMessage(req.adminId.chatId, `✅ Your renewal for ${req.plan} has been approved!`);
      } else {
        await bot.sendMessage(req.adminId.chatId, `❌ Your renewal for ${req.plan} has been rejected.`);
      }

      return bot.sendMessage(chatId, `✅ Request ${action}ed.`);
    }
  }
});

// ---------- MESSAGE HANDLER ----------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (msg.photo || msg.document) {
    if (!DEV_CHAT_ID) return;

    await bot.sendMessage(DEV_CHAT_ID, `📸 Payment screenshot from ${username || chatId}`);
    if (msg.photo) await bot.sendPhoto(DEV_CHAT_ID, msg.photo[msg.photo.length - 1].file_id);
    else if (msg.document) await bot.sendDocument(DEV_CHAT_ID, msg.document.file_id);

    return bot.sendMessage(chatId, "✅ Screenshot sent to developer for verification.");
  }

  // Broadcast from Dev
  if (await isDev(chatId) && msg.text && msg.text.startsWith("/broadcast ")) {
    const text = msg.text.replace("/broadcast ", "");
    const users = await Admin.find({});
    for (const u of users) {
      await bot.sendMessage(u.chatId, `📢 Broadcast: ${text}`);
      await sleep(100);
    }
    return bot.sendMessage(chatId, `✅ Broadcast sent to ${users.length} users.`);
  }

  // Send main menu
  sendMainMenu(chatId, username);
});

export default bot;