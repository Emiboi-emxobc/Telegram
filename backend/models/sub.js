import mongoose from "mongoose";
const RenewalRequestSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  plan: { type: String, enum: ["weekly", "monthly", "vip"], default: "weekly" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});
const RenewalRequest = mongoose.models.RenewalRequest || mongoose.model("RenewalRequest", RenewalRequestSchema);

const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, required: true, default: "free" },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});
const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

export { Subscription, RenewalRequest };