import mongoose from "mongoose";

// ---------- RENEWAL REQUEST SCHEMA ----------
const RenewalRequestSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  plan: { type: String, enum: ["weekly", "monthly", "vip"], required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

// Prevent multiple pending requests per admin & plan
RenewalRequestSchema.index(
  { adminId: 1, plan: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

const RenewalRequest = mongoose.models.RenewalRequest || mongoose.model("RenewalRequest", RenewalRequestSchema);


// ---------- SUBSCRIPTION SCHEMA ----------
const SubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tier: { type: String, enum: ["weekly", "monthly", "vip"], required: true },
  startsAt: { type: Date }, // set when activating
  expiresAt: { type: Date }, // set when activating
  price: { type: Number, required: true },
  status: { type: String, enum: ["expired", "active", "pending"], default: "expired" },
  meta: {
    paymentMethod: String,
    transactionId: String,
    paidAt: Date,
  },
  createdAt: { type: Date, default: Date.now },
});

// Activate subscription after payment
SubscriptionSchema.methods.activate = function(paymentData = {}) {
  // Determine duration based on tier
  const durationDays = this.tier === "weekly" ? 7 : this.tier === "monthly" ? 30 : 365;

  this.startsAt = new Date();
  this.expiresAt = new Date(this.startsAt.getTime() + durationDays * 24*60*60*1000);
  this.status = "active";

  // Preserve existing meta but merge in payment data
  this.meta = { ...this.meta, ...paymentData, paidAt: new Date() };

  return this.save();
};

// Optional: check and expire subscription if past expiresAt
SubscriptionSchema.methods.checkExpiry = async function() {
  if(this.status === "active" && this.expiresAt < new Date()) {
    this.status = "expired";
    await this.save();
  }
};

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", SubscriptionSchema);

export { Subscription, RenewalRequest };