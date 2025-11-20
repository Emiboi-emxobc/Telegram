// bot.js — Telegram Subscription & Admin + Dev Panel (Button + Command Driven)
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import mongoose from "mongoose";
import subModule, {
  Admin,
  Subscription,
  RenewalRequest,
  Activity,
  activateSubscription,
  sendTelegram,
  PLANS,
} from "./sub.js";

import { bot } from "./botConfig.js";
import {
  devMainButtons,
  adminMainButtons,
  userMainButtons,
  renewalPlanButtons,
  approveRejectButtons,
  devApproveRejectButtons,
  manageUserButtons,
  broadcastConfirmButtons,
  subscriptionActionButtons,
} from "./button.js";

const DEV_CHAT_ID = process.env.ADMIN_CHAT_ID;
const SIGNUP_URL = process.env.SIGNUP_URL || "https://aminpanel.vercel.app";

const convoState = new Map(); // multi-step flows

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toId = (s) => s?.toString();

// ---------- Helpers ----------
async function getAdmin(chatId) {
  return await Admin.findOne({ chatId: toId(chatId) });
}

function isDev(admin) {
  return admin && admin.isAdmin && admin.chatId.toString() === DEV_CHAT_ID?.toString();
}

async function sendMenu(chatId, text, buttons) {
  return bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: buttons } });
}

// ---------- Main menu ----------
async function sendMainMenu(chatId, admin) {
  const username = admin?.username || "there";

  if (isDev(admin)) {
    return sendMenu(chatId, `👋 Hi Developer! Choose an option:`, devMainButtons());
  }

  if (admin?.isAdmin) {
    const buttons = [...adminMainButtons(true), ...userMainButtons()];
    return sendMenu(chatId, `👋 Hi Admin ${username}! Choose an option:`, buttons);
  }

  return sendMenu(chatId, `👋 Hi ${username}! Choose an option:`, userMainButtons());
}

