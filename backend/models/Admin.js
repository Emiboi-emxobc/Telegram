import mongoose from "mongoose";

//models Admin.js
const AdminSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  firstname: String,
  lastname: String,
  phone: { type: String, unique: true, sparse: true },
  password: String,
  avatar: String,
  referralCode: String,
  chatId: String, 
  bio: String,
  profTag: { type: String, default: "Basic" },
  candTag: { type: String, default: "Cand" },
  slogan: String,
  votes: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  isPaid: { type: Boolean, default: false },
  paidUntil: { type: Date, default: null },
  referralEnabled: { type: Boolean, default: true },
  // 🔹 Referral tracking for admins
  adminReferrals: { type: Number, default: 0 },        // number of admins referred
  adminReferralDiscount: { type: Number, default: 0 }, // total ₦ discount accumulated
  referredBy: { type: String, default: null },         // who referred this admin

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Admin || mongoose.model("Admin", AdminSchema);