// utils.js
import { Admin } from "./sub.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const toId = (s) => (s ? s.toString() : s);

export async function isAdmin(chatId, DEV_CHAT_ID) {
  const a = await Admin.findOne({ chatId: chatId.toString() });
  return a && a.chatId.toString() === DEV_CHAT_ID.toString();
}

export async function getAdminByChat(chatId) {
  return await Admin.findOne({ chatId: chatId.toString() });
}

export function isDev(chatId, DEV_CHAT_ID) {
  if (!DEV_CHAT_ID) return false;
  return chatId.toString() === DEV_CHAT_ID.toString();
}