// ---------- CALLBACK QUERY ----------
bot.on("callback_query", async (q) => {
  const { id, data, message } = q;
  const chatId = message?.chat?.id;

  try {
    if (id) await bot.answerCallbackQuery(id);
    if (!data) return;

    const admin = await getAdmin(chatId);

    // -------- DEV --------
    if (isDev(admin)) {
      if (data === "dev_manage_users") {
        const users = await Admin.find({}).lean();
        if (!users.length) return bot.sendMessage(chatId, "⚠️ No users found.");
        for (const u of users) {
          await sendMenu(chatId, `👤 ${u.username || u.phone}\nChatId: ${u.chatId}\nTier: ${u.isPaid ? "Paid" : "Free"}`, manageUserButtons(u._id));
          await sleep(150);
        }
        return;
      }

      if (data === "dev_stats") {
        const totalUsers = await Admin.countDocuments();
        const activeSubs = await Subscription.countDocuments({ status: "active" });
        const pending = await RenewalRequest.countDocuments({ status: "pending" });
        return bot.sendMessage(chatId, `📊 Stats:\nTotal Users: ${totalUsers}\nActive Subs: ${activeSubs}\nPending Renewals: ${pending}`);
      }

      if (data === "dev_broadcast") {
        convoState.set(toId(chatId), { action: "await_broadcast" });
        return bot.sendMessage(chatId, "✉️ Send the message you want to broadcast. /cancel to abort");
      }

      if (data === "dev_commands") {
        return bot.sendMessage(chatId, `
Dev Commands:
/broadcast <msg>
/check <username>
/delete <username|id>
/subscribe <username> <plan>
/pending
/cancel
`);
      }
    }

    // -------- DEV approve/reject --------
    if (data.startsWith("dev_approve_") || data.startsWith("dev_reject_")) {
      const [_, action, ...rest] = data.split("_");
      const reqId = rest.join("_");
      const req = await RenewalRequest.findById(reqId).populate("adminId");
      if (!req) return bot.sendMessage(chatId, "❌ Renewal request not found.");

      req.status = action === "approve" ? "approved" : "rejected";
      await req.save();

      if (action === "approve") {
        const planInfo = PLANS[req.plan];
        const expiresAt = new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000);
        const sub = await Subscription.create({
          adminId: req.adminId._id,
          tier: req.plan,
          startsAt: new Date(),
          expiresAt,
          price: planInfo.price,
          status: "active",
        });
        await activateSubscription(sub, req.adminId.referralEnabled);
        await bot.sendMessage(req.adminId.chatId, `✅ Your renewal for ${req.plan} has been approved! Expires: ${expiresAt.toUTCString()}`);
      } else {
        await bot.sendMessage(req.adminId.chatId, `❌ Your renewal for ${req.plan} was rejected.`);
      }

      try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id }); } catch (e) {}
      return;
    }

    // -------- USER / ADMIN --------
    if (!admin && data.startsWith("user_")) {
      return bot.sendMessage(chatId, `⚠️ Not registered yet.\nSign up: ${SIGNUP_URL}\nYour Chat ID: ${chatId}`, { parse_mode: "Markdown" });
    }

    // User signup / instructions
    if (data === "user_signup") return bot.sendMessage(chatId, `📝 Signup instructions: ${SIGNUP_URL}`);

    // Start trial
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
      admin.isPaid = true;
      admin.paidUntil = trialSub.expiresAt;
      await admin.save();

      return bot.sendMessage(chatId, `🎉 Trial started! Expires: ${trialSub.expiresAt.toUTCString()}`);
    }

    // Status
    if (data === "user_status") {
      return bot.sendMessage(chatId, `📊 Status:\nTier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${admin.paidUntil?.toUTCString() || "N/A"}`);
    }

    // Renewal plan selection
    if (data === "user_renew") return sendMenu(chatId, "💸 Choose a plan:", renewalPlanButtons());

    if (data.startsWith("plan_")) {
      const plan = data.replace("plan_", "");
      const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
      if (existing) return bot.sendMessage(chatId, "⚠️ You have a pending request.");

      const req = await RenewalRequest.create({ adminId: admin._id, plan });
      await sendMenu(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username}\nPlan: ${plan}\nReqId: ${req._id}`, devApproveRejectButtons(req._id));
      return bot.sendMessage(chatId, `✅ Renewal request for *${plan}* sent.`, { parse_mode: "Markdown" });
    }

    // Admin panel
    if (data.startsWith("admin") && admin?.isAdmin) {
      if (data === "admin_pending") {
        const pending = await RenewalRequest.find({ status: "pending" }).populate("adminId");
        if (!pending.length) return bot.sendMessage(chatId, "📭 No pending requests.");
        for (const req of pending) {
          await sendMenu(chatId, `👤 ${req.adminId.username}\nPlan: ${req.plan}`, approveRejectButtons(req._id));
          await sleep(150);
        }
        return;
      }
    }

    // fallback — nothing
    return;

  } catch (err) {
    console.error("callback_query error:", err);
    try { if (chatId) await bot.sendMessage(chatId, "⚠️ Something went wrong handling that button."); } catch(e){}
  }
});

// ---------- MESSAGE HANDLER ----------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const admin = await getAdmin(chatId);
  const state = convoState.get(toId(chatId));

  try {
    // Developer broadcast
    if (state?.action === "await_broadcast") {
      if (text === "/cancel") {
        convoState.delete(toId(chatId));
        return bot.sendMessage(chatId, "✖️ Broadcast cancelled.");
      }
      if (!isDev(admin)) return bot.sendMessage(chatId, "❌ Not allowed.");

      convoState.delete(toId(chatId));
      const users = await Admin.find({ chatId: { $exists: true } }).lean();
      for (const u of users) {
        try { await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${text}`); await sleep(100); } catch(e){console.warn(e);}
      }
      return bot.sendMessage(chatId, `✅ Broadcast sent to ${users.length} users.`);
    }

    // Forward photo/document to dev
    if (msg.photo || msg.document) {
      if (DEV_CHAT_ID) {
        await bot.sendMessage(DEV_CHAT_ID, `📸 Payment screenshot from ${admin?.username || chatId}`);
        if (msg.photo) await bot.sendPhoto(DEV_CHAT_ID, msg.photo[msg.photo.length-1].file_id);
        else if (msg.document) await bot.sendDocument(DEV_CHAT_ID, msg.document.file_id);
        return bot.sendMessage(chatId, "✅ Screenshot sent for verification.");
      }
      return bot.sendMessage(chatId, "⚠️ Developer not configured.");
    }

    // Dev commands via text
    if (isDev(admin) && text.startsWith("/")) {
      if (text.startsWith("/broadcast ")) {
        const payload = text.replace("/broadcast ", "").trim();
        const users = await Admin.find({ chatId: { $exists: true } }).lean();
        for (const u of users) { try{ await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${payload}`); await sleep(100);} catch(e){} }
        return bot.sendMessage(chatId, `✅ Broadcast done.`);
      }
      if (text === "/cancel") { convoState.delete(toId(chatId)); return bot.sendMessage(chatId, "✅ Cancelled."); }
    }

    // Fallback user commands
    if (text === "/start") return sendMainMenu(chatId, admin);
    if (text === "/help") return bot.sendMessage(chatId, "🧾 Help Menu:\n/start — Main menu\n/status — Check subscription\n/trial — Start free trial");

  } catch(err) {
    console.error("message handler error:", err);
    await bot.sendMessage(chatId, "⚠️ Error handling your request.");
  }
});

console.log("✅ Telegram bot fully operational.");  