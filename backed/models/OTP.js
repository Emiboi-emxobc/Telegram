import mongoose from "mongoose";

const OTPSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("OTP", OTPSchema);



function generateCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function createOTP(phone) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  await OTP.create({ phone, code, expiresAt });
  return code;
}

async function verifyOTP(phone, code) {
  const record = await OTP.findOne({ phone, code, used: false, expiresAt: { $gt: new Date() } });
  if (!record) return false;

  record.used = true;
  await record.save();
  return true;
} 