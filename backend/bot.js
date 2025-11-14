// bot.js — Telegram Subscription & Admin + Dev Panel (Button + Command Driven)
// Place next to sub.js; requires sub.js exports: Admin, Subscription, RenewalRequest, Activity, activateSubscription, sendTelegram, PLANS

import "dotenv/config"; // loads process.env
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const DEV_CHAT_ID = process.env.ADMIN_CHAT_ID; // developer chat id (string or number)
const SIGNUP_URL = process.env.SIGNUP_URL || "https://aminpanel.vercel.app";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN not defined in environment");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI not defined in environment");

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB connected (bot.js)");

if (!DEV_CHAT_ID) console.warn("DEV_CHAT_ID not defined — dev-only features disabled.");



const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Bot.js polling active...");

// In-memory conversation state for multi-step flows (broadcast, subscribe, etc.)
const convoState = new Map(); // key: chatId (string), value: { action, meta }

// small helper to pause
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Helpers
async function isAdmin(chatId) {
  const a = await Admin.findOne({ chatId: chatId.toString() });
  return a && a.chatId.toString() === DEV_CHAT_ID.toString();
}
async function getAdminByChat(chatId) {
  return await Admin.findOne({ chatId: chatId.toString() });
}
function isDev(chatId) {
  if (!DEV_CHAT_ID) return false;
  return chatId.toString() === DEV_CHAT_ID.toString();
}
function toId(s) {
  return s ? s.toString() : s;
}

