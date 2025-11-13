// bot.js — Telegram Subscription & Admin + Dev Panel (Button + Command Driven)
// Place next to sub.js; requires sub.js exports: Admin, Subscription, RenewalRequest, Activity, activateSubscription, sendTelegram, PLANS
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
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

dotenv.config();

const DEV_CHAT_ID = process.env.ADMIN_CHAT_ID; // developer chat id (string or number)
const BOT_TOKEN = process.env.BOT_TOKEN;
const SIGNUP_URL = process.env.SIGNUP_URL || "https://aminpanel.vercel.app";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN not defined in .env");
if (!DEV_CHAT_ID) console.warn("DEV_CHAT_ID not defined — dev-only features disabled.");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Bot.js polling active...");

// In-memory conversation state for multi-step flows (broadcast, subscribe, etc.)
const convoState = new Map(); // key: chatId (string), value: { action: "await_broadcast" | "await_subscribe", meta: {} }

// small helper to pause
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Helpers
async function isAdmin(chatId) {
  const a = await Admin.findOne({ chatId: chatId.toString() });
  return !!a && !!a.isAdmin;
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
    if (isDev(chatId)) {
      const devButtons = [
        [{ text: "👤 Manage Users", callback_data: "dev_manage_users" }],
        [{ text: "📊 View Stats", callback_data: "dev_stats" }],
        [{ text: "💬 Broadcast", callback_data: "dev_broadcast" }],
        [{ text: "🛠️ Dev Commands", callback_data: "dev_commands" }],
      ];
      return bot.sendMessage(chatId, `👋 Hi Developer! Choose an option:`, { reply_markup: { inline_keyboard: devButtons } });
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

    await bot.sendMessage(chatId, `👋 Hi ${username || "there"}! Choose an option:`, { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    console.error("sendMainMenu failed:", err);
  }
}

// CALLBACK QUERY handler (buttons)
bot.on("callback_query", async (q) => {
  const { id, data, message } = q;
  const chatId = message.chat.id;
  const username = message.from.username;

  try {
    await bot.answerCallbackQuery(id);

    // --- DEV FLOW ---
    if (isDev(chatId)) {
      // Manage Users
      if (data === "dev_manage_users") {
        const users = await Admin.find({}).lean();
        if (!users.length) return bot.sendMessage(chatId, "⚠️ No users found.");

        for (const u of users) {
          const buttons = [
            [
              
              { text: "❌ Delete User",
               callback_data: `delete_${u._id}` 
                
              },
              { text: "📌 View Sub", callback_data: `viewsub_${u._id}` }
            ],
          ];
          await bot.sendMessage(chatId, `👤 ${u.username || u.phone}\nChatId: ${u.chatId}\nTier: ${u.isPaid ? "Paid" : "Free"}`, {
            reply_markup: { inline_keyboard: buttons },
          });
          await sleep(150);
        }
        return;
      }

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

      if (data.startsWith("delete_")) {
        const id = data.replace("delete_", "");
        await Admin.findByIdAndDelete(id);
        await RenewalRequest.deleteMany({ adminId: id });
        await Subscription.deleteMany({ adminId: id });
        return bot.sendMessage(chatId, `✅ User deleted and related subscription data removed.`);
      }

      if (data === "dev_stats") {
        const totalUsers = await Admin.countDocuments();
        const activeSubs = await Subscription.countDocuments({ status: "active" });
        const pending = await RenewalRequest.countDocuments({ status: "pending" });
        return bot.sendMessage(chatId, `📊 Stats:\nTotal Users: ${totalUsers}\nActive Subs: ${activeSubs}\nPending Renewals: ${pending}`);
      }

      if (data === "dev_broadcast") {
        convoState.set(toId(chatId), { action: "await_broadcast", meta: {} });
        return bot.sendMessage(chatId, "✉️ Send the message you want to broadcast to all users. (Send /cancel to abort)");
      }

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

    // --- USER FLOW (signup/help/trial/renew) ---
    // get user admin record (if exists)
    const admin = await getAdminByChat(chatId);

    // If a button is purely for users and they are not registered, reject
    if (data.startsWith("user_") && !admin) return bot.sendMessage(chatId, "⚠️ You are not registered yet. Visit the site to sign up or send your Telegram username to the dev.");

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

      // mark admin account
      admin.isPaid = true;
      admin.paidUntil = trialSub.expiresAt;
      await admin.save();

      await bot.sendMessage(chatId, `🎉 Trial started! Expires: ${trialSub.expiresAt.toUTCString()}`);
      return;
    }

    // Status
    if (data === "user_status") {
      return bot.sendMessage(chatId, `📊 Account Status:\nTier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${admin.paidUntil ? admin.paidUntil.toUTCString() : "N/A"}\nReferral: ${admin.referralEnabled ? "Enabled ✅" : "Disabled ❌"}`);
    }

    // Renewal request - present plan buttons
    if (data === "user_renew") {
      const planButtons = Object.keys(PLANS).map((plan) => [{ text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`, callback_data: `plan_${plan}` }]);
      return bot.sendMessage(chatId, `💸 Choose a plan to request renewal:`, { reply_markup: { inline_keyboard: planButtons } });
    }

    // user clicked specific plan
    if (data.startsWith("plan_")) {
      const plan = data.replace("plan_", "");
      const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
      if (existing) return bot.sendMessage(chatId, "⚠️ You already have a pending renewal request.");

      const req = await RenewalRequest.create({ adminId: admin._id, plan });
      // notify dev with inline approve/reject buttons so dev can approve from the message
      const buttons = [
        [
          { text: "✅ Approve", callback_data: `dev_approve_${req._id}` },
          { text: "❌ Reject", callback_data: `dev_reject_${req._id}` },
        ],
      ];
      await sendTelegram(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`);
      // send the same to dev as a bot message with buttons (so dev can approve with buttons)
      await bot.sendMessage(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`, { reply_markup: { inline_keyboard: buttons } });

      return bot.sendMessage(chatId, `✅ Your renewal request for *${plan}* has been sent for approval.`);
    }

    // ---------- ADMIN FLOW ----------
    if (data.startsWith("admin")) {
      const adminCheck = await isAdmin(chatId);
      if (!adminCheck) return bot.sendMessage(chatId, "❌ You don’t have access to this feature.");

      // List pending and show approve/reject for each
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
          await bot.sendMessage(chatId, `👤 ${req.adminId.username}\nPlan: ${req.plan}\nCreated: ${req.createdAt.toUTCString()}`, {
            reply_markup: { inline_keyboard: buttons },
          });
          await sleep(150);
        }
        return;
      }

      // Approve / Reject buttons for admins
      if (data.startsWith("approve_") || data.startsWith("reject_")) {
        const [action, reqId] = data.split("_");
        const reqDoc = await RenewalRequest.findById(reqId).populate("adminId");
        if (!reqDoc) return bot.sendMessage(chatId, "⚠️ Request not found.");

        // update
        reqDoc.status = action === "approve" ? "approved" : "rejected";
        await reqDoc.save();

        if (action === "approve") {
          const planInfo = PLANS[reqDoc.plan];
          const sub = await Subscription.create({
            adminId: reqDoc.adminId._id,
            tier: reqDoc.plan,
            startsAt: new Date(),
            expiresAt: new Date(Date.now() + planInfo.days * 24 * 60 * 60 * 1000),
            price: planInfo.price,
            status: "active",
          });

          await activateSubscription(sub, reqDoc.adminId.referralEnabled);

          await bot.sendMessage(reqDoc.adminId.chatId, `✅ Your renewal for ${reqDoc.plan} has been approved!`);
          await bot.sendMessage(chatId, `✅ Approved and activated for ${reqDoc.adminId.username}`);
          await sendTelegram(DEV_CHAT_ID, `✅ Renewal approved by @${message.from.username} for ${reqDoc.adminId.username} (${reqDoc.plan})`);
        } else {
          await bot.sendMessage(reqDoc.adminId.chatId, `❌ Your renewal for ${reqDoc.plan} has been rejected.`);
          await bot.sendMessage(chatId, `✅ Rejected request for ${reqDoc.adminId.username}`);
          await sendTelegram(DEV_CHAT_ID, `❌ Renewal rejected by @${message.from.username} for ${reqDoc.adminId.username} (${reqDoc.plan})`);
        }

        return;
      }
    }
  } catch (err) {
    console.error("callback_query error:", err);
    try { await bot.sendMessage(chatId, "⚠️ Something went wrong handling that button."); } catch (e) {}
  }
});

// MESSAGE handler (text, photos, docs)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const username = msg.from.username;

  // Check for an active convo state (dev multi-step flows)
  const state = convoState.get(toId(chatId));

  // 1) If waiting for developer broadcast text
  if (state && state.action === "await_broadcast") {
    // cancel if /cancel
    if (text === "/cancel") {
      convoState.delete(toId(chatId));
      return bot.sendMessage(chatId, "✖️ Broadcast cancelled.");
    }

    // Only dev allowed to broadcast this way
    if (!isDev(chatId)) {
      convoState.delete(toId(chatId));
      return bot.sendMessage(chatId, "❌ Not allowed.");
    }

    // Broadcast the message text or forwarded media
    convoState.delete(toId(chatId));
    const sendText = msg.text || "";

    // If message contains photo/document, prefer to forward as media
    if (msg.photo) {
      // forward photo to all users with caption if any
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

  // 2) If developer initiated a subscribe user flow (await_subscribe)
  if (state && state.action === "await_subscribe") {
    convoState.delete(toId(chatId));
    if (!isDev(chatId)) return bot.sendMessage(chatId, "❌ Not allowed.");

    // Expecting "username plan" or "username weekly"
    const parts = text.split(/\s+/);
    const uname = parts[0];
    const plan = parts[1] || "weekly";
    if (!uname) return bot.sendMessage(chatId, "Usage: <username> <plan>");
    const user = await Admin.findOne({ username: uname });
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
    return bot.sendMessage(chatId, `✅ Subscription created for ${uname}`);
  }

  // 3) Photo/document from user — forward to dev for manual verify
  if (msg.photo || msg.document) {
    // If it's a payment screenshot from a user: forward to DEV_CHAT_ID only
    if (DEV_CHAT_ID) {
      await bot.sendMessage(DEV_CHAT_ID, `📸 Payment screenshot from ${username || chatId} (chatId: ${chatId})`);
      if (msg.photo) await bot.sendPhoto(DEV_CHAT_ID, msg.photo[msg.photo.length - 1].file_id);
      else if (msg.document) await bot.sendDocument(DEV_CHAT_ID, msg.document.file_id);
      return bot.sendMessage(chatId, "✅ Screenshot sent to developer for verification.");
    } else {
      return bot.sendMessage(chatId, "⚠️ Developer not configured. Cannot forward screenshot.");
    }
  }

  // 4) Developer text commands
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
    if (text.startsWith("/check ")) {
      const who = text.replace("/check ", "").trim();
      const u = await Admin.findOne({ username: who });
      if (!u) return bot.sendMessage(chatId, "User not found.");
      const status = `👤 ${u.username}\nPaid: ${u.isPaid}\nPaidUntil: ${u.paidUntil || "N/A"}`;
      return bot.sendMessage(chatId, status);
    }

    // /delete <username|id>
    if (text.startsWith("/delete ")) {
      const who = text.replace("/delete ", "").trim();
      let u = await Admin.findOne({ username: who }) || await Admin.findById(who);
      if (!u) return bot.sendMessage(chatId, "User not found.");
      await Admin.findByIdAndDelete(u._id);
      await Subscription.deleteMany({ adminId: u._id });
      await RenewalRequest.deleteMany({ adminId: u._id });
      return bot.sendMessage(chatId, `✅ Deleted ${who}`);
    }

    // /subscribe — developer-driven multi-step
    if (text.startsWith("/subscribe")) {
      convoState.set(toId(chatId), { action: "await_subscribe", meta: {} });
      return bot.sendMessage(chatId, "🛠️ Send: <username> <plan>  (e.g. drericka7434 weekly)");
    }

    // /pending — list pending renewals
    if (text === "/pending") {
      const pending = await RenewalRequest.find({ status: "pending" }).populate("adminId");
      if (!pending.length) return bot.sendMessage(chatId, "📭 No pending renewals.");
      for (const p of pending) {
        const buttons = [
          [
            { text: "✅ Approve", callback_data: `dev_approve_${p._id}` },
            { text: "❌ Reject", callback_data: `dev_reject_${p._id}` },
          ],
        ];
        await bot.sendMessage(chatId, `🧾 ${p._id}\n👤 ${p.adminId.username}\nPlan: ${p.plan}\nCreated: ${p.createdAt.toUTCString()}`, {
          reply_markup: { inline_keyboard: buttons },
        });
        await sleep(120);
      }
      return;
    }

    // /cancel
    if (text === "/cancel") {
      convoState.delete(toId(chatId));
      return bot.sendMessage(chatId, "✖️ Current action aborted.");
    }
  }

  // 5) If none of the above — show main menu
  return sendMainMenu(chatId, username);
});

export default bot;