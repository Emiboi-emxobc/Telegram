import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  tier: { type: String, required: true }, // e.g., 'daily', 'monthly', 'gift'
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  price: { type: Number, default: 0 },
  status: { type: String, enum: ["active", "expired"], default: "active" },
  isGift: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const RenewalRequestSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  plan: String,
  status: { type: String, default: "pending" }, // pending, approved, rejected
  proof: String, // URL to payment screenshot
  createdAt: { type: Date, default: Date.now }
});

export const Subscription = mongoose.model("Subscription", SubscriptionSchema);
export const RenewalRequest = mongoose.model("RenewalRequest", RenewalRequestSchema);
