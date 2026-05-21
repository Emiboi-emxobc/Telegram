// ---------- AUTO-ACTIVATE TRIALS ON SERVER START ----------
async function activateTrialsOnStart() {
  try {
    const admins = await Admin.find({});

    for (const admin of admins) {
      let trialSub = await Subscription.findOne({ adminId: admin._id, tier: "trial" });

      if (!trialSub) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3); // 3 days from now
        trialSub = await Subscription.create({
          adminId: admin._id,
          tier: "trial",
          startsAt: new Date(),
          expiresAt,
          price: 0,
          status: "active",
        });
        console.log(`✅ Trial created for ${admin.username}`);
      } else if (trialSub.status !== "active") {
        trialSub.status = "active";
        await trialSub.save();
        console.log(`🔄 Trial re-activated for ${admin.username}`);
      } else {
        console.log(`⏩ Trial already active for ${admin.username}`);
      }

      // sync admin fields
      admin.isPaid = true;
      admin.paidUntil = trialSub.expiresAt;
      admin.referralEnabled = false;
      await admin.save();
    }

    console.log("✅ All existing admins synced with trial status");
  } catch (err) {
    console.error("Trial activation error:", err.message);
  }
}

// Run on server start
activateTrialsOnStart();