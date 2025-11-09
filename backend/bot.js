import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Telegram bot running...");

// Small delay helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // 🕐 Typing effect: makes bot feel natural
  await bot.sendChatAction(chatId, "typing");
  await sleep(800);

  // 1️⃣ Intro instructions
  await bot.sendMessage(
    chatId,
    `👋 Hey ${msg.from.first_name || "there"}!\n\nThis is your *unique Telegram chat ID* 🔑\nYou'll need it to sign up or link your Nexa account.\n\n⚙️ Just copy it, then head to the site to register.`,
    { parse_mode: "Markdown" }
  );

  await sleep(1200);
  await bot.sendChatAction(chatId, "typing");
  await sleep(800);

  // 2️⃣ Send chat ID + copy button
  await bot.sendMessage(chatId, `🆔 Your chat ID:\n\`${chatId}\``, {
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

  await sleep(1500);
  await bot.sendChatAction(chatId, "typing");
  await sleep(1000);

  // 3️⃣ Signup link
  await bot.sendMessage(
    chatId,
    `🚀 All set!\nClick below to *complete your registration* 👇\n\n👉 [Sign up here](https://aminpanel.vercel.app/)`,
    { parse_mode: "Markdown" }
  );
});

// Handle button press
bot.on("callback_query", async (callbackQuery) => {
  const { id } = callbackQuery;
  await bot.answerCallbackQuery(id, {
    text: "✅ Copied! Use this ID to register on the site.",
    show_alert: false,
  });
});