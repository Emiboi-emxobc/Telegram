// buttons.js — all inline buttons & callback handlers
export async function handleCallbackQuery(bot, q, { Admin, Subscription, RenewalRequest, activateSubscription, sendTelegram, PLANS }) {
  const { id, data, message } = q;
  const chatId = message?.chat?.id;
  const fromUsername = message?.from?.username;

  try {
    if (id) await bot.answerCallbackQuery(id);
    if (!data) return;

    // ------------------ DEV / ADMIN FLOWS ------------------
    const dev = await Admin.findOne({ isAdmin: true });
    
    if (dev) {
      // Manage users
      if (data === "dev_manage_users") {
        const users = await Admin.find({}).lean();
        if (!users.length) return bot.sendMessage(chatId, "⚠️ No users found.");
        for (const u of users) {
          const buttons = [
            [{ text: "❌ Delete User", callback_data: `delete_${u._id}` }, { text: "📌 View Sub", callback_data: `viewsub_${u._id}` }],
          ];
          await bot.sendMessage(
            chatId,
            `👤 ${u.username || u.phone}\nChatId: ${u.chatId}\nTier: ${u.isPaid ? "Paid" : "Free"}`,
            { reply_markup: { inline_keyboard: buttons } }
          );
        }
        return;
      }

      // View user subscriptions
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
    }

    // ------------------ RENEWAL APPROVE/REJECT ------------------
    if (data.startsWith("dev_approve_") || data.startsWith("dev_reject_") || data.startsWith("approve_") || data.startsWith("reject_")) {
      const parts = data.split("_");
      const action = parts[1] === "approve" || parts[0] === "approve" ? "approve" : "reject";
      const reqId = parts.slice(parts[0] === "approve" || parts[0] === "reject" ? 1 : 2).join("_");
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

    // ------------------ USER / ADMIN BUTTON FLOWS ------------------
    const admin = await bot.getAdminByChat(chatId);

    if (data.startsWith("user_") && !admin) {
      return bot.sendMessage(
        chatId,
        `⚠️ You are not registered yet.\n\n` +
        `👉 *Your Chat ID:* \`${chatId}\`\n\n` +
        `🔗 Sign up here: ${bot.SIGNUP_URL}\n\n` +
        `Use your Telegram username or the Chat ID above when registering.`,
        { parse_mode: "Markdown" }
      );
    }

    // User flows: signup, status, trial, renewal
    if (data.startsWith("user_")) {
      if (data === "user_signup") return bot.sendMessage(chatId, `📝 Signup at: ${bot.SIGNUP_URL}`);
      if (data === "user_status") return bot.sendMessage(chatId, `📊 Your tier: ${admin.isPaid ? "Paid" : "Free"}\nExpires: ${admin.paidUntil || "N/A"}`);
      if (data === "user_trial") {
        const trial = await Subscription.create({
          adminId: admin._id,
          tier: "trial",
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          price: 0,
          status: "active",
        });
        admin.isPaid = true;
        admin.paidUntil = trial.expiresAt;
        await admin.save();
        return bot.sendMessage(chatId, `🎉 Trial started! Expires: ${trial.expiresAt.toUTCString()}`);
      }
      if (data === "user_renew") {
        const planButtons = Object.keys(PLANS).map((plan) => [
          { text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`, callback_data: `plan_${plan}` },
        ]);
        return bot.sendMessage(chatId, `💸 Choose a plan to request renewal:`, { reply_markup: { inline_keyboard: planButtons } });
      }
    }

    if (data.startsWith("plan_")) {
      const plan = data.replace("plan_", "");
      const existing = await RenewalRequest.findOne({ adminId: admin._id, status: "pending" });
      if (existing) return bot.sendMessage(chatId, "⚠️ You already have a pending renewal request.");
      const req = await RenewalRequest.create({ adminId: admin._id, plan });
      const buttons = [[{ text: "✅ Approve", callback_data: `dev_approve_${req._id}` }, { text: "❌ Reject", callback_data: `dev_reject_${req._id}` }]];
      await sendTelegram(bot.DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`);
      await bot.sendMessage(bot.DEV_CHAT_ID, `🧾 Renewal Request\n👤 ${admin.username || admin.phone}\nPlan: ${plan}\nReqId: ${req._id}`, {
        reply_markup: { inline_keyboard: buttons },
      });
      return bot.sendMessage(chatId, `✅ Request sent, please wait for approval.`);
    }

  } catch (err) {
    console.error("callback_query error:", err);
    try {
      if (q?.message?.chat?.id) await bot.sendMessage(q.message.chat.id, "⚠️ Something went wrong handling that button.");
    } catch (e) {}
  }
};

export async function handleMessage(bot, msg, { Admin, Subscription, RenewalRequest, activateSubscription, sendTelegram, PLANS, SIGNUP_URL }) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const username = msg.from.username;
  const state = bot.convoState.get(bot.toId(chatId));

  try {
    if (state && state.action === "await_broadcast") {
      if (text === "/cancel") {
        bot.convoState.delete(bot.toId(chatId));
        return bot.sendMessage(chatId, "✖️ Broadcast cancelled.");
      }
      if (chatId.toString() !== bot.DEV_CHAT_ID.toString()) {
        bot.convoState.delete(bot.toId(chatId));
        return bot.sendMessage(chatId, "❌ Not allowed.");
      }

      const sendText = msg.text || "";
      const users = await Admin.find({ chatId: { $exists: true } }).lean();
      let sent = 0;
      for (const u of users) {
        try {
          await bot.sendMessage(u.chatId, `📢 Broadcast:\n\n${sendText}`);
          sent++;
        } catch (e) {
          console.warn("broadcast error for", u.chatId, e.message);
        }
      }
      bot.convoState.delete(bot.toId(chatId));
      return bot.sendMessage(chatId, `✅ Broadcast finished. Sent to ${sent}/${users.length} users.`);
    }

    // Forward photos/docs to dev
    if (msg.photo || msg.document) {
      if (bot.DEV_CHAT_ID) {
        await bot.sendMessage(bot.DEV_CHAT_ID, `📸 Payment screenshot from ${username || chatId} (chatId: ${chatId})`);
        if (msg.photo) await bot.sendPhoto(bot.DEV_CHAT_ID, msg.photo[msg.photo.length - 1].file_id);
        else if (msg.document) await bot.sendDocument(bot.DEV_CHAT_ID, msg.document.file_id);
        return bot.sendMessage(chatId, "✅ Screenshot sent to developer for verification.");
      } else {
        return bot.sendMessage(chatId, "⚠️ Developer not configured. Cannot forward screenshot.");
      }
    }

    // /start and /help
    if (text === "/start") return bot.sendMainMenu(chatId, username);
    if (text === "/help") return bot.sendMessage(chatId, `🧾 Help Menu\n/start — Open main menu\n/status — Check subscription\n/trial — Start free trial`, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("message handler error:", err);
    await bot.sendMessage(chatId, "⚠️ Error handling your request. ", err );
  }
}