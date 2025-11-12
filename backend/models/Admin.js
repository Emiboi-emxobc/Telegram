import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  firstname: String,
  lastname: String,
  phone: { type: String, unique: true, sparse: true },
  password: String,
  avatar: String,
  referralCode: String,
  chatId: String, // 🔹 replaced apikey with chatId
  bio: String,
  profTag: { type: String, default: "Basic" },
  candTag: { type: String, default: "Cand" },
  slogan: String,
  votes: { type: Number, default: 0 },
  isAdmin:{type:Boolean,default:false},
  isPaid: { type: Boolean, default: false },
  paidUntil: { type: Date, default: null }, // 🔹 subscription expiry
  referralEnabled: { type: Boolean, default: false }, // 🔹 referral status
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Admin || mongoose.model("Admin", AdminSchema);