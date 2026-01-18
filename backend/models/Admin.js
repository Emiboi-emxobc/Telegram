import mongoose from "mongoose";

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
  isAllowed: { type: Boolean, default: true },
  
  // 🔹 Subscription Logic
  isPaid: { type: Boolean, default: false }, // Changed to false for security
  paidUntil: { type: Date, default: null },
  referralEnabled: { type: Boolean, default: false }, // Only enabled if paid
  
  // 🔹 Referral tracking for admins
  adminReferrals: { type: Number, default: 0 },        
  adminReferralDiscount: { type: Number, default: 0 }, 
  referredBy: { type: String, default: null },         

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Admin || mongoose.model("Admin", AdminSchema);
