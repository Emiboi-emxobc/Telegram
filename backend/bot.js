// bot.js — main entry point
import TelegramBot from "node-telegram-bot-api";
import mongoose from "mongoose";

import { handleCallbackQuery, handleMessage } from "./buttons.js";
import { Admin, Subscription, RenewalRequest } from "./models/index.js"; // adjust paths
import { activateSubscription, sendTelegram, PLANS } from "./sub.js";

// ----- CONFIG -----
const TOKEN = process.env.BOT_TOKEN;
export const bot = new TelegramBot(TOKEN, { polling: true });

// Conversation state map
bot.convoState = new Map();

// Your Dev Chat ID for approvals / broadcast
bot.DEV_CHAT_ID = process.env.DEV_CHAT_ID;

// Helper for storing convo keys
bot.toId = (chatId) => chatId.toString();

// Signup URL
bot.SIGNUP_URL = process.env.SIGNUP_URL || "https://t.me/your_signup_link";

// -------------------- BOT LISTENERS --------------------

// Message listener
bot.on("message", async (msg) => {
  await handleMessage(bot, msg, { Admin, Subscription, RenewalRequest, activateSubscription, sendTelegram, PLANS, SIGNUP_URL: bot.SIGNUP_URL });
});

// Callback query listener (inline buttons)
bot.on("callback_query", async (q) => {
  await handleCallbackQuery(bot, q, { Admin, Subscription, RenewalRequest, activateSubscription, sendTelegram, PLANS });
});

// -------------------- BOT HELPERS --------------------

// Example main menu for /start
bot.sendMainMenu = async (chatId, username) => {
  const buttons = [
    [{ text: "💳 Check Subscription", callback_data: "user_status" }],
    [{ text: "🎁 Start Trial", callback_data: "user_trial" }],
    [{ text: "💸 Renew Subscription", callback_data: "user_renew" }],
  ];
  await bot.sendMessage(chatId, `Welcome ${username || ""}! Choose an option:`, { reply_markup: { inline_keyboard: buttons } });
};

// Simple admin checker by chatId
bot.getAdminByChat = async (chatId) => {
  const admin = await Admin.findOne({ chatId });
  return admin;
};

// -------------------- MONGOOSE CONNECTION --------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/botdb";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

console.log("🤖 Bot is running...");