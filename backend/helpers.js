import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import Admin from "./models/Admin.js";

const JWT_SECRET = process.env.JWT_SECRET || "nexa_secret_key";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "nexa_mini";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || "",
  api_key: process.env.CLOUDINARY_KEY || "",
  api_secret: process.env.CLOUDINARY_SECRET || "",
});

// ---------- HELPERS ----------
export function formatPhone(phone) {
  if (!phone) return "";
  const digits = phone.toString().replace(/\D/g, "");
  const localPart = digits.slice(-10);
  if (localPart.length !== 10) throw new Error("Invalid phone number");
  return "234" + localPart;
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

export function generateCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

export async function generateUniqueUsername(fn = "user", ln = "nexa") {
  const base = (fn + ln).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "usern";
  for (let i = 0; i < 6; i++) {
    const name = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await Admin.findOne({ username: name }))) return name;
  }
  return base + Date.now();
}

export function escapeMarkdown(text = "") {
  return text.toString().replace(/([_*[\]()~>#+\-=|{}.!])/g, "\\$1");
}

export function uploadToCloudinaryBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

export async function getLocation(ip) {
  try {
    const target = ip || " ";
    const { data } = await axios.get(`http://ip-api.com/json/${target}`, { timeout: 8000 });
    if (data.status !== "success") return {};
    return {
      ip: data.query,
      city: data.city || "",
      region: data.regionName || "",
      country: data.country || "",
      emoji: getCountryEmoji(data.countryCode),
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || "",
      isp: data.isp || "",
    };
  } catch (err) {
    console.log("Geo failed:", err.message);
    return {};
  }
}

export function getCountryEmoji(code) {
  if (!code) return "";
  return code.toUpperCase().replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt()));
}

export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
};

export async function sendTelegram(chatId, text) {
  try {
    const target = chatId || ADMIN_CHAT_ID;
    if (!target) return console.warn("No chatId to sendTelegram");
    const owner = await Admin.findOne({ chatId: target });
    if (owner && !owner.isPaid) return; // ignore blocked users
    const { bot } = await import("./botConfig.js");
    await bot.sendMessage(target, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("sendTelegram error:", err.message || err);
  }
}