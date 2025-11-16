// bot.js
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import mongoose from "mongoose";
import { attachHandlers } from "./handlers.js";

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN not defined in environment");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI not defined in environment");

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB connected (bot.js)");

export const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Bot.js polling active...");

// attach handlers with in-memory conversation state
const convoState = new Map();
attachHandlers(convoState);

console.log("✅ Telegram bot fully operational.");