// UI helpers
async function sendMainMenu(chatId, username) {
  try {
    // developer menu (if dev)
    if (isDev(chatId)) {
      const devButtons = [
        [{ text: "👤 Manage Users", callback_data: "dev_manage_users" }],
        [{ text: "📊 View Stats", callback_data: "dev_stats" }],
        [{ text: "💬 Broadcast", callback_data: "dev_broadcast" }],
        [{ text: "🛠️ Dev Commands", callback_data: "dev_commands" }],
      ];
      return bot.sendMessage(chatId, `👋 Hi Developer! Choose an option:`, {
        reply_markup: { inline_keyboard: devButtons },
      });
    }

    const adminCheck = await isDev(chatId);
    const buttons = adminCheck
      ? [
          [{ text: "📝 Pending Requests", callback_data: "admin_pending" }],
          [{ text: "💳 Verify Payments", callback_data: "admin_verify" }],
          [{ text: "📦 Broadcast Messages", callback_data: "admin_broadcast" }],
          [{ text: "⚙️ Manage Users", callback_data: "admin_manage" }],
          [{ text: "🎉 Start Trial", callback_data: "user_trial" }],
          [{ text: "🔁 Renew Subscription", callback_data: "user_renew" }],
          [{ text: "📊 Check Account Status", callback_data: "user_status" }],
          [{ text: "📝 Signup / Instructions", callback_data: "user_signup" }],
          [{ text: "❓ Help / Reset Password", callback_data: "user_help" }]
       
      ]: [
          [{ text: "🎉 Start Trial", callback_data: "user_trial" }],
          [{ text: "🔁 Renew Subscription", callback_data: "user_renew" }],
          [{ text: "📊 Check Account Status", callback_data: "user_status" }],
          [{ text: "📝 Signup / Instructions", callback_data: "user_signup" }],
          [{ text: "❓ Help / Reset Password", callback_data: "user_help" }]
          ]
        ;

    await bot.sendMessage(chatId, `👋 Hi ${username || "there"}! Choose an option:`, {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error("sendMainMenu failed:", err);
  }
}

// ---------- Unified CALLBACK QUERY handler (buttons) ----------
bot.on("callback_query", async (q) => {
  const { id, data, message } = q;
  const chatId = message?.chat?.id;
  const fromUsername = message?.from?.username;

  try {
    // always answer to avoid "spinning" UI
    if (id) await bot.answerCallbackQuery(id);

    if (!data) return;

    // ---------- DEV FLOWS ----------
    if (isDev(chatId)) {
      // Manage Users list
      if (data === "dev_manage_users") {
        const users = await Admin.find({}).lean();
        if (!users.length) return bot.sendMessage(chatId, "⚠️ No users found.");
        for (const u of users) {
          const buttons = [
            [
              { text: "❌ Delete User", callback_data: `delete_${u._id}` },
              { text: "📌 View Sub", callback_data: `viewsub_${u._id}` },
            ],
          ];
          await bot.sendMessage(
            chatId,
            `👤 ${u.username || u.phone}\nChatId: ${u.chatId}\nTier: ${u.isPaid ? "Paid" : "Free"}`,
            { reply_markup: { inline_keyboard: buttons } }
          );
          await sleep(150);
        }
        return;
      }

      // View subscriptions for a user by id
      if (data.startsWith("viewsub_")) {
        const id = data.replace("viewsub_", "");
        const user = await Admin.findById(id);
        if (!user) return bot.sendMessage(chatId, "⚠️ User not found.");
        const subs = await Subscription.find({ adminId: user._id }).sort({ createdAt: -1 }).lean();
        let msg = `👤 ${user.username || user.phone}\nIsAdmin: ${user.isAdmin}\nIsPaid: ${user.isPaid}\nPaidUntil: ${user.paidUntil || "N/A"}\n\nSubscriptions:\n`;
        if (!subs.length) msg += "No subscriptions yet.";
        else subs.forEach((s) => {
          msg += `• ${s.tier} — ${s.status} — Expires: ${s.expiresAt ? s.expiresAt.toUTCString() : "N/A"} — ₦${s.price}\n`;
        });
        return bot.sendMessage(chatId, msg);
      }

      // delete user
      if (data.startsWith("delete_")) {
        const id = data.replace("delete_", "");
        await Admin.findByIdAndDelete(id);
        await RenewalRequest.deleteMany({ adminId: id });
        await Subscription.deleteMany({ adminId: id });
        return bot.sendMessage(chatId, `✅ User deleted and related subscription data removed.`);
      }

      // dev stats
      if (data === "dev_stats") {
        const totalUsers = await Admin.countDocuments();
        const activeSubs = await Subscription.countDocuments({ status: "active" });
        const pending = await RenewalRequest.countDocuments({ status: "pending" });
        return bot.sendMessage(chatId, `📊 Stats:\nTotal Users: ${totalUsers}\nActive Subs: ${activeSubs}\nPending Renewals: ${pending}`);
      }

      // start broadcast flow
      if (data === "dev_broadcast") {
        convoState.set(toId(chatId), { action: "await_broadcast", meta: {} });
        return bot.sendMessage(chatId, "✉️ Send the message you want to broadcast to all users. (Send /cancel to abort)");
      }

      // dev commands list
      if (data === "dev_commands") {
        const txt = `Dev Commands (text):
/broadcast <message> — broadcast immediately
/check <username> — check subscription for username
/delete <username|id> — delete user
/subscribe <username> <plan> — create subscription for user (plan: weekly|monthly|vip)
/pending — list pending renewals
/cancel — abort current multi-step action`;
        return bot.sendMessage(chatId, txt);
      }
    }

    // ---------- Handle dev approve/reject callbacks (dev_approve_<id>, dev_reject_<id>) ----------
    if (data.startsWith("dev_approve_") || data.startsWith("dev_reject_")) {
      const parts = data.split("_");
      const action = parts[1]; // approve or reject
      const reqId = parts.slice(2).join("_"); // support ids with underscores
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
        await bot.sendMessage(chatId, `🎉 Approved renewal for ${req.adminId.username}`);
      } else {
        await bot.sendMessage(req.adminId.chatId, `❌ Your renewal for ${req.plan} was rejected.`);
        await bot.sendMessage(chatId, `🚫 Rejected renewal for ${req.adminId.username}`);
      }

      // clear inline buttons on the original message (best-effort)
      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });
      } catch (e) {}
      return;
    }

    // ---------- USER / ADMIN FLOWS ----------
    const admin = await getAdminByChat(chatId);

    // if user clicks user_* but not registered
    if (data.startsWith("user_") && !admin) {
      return bot.sendMessage(chatId, "⚠️ You are not registered yet. Visit the site to sign up or send your Telegram username to the dev.");
    }

    // User Signup / Instructions
    if (data === "user_signup") {
      return bot.sendMessage(chatId, `📝 To sign up:\n1) Visit: ${SIGNUP_URL}\n2) Use your Telegram username or chatId: ${chatId}\n3) Follow instructions on the site.`);
    }

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

      await bot.sendMessage(chatId, `🎉 Trial started! Expires: ${trialSub.expiresAt.toUTCString()}`);
      return;
    }

    // Status
    if (data === "user_status") {
      return bot.sendMessage(
        chatId,
        `📊 Account Status:\nTier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${admin.paidUntil ? admin.paidUntil.toUTCString() : "N/A"}\nReferral: ${admin.referralEnabled ? "Enabled ✅" : "Disabled ❌"}`
      );
    }

    // Renewal request - PLAN selection
    if (data === "user_renew") {
      const planButtons = Object.keys(PLANS).map((plan) => [
        {
          text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`,
          callback_data: `plan_${plan}`,
        },
      ]);
      return bot.sendMessage(chatId, `💸 Choose a plan to request renewal:`, { reply_markup: { inline_keyboard: planButtons } });
    }

    // user clicked specific plan (plan_weekly etc.)
    if (data.startsWith("plan_")) {
      const plan = data.replace("plan_", "");
      const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
      if (existing) return bot.sendMessage(chatId, "⚠️ You already have a pending renewal request.");

      const req = await RenewalRequest.create({ adminId: admin._id, plan });
      // notify dev with inline approve/reject buttons
      const buttons = [[{ text: "✅ Approve", callback_data: `dev_approve_${req._id}` }, { text: "❌ Reject", callback_data: `dev_reject_${req._id}` }]];
      await sendTelegram(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`);
      await bot.sendMessage(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`, {
        reply_markup: { inline_keyboard: buttons },
      });

      return bot.sendMessage(chatId, `✅ Your renewal request for *${plan}* has been sent for approval.`, { parse_mode: "Markdown" });
    }

    // ---------- ADMIN FLOWS (admin panel) ----------
    if (data.startsWith("admin")) {
      const adminCheck = await isAdmin(chatId);
      if (!adminCheck) return bot.sendMessage(chatId, "❌ You don’t have access to this feature.");

      // List pending and show approve/reject for each
      if (data === "admin_pending") {
        const pending = await RenewalRequest.find({ status: "pending" }).populate("adminId");
        if (!pending.length) return bot.sendMessage(chatId, "📭 No pending requests.");

        for (const req of pending) {
          const buttons = [[{ text: "✅ Approve", callback_data: `approve_${req._id}` }, { text: "❌ Reject", callback_data: `reject_${req._id}` }]];
          await bot.sendMessage(chatId, `👤 ${req.adminId.username}\nPlan: ${req.plan}\nCreated: ${req.createdAt.toUTCString()}`, {
            reply_markup: { inline_keyboard: buttons },
          });
          await sleep(150);
        }
        return;
      }

      // Approve / Reject buttons for admins (approve_<id> / reject_<id>)
      if (data.startsWith("approve_") || data.startsWith("reject_")) {
        // action may be approve or reject; id may contain underscores so pop last
        const parts = data.split("_");
        const action = parts[0]; // 'approve' or 'reject'
        const reqId = parts.slice(1).join("_");
        const reqDoc = await RenewalRequest.findById(reqId).populate("adminId");
        if (!reqDoc) return bot.sendMessage(chatId, "⚠️ Request not found.");

        reqDoc.status = action === "approve" ? "approved" : "rejected";
        await reqDoc.save();

        if (action === "approve") {
          const planInfo = PLANS[reqDoc.plan];
          const expiresAt = new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000);
          const sub = await Subscription.create({
            adminId: reqDoc.adminId._id,
            tier: reqDoc.plan,
            startsAt: new Date(),
            expiresAt,
            price: planInfo.price,
            status: "active",
          });

          await activateSubscription(sub, reqDoc.adminId.referralEnabled);
          await bot.sendMessage(reqDoc.adminId.chatId, `✅ Your renewal for ${reqDoc.plan} has been approved!`);
          await bot.sendMessage(chatId, `✅ Approved and activated for ${reqDoc.adminId.username}`);
          await sendTelegram(DEV_CHAT_ID, `✅ Renewal approved by @${fromUsername} for ${reqDoc.adminId.username} (${reqDoc.plan})`);
        } else {
          await bot.sendMessage(reqDoc.adminId.chatId, `❌ Your renewal for ${reqDoc.plan} has been rejected.`);
          await bot.sendMessage(chatId, `✅ Rejected request for ${reqDoc.adminId.username}`);
          await sendTelegram(DEV_CHAT_ID, `❌ Renewal rejected by @${fromUsername} for ${reqDoc.adminId.username} (${reqDoc.plan})`);
        }

        // best-effort: remove keyboard from the admin's message
        try {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });
        } catch (e) {}

        return;
      }
    }

    // fallback
    return;
  } catch (err) {
    console.error("callback_query error:", err);
    try {
      if (q?.message?.chat?.id) await bot.sendMessage(q.message.chat.id, "⚠️ Something went wrong handling that button.");
    } catch (e) {}
  }
});

// ---------- MESSAGE handler (text, photos, docs) ----------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const username = msg.from.username;
  const state = convoState.get(toId(chatId));

  try {
    // 1) Developer broadcast flow state
    if (state && state.action === "await_broadcast") {
      if (text === "/cancel") {
        convoState.delete(toId(chatId));
        return bot.sendMessage(chatId, "✖️ Broadcast cancelled.");
      }
      if (!isDev(chatId)) {
        convoState.delete(toId(chatId));
        return bot.sendMessage(chatId, "❌ Not allowed.");
      }

      convoState.delete(toId(chatId));
      const sendText = msg.text || "";

      // If message contains photo/document, forward media to users
      if (msg.photo) {
        const users = await Admin.find({ chatId: { $exists: true } }).lean();
        await bot.sendMessage(chatId, `🚀 Broadcasting photo to ${users.length} users...`);
        for (const u of users) {
          try {
            await bot.sendPhoto(u.chatId, msg.photo[msg.photo.length - 1].file_id, { caption: sendText || undefined });
            await sleep(100);
          } catch (e) {
            console.warn("broadcast-photo error for", u.chatId, e.message);
          }
        }
        return bot.sendMessage(chatId, `✅ Broadcast complete to ${users.length} users.`);
      }

      // plain text broadcast
      const users = await Admin.find({ chatId: { $exists: true } }).lean();
      await bot.sendMessage(chatId, `🚀 Broadcasting your message to ${users.length} users...`);
      let sent = 0;
      for (const u of users) {
        try {
          await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${sendText}`);
          sent++;
          await sleep(100);
        } catch (e) {
          console.warn("broadcast error for", u.chatId, e.message);
        }
      }
      return bot.sendMessage(chatId, `✅ Broadcast finished. Sent to ${sent}/${users.length} users.`);
    }

    // 2) Developer awaiting subscribe flow
    if (state && state.action === "await_subscribe") {
      convoState.delete(toId(chatId));
      if (!isDev(chatId)) return bot.sendMessage(chatId, "❌ Not allowed.");

      const parts = text.split(/\s+/);
      const uname = parts[0];
      const plan = parts[1] || "weekly";
      if (!uname) return bot.sendMessage(chatId, "Usage: <username> <plan>");
      // case-insensitive lookup
      const user = await Admin.findOne({ username: new RegExp(`^${uname}$`, "i") });
      if (!user) return bot.sendMessage(chatId, "User not found.");

      const planInfo = PLANS[plan];
      if (!planInfo) return bot.sendMessage(chatId, `Invalid plan. Options: ${Object.keys(PLANS).join(", ")}`);

      const sub = await Subscription.create({
        adminId: user._id,
        tier: plan,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000),
        price: planInfo.price,
        status: "active",
      });
      await activateSubscription(sub, user.referralEnabled);
      await bot.sendMessage(user.chatId, `✅ You were granted a ${plan} subscription by the developer. Expires: ${sub.expiresAt.toUTCString()}`);
      return bot.sendMessage(chatId, `✅ Subscription created for ${user.username}`);
    }

    // 3) Photo/document from user — forward to dev for manual verify
    if (msg.photo || msg.document) {
      if (DEV_CHAT_ID) {
        await bot.sendMessage(DEV_CHAT_ID, `📸 Payment screenshot from ${username || chatId} (chatId: ${chatId})`);
        if (msg.photo) await bot.sendPhoto(DEV_CHAT_ID, msg.photo[msg.photo.length - 1].file_id);
        else if (msg.document) await bot.sendDocument(DEV_CHAT_ID, msg.document.file_id);
        return bot.sendMessage(chatId, "✅ Screenshot sent to developer for verification.");
      } else {
        return bot.sendMessage(chatId, "⚠️ Developer not configured. Cannot forward screenshot.");
      }
    }

    // 4) Developer text commands (slash commands)
    if (isDev(chatId) && text) {
      // /broadcast <text>
      if (text.startsWith("/broadcast ")) {
        const payload = text.replace("/broadcast ", "").trim();
        if (!payload) return bot.sendMessage(chatId, "Usage: /broadcast <message>");
        const users = await Admin.find({ chatId: { $exists: true } }).lean();
        let sent = 0;
        for (const u of users) {
          try {
            await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${payload}`);
            sent++;
            await sleep(100);
          } catch (e) {
            console.warn("broadcast error for", u.chatId, e.message);
          }
        }
        return bot.sendMessage(chatId, `✅ Broadcast done. Sent to ${sent}/${users.length} users.`);
      }

      // /check <username>
      // /check <username>
      if (text.startsWith("/check ")) {
        const uname = text.replace("/check ", "").trim();
        if (!uname) return bot.sendMessage(chatId, "Usage: /check <username>");

        const user = await Admin.findOne({ username: new RegExp(`^${uname}$`, "i") });
        if (!user) return bot.sendMessage(chatId, `❌ User '${uname}' not found.`);

        const subs = await Subscription.find({ adminId: user._id }).sort({ createdAt: -1 }).lean();
        let msg = `👤 ${user.username}\nIsAdmin: ${user.isAdmin}\nIsPaid: ${user.isPaid}\nPaidUntil: ${user.paidUntil || "N/A"}\n\nSubscriptions:\n`;
        if (!subs.length) msg += "No subscriptions found.";
        else subs.forEach((s) => {
          msg += `• ${s.tier} — ${s.status} — Expires: ${s.expiresAt ? s.expiresAt.toUTCString() : "N/A"} — ₦${s.price}\n`;
        });
        return bot.sendMessage(chatId, msg);
      }

      // /delete <username|id>
      if (text.startsWith("/delete ")) {
        const arg = text.replace("/delete ", "").trim();
        let user = await Admin.findOne({ username: new RegExp(`^${arg}$`, "i") });
        if (!user) user = await Admin.findById(arg);
        if (!user) return bot.sendMessage(chatId, `❌ User '${arg}' not found.`);

        await RenewalRequest.deleteMany({ adminId: user._id });
        await Subscription.deleteMany({ adminId: user._id });
        await Admin.findByIdAndDelete(user._id);

        return bot.sendMessage(chatId, `✅ Deleted user ${user.username} and all related data.`);
      }

      // /subscribe <username> <plan>
      if (text.startsWith("/subscribe ")) {
        const args = text.split(/\s+/);
        const uname = args[1];
        const plan = args[2] || "weekly";
        if (!uname) return bot.sendMessage(chatId, "Usage: /subscribe <username> <plan>");

        const user = await Admin.findOne({ username: new RegExp(`^${uname}$`, "i") });
        if (!user) return bot.sendMessage(chatId, `❌ User '${uname}' not found.`);
        const planInfo = PLANS[plan];
        if (!planInfo) return bot.sendMessage(chatId, `Invalid plan. Options: ${Object.keys(PLANS).join(", ")}`);

        const expiresAt = new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000);
        const sub = await Subscription.create({
          adminId: user._id,
          tier: plan,
          startsAt: new Date(),
          expiresAt,
          price: planInfo.price,
          status: "active",
        });

        await activateSubscription(sub, user.referralEnabled);
        await bot.sendMessage(user.chatId, `🎁 You’ve been granted a ${plan} subscription! Expires: ${expiresAt.toUTCString()}`);
        return bot.sendMessage(chatId, `✅ ${user.username} upgraded to ${plan} successfully.`);
      }

      // /pending — list pending renewals
      if (text === "/pending") {
        const pending = await RenewalRequest.find({ status: "pending" }).populate("adminId");
        if (!pending.length) return bot.sendMessage(chatId, "📭 No pending renewals.");
        let msg = "🕒 Pending Renewals:\n\n";
        for (const req of pending) {
          msg += `👤 ${req.adminId.username} — Plan: ${req.plan} — ID: ${req._id}\n`;
        }
        return bot.sendMessage(chatId, msg);
      }

      // /cancel — abort current action
      if (text === "/cancel") {
        convoState.delete(toId(chatId));
        return bot.sendMessage(chatId, "✅ Current action cancelled.");
      }

      // /start — show main menu
      if (text === "/start") {
        return sendMainMenu(chatId, username);
      }

      // fallback unknown command
      if (text.startsWith("/")) {
        return bot.sendMessage(chatId, "❓ Unknown command. Use /help or menu buttons.");
      }
    }

    // 5) Normal user messages (non-dev)
    if (text === "/start") {
      return sendMainMenu(chatId, username);
    }

    if (text === "/help") {
      const helpText = `
🧾 *Help Menu*
/start — Open main menu
/status — Check your subscription status
/trial — Start free trial (if available)
📞 Contact developer if you have payment issues.
`;
      return bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
    }

    if (text === "/status") {
      const admin = await getAdminByChat(chatId);
      if (!admin) return bot.sendMessage(chatId, "⚠️ Not registered yet. Visit the signup link.");
      const subs = await Subscription.find({ adminId: admin._id }).sort({ createdAt: -1 });
      let msg = `📊 Status for ${admin.username}\nPaid: ${admin.isPaid}\nExpires: ${admin.paidUntil ? admin.paidUntil.toUTCString() : "N/A"}\n`;
      if (subs.length) {
        msg += "\nRecent Subscriptions:\n";
        subs.forEach((s) => {
          msg += `• ${s.tier} — ${s.status} — ₦${s.price}\n`;
        });
      }
      return bot.sendMessage(chatId, msg);
    }

  } catch (err) {
    console.error("message handler error:", err);
    await bot.sendMessage(chatId, "⚠️ Error handling your request.");
  }
});

console.log("✅ Telegram bot fully operational.");