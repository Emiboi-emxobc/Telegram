// sub.js (Standalone Logic)
import mongoose from "mongoose";
import Admin from "./models/Admin.js";
import { Subscription } from "./models/sub.js";
import { sendTelegram } from "./utils/telegram.js"; // Helper to keep code clean

export const PLANS = {
  daily: { price: 500, days: 1, bonus: 100 },
  "2days": { price: 900, days: 2, bonus: 200 },
  weekly: { price: 3000, days: 7, bonus: 500 },
  monthly: { price: 10000, days: 30, bonus: 1500 },
  yearly: { price: 100000, days: 365, bonus: 15000 },
};

export async function activateSubscription(adminId, planKey, options = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const admin = await Admin.findById(adminId).session(session);
    if (!admin) throw new Error("Admin not found");

    const isGift = !!options.isGift;
    const plan = isGift ? null : PLANS[planKey];
    if (!isGift && !plan) throw new Error("Invalid Plan");

    const days = isGift ? (options.customDays || 1) : plan.days;
    const basePrice = isGift ? 0 : plan.price;
    const referralBonus = isGift ? 0 : plan.bonus;

    // 1. Calculate Stacking Time
    const latestSub = await Subscription.findOne({ adminId, status: "active" })
      .sort({ expiresAt: -1 })
      .session(session);

    const now = new Date();
    const startsAt = (latestSub && latestSub.expiresAt > now) ? latestSub.expiresAt : now;
    const expiresAt = new Date(startsAt);
    expiresAt.setDate(expiresAt.getDate() + days);

    // 2. Process Discounts
    let finalPaid = basePrice;
    if (basePrice > 0) {
      const discountAvailable = admin.adminReferralDiscount || 0;
      const usedDiscount = Math.min(discountAvailable, basePrice);
      finalPaid -= usedDiscount;
      admin.adminReferralDiscount -= usedDiscount;
    }

    // 3. Create Subscription Record
    const [newSub] = await Subscription.create([{
      adminId,
      tier: isGift ? "gift" : planKey,
      startsAt,
      expiresAt,
      price: finalPaid,
      status: "active",
      isGift
    }], { session });

    // 4. Update Admin Document
    admin.isPaid = true;
    admin.paidUntil = expiresAt;
    admin.referralEnabled = true;

    // 5. SELF-PROMOTION: Credit the Inviter
    if (!isGift && admin.referredBy && finalPaid > 0) {
      const inviter = await Admin.findOne({ referralCode: admin.referredBy }).session(session);
      if (inviter) {
        inviter.adminReferralDiscount = (inviter.adminReferralDiscount || 0) + referralBonus;
        inviter.adminReferrals = (inviter.adminReferrals || 0) + 1;
        await inviter.save({ session });
        
        await sendTelegram(inviter.chatId, `🎊 Your referral ${admin.username} purchased a plan! ₦${referralBonus.toLocaleString()} added to your discount balance.`);
      }
    }

    await admin.save({ session });
    await session.commitTransaction();

    await sendTelegram(admin.chatId, `✅ Plan Activated: ${isGift ? "GIFT" : planKey.toUpperCase()}\nExpires: ${expiresAt.toDateString()}`);
    return newSub;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
