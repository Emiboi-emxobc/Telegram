import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import mongoose from "mongoose";

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const DEV_CHAT_ID = process.env.ADMIN_CHAT_ID;
export const SIGNUP_URL = process.env.SIGNUP_URL || "https://aminpanel.vercel.app";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN not defined in environment");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI not defined in environment");

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB connected (botConfig.js)");

export const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Bot polling active...");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const toId = (s) => s?.toString();
export const isDev = (chatId) => DEV_CHAT_ID && chatId.toString() === DEV_CHAT_ID.toString();