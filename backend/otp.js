import express from "express";
import OTP from "./models/OTP.js";
import Admin from "./models/Admin.js";
import { sendTelegram } from "./sub.js"; // or wherever your sendTelegram function lives

const router = express.Router();

// --- Helper functions ---
export function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += Math.floor(Math.random() * 10);
  return code;
}

export async function createOTP(chatId) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
  await OTP.create({ phone: chatId, code, expiresAt });
  return code;
}

export async function verifyOTP(chatId, code) {
  const record = await OTP.findOne({
    phone: chatId,
    code,
    used: false,
    expiresAt: { $gt: new Date() },
  });
  if (!record) return false;

  record.used = true;
  await record.save();
  return true;
}

// --- Routes ---
// Send OTP via Telegram
router.post("/send-otp", async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ success: false, error: "chatId required" });

    const code = await createOTP(chatId);
    await sendTelegram(chatId, `💡 Your OTP code is: ${code}\nIt expires in 5 minutes.`);

    res.json({ success: true, message: "OTP sent via Telegram" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { chatId, code } = req.body;
    if (!chatId || !code) return res.status(400).json({ success: false, error: "chatId and code required" });

    const valid = await verifyOTP(chatId, code);
    if (!valid) return res.status(400).json({ success: false, error: "Invalid or expired OTP" });

    const admin = await Admin.findOne({ chatId });
    if (admin) {
      admin.phoneVerified = true;
      await admin.save();
    }

    res.json({ success: true, message: "OTP verified, you can now start your trial" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;