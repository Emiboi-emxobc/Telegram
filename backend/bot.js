import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Telegram bot running...");

// Reply with chat ID and inline button
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Your chat ID is:\n\`${chatId}\``, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Copy Chat ID",
            callback_data: `copy_${chatId}`
          }
        ]
      ]
    }
  });
});

// Optional: handle button presses (just confirms action)
bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  bot.answerCallbackQuery(callbackQuery.id, { text: "Tap and copy your chat ID!" });
});
