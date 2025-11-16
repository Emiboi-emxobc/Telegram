// handlers.js
import { bot } from "./bot.js"; // bot instance
import { Admin, Subscription, RenewalRequest, activateSubscription, sendTelegram, PLANS } from "./sub.js";
import { sleep, toId, isAdmin, getAdminByChat, isDev } from "./utils.js";

const SIGNUP_URL = process.env.SIGNUP_URL || "https://aminpanel.vercel.app";
const DEV_CHAT_ID = process.env.ADMIN_CHAT_ID;

// ---------- Main menu ----------
export async function sendMainMenu(chatId, username) {
  try {
    if (isDev(chatId, DEV_CHAT_ID)) {
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

    const adminCheck = await isAdmin(chatId, DEV_CHAT_ID);
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
      ] : [
          [{ text: "🎉 Start Trial", callback_data: "user_trial" }],
          [{ text: "🔁 Renew Subscription", callback_data: "user_renew" }],
          [{ text: "📊 Check Account Status", callback_data: "user_status" }],
          [{ text: "📝 Signup / Instructions", callback_data: "user_signup" }],
          [{ text: "❓ Help / Reset Password", callback_data: "user_help" }]
      ];

    await bot.sendMessage(chatId, `👋 Hi ${username || "there"}! Choose an option:`, {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error("sendMainMenu failed:", err);
  }
}

// ---------- Attach handlers ----------
export function attachHandlers(convoState) {
  // ---------- CALLBACK QUERIES ----------
  bot.on("callback_query", async (q) => {
    const { id, data, message } = q;
    const chatId = message?.chat?.id;
    const fromUsername = message?.from?.username;

    try {
      if (id) await bot.answerCallbackQuery(id);
      if (!data) return;

      // ---------- DEV FLOWS ----------
      if (isDev(chatId, DEV_CHAT_ID)) {
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

        // View subscriptions
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

        // Delete user
        if (data.startsWith("delete_")) {
          const id = data.replace("delete_", "");
          await Admin.findByIdAndDelete(id);
          await RenewalRequest.deleteMany({ adminId: id });
          await Subscription.deleteMany({ adminId: id });
          return bot.sendMessage(chatId, `✅ User deleted and related subscription data removed.`);
        }

        // Dev stats
        if (data === "dev_stats") {
          const totalUsers = await Admin.countDocuments();
          const activeSubs = await Subscription.countDocuments({ status: "active" });
          const pending = await RenewalRequest.countDocuments({ status: "pending" });
          return bot.sendMessage(chatId, `📊 Stats:\nTotal Users: ${totalUsers}\nActive Subs: ${activeSubs}\nPending Renewals: ${pending}`);
        }

        // Start broadcast
        if (data === "dev_broadcast") {
          convoState.set(toId(chatId), { action: "await_broadcast", meta: {} });
          return bot.sendMessage(chatId, "✉️ Send the message you want to broadcast to all users. (Send /cancel to abort)");
        }

        // Dev commands list
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

      // ---------- DEV approve/reject ----------
      if (data.startsWith("dev_approve_") || data.startsWith("dev_reject_")) {
        const parts = data.split("_");
        const action = parts[1];
        const reqId = parts.slice(2).join("_");
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

        try {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });
        } catch (e) {}
        return;
      }

      // ---------- USER / ADMIN FLOWS ----------
      const admin = await getAdminByChat(chatId);

      if (data.startsWith("user_") && !admin) {
        return bot.sendMessage(
          chatId,
          `⚠️ You are not registered yet.\n\n` +
          `👉 *Your Chat ID:* \`${chatId}\`\n\n` +
          `🔗 Sign up here: ${SIGNUP_URL}\n\n` +
          `Use your Telegram username or the Chat ID above when registering.`,
          { parse_mode: "Markdown" }
        );
      }

      // Signup instructions
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

      // Renewal plan selection
      if (data === "user_renew") {
        const planButtons = Object.keys(PLANS).map((plan) => [
          { text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`, callback_data: `plan_${plan}` },
        ]);
        return bot.sendMessage(chatId, `💸 Choose a plan to request renewal:`, { reply_markup: { inline_keyboard: planButtons } });
      }

      // Plan click
      if (data.startsWith("plan_")) {
        const plan = data.replace("plan_", "");
        const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
        if (existing) return bot.sendMessage(chatId, "⚠️ You already have a pending renewal request.");

        const req = await RenewalRequest.create({ adminId: admin._id, plan });
        const buttons = [[{ text: "✅ Approve", callback_data: `dev_approve_${req._id}` }, { text: "❌ Reject", callback_data: `dev_reject_${req._id}` }]];
        await sendTelegram(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`);
        await bot.sendMessage(DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`, {
          reply_markup: { inline_keyboard: buttons },
        });

        return bot.sendMessage(chatId, `✅ Your renewal request for *${plan}* has been sent for approval.`, { parse_mode: "Markdown" });
      }

      // Admin flows (admin_pending, approve, reject)
      if (data.startsWith("admin")) {
        const adminCheck = await isAdmin(chatId, DEV_CHAT_ID);
        if (!adminCheck) return bot.sendMessage(chatId, "❌ You don’t have access to this feature.");

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

        if (data.startsWith("approve_") || data.startsWith("reject_")) {
          const parts = data.split("_");
          const action = parts[0];
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

          try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id }); } catch (e) {}
          return;
        }
      }

      return;
    } catch (err) {
      console.error("callback_query error:", err);
      try { if (q?.message?.chat?.id) await bot.sendMessage(q.message.chat.id, "⚠️ Something went wrong handling that button."); } catch(e) {}
    }
  });

  // ---------- MESSAGES ----------
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const username = msg.from.username;
    const state = convoState.get(toId(chatId));

    try {
      // Developer broadcast flow
      if (state && state.action === "await_broadcast") {
        if (text === "/cancel") {
          convoState.delete(toId(chatId));
          return bot.sendMessage(chatId, "✖️ Broadcast cancelled.");
        }
        if (!isDev(chatId, DEV_CHAT_ID)) {
          convoState.delete(toId(chatId));
          return bot.sendMessage(chatId, "❌ Not allowed.");
        }

        convoState.delete(toId(chatId));
        const sendText = msg.text || "";

        const users = await Admin.find({ chatId: { $exists: true } }).lean();
        await bot.sendMessage(chatId, `🚀 Broadcasting your message to ${users.length} users...`);
        let sent = 0;
        for (const u of users) {
          try {
            if (msg.photo) {
              await bot.sendPhoto(u.chatId, msg.photo[msg.photo.length - 1].file_id, { caption: sendText || undefined });
            } else if (msg.document) {
              await bot.sendDocument(u.chatId, msg.document.file_id, { caption: sendText || undefined });
            } else {
              await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${sendText}`);
            }
            sent++;
            await sleep(100);
          } catch (e) { console.warn("broadcast error for", u.chatId, e.message); }
        }
        return bot.sendMessage(chatId, `✅ Broadcast finished. Sent to ${sent}/${users.length} users.`);
      }

      // Other message flows (subscribing, commands, photos)…
      // Copy the rest of your message logic from bot.js here exactly

    } catch (err) {
      console.error("message handler error:", err);
      await bot.sendMessage(chatId, "⚠️ Error handling your request.");
    }
  });
}