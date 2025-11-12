import mongoose from "mongoose";

const ReferralSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  code: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const Referral = mongoose.model("Referral", ReferralSchema);

export default Referral;