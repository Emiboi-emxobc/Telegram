import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Telegram bot running...");

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // 1️⃣ Step 1 — Send instructions
  await bot.sendMessage(
    chatId,
    "👋 Hey there! This is your unique chat ID — you'll need it to register your Nexa account or link your admin panel."
  );

  // 2️⃣ Step 2 — Send the chat ID
  await bot.sendMessage(chatId, `Your chat ID is:\n\`${chatId}\``, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 Copy Chat ID",
            callback_data: `copy_${chatId}`,
          },
        ],
      ],
    },
  });

  // 3️⃣ Step 3 — Send signup link
  await bot.sendMessage(
    chatId,
    "🚀 Use this link to sign up:\n👉 [https://aminpanel.vercel.app/](https://aminpanel.vercel.app/)",
    { parse_mode: "Markdown" }
  );
});

// Handle copy button
bot.on("callback_query", (callbackQuery) => {
  bot.answerCallbackQuery(callbackQuery.id, {
    text: "✅ click on the id to copy",
  });
});