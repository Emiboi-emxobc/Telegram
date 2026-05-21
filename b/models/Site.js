import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  title: { type: String, default: "The People's pick" },
  subTitle: { type: String, default: "Vote us 2025🎉🎊🎉🎊" },
  lastSeen: { type: Date, default: Date.now }, // 🔹 reference to function
  description: {
    type: String,
    default: "I need your support! Please take a moment to cast your vote and help me reach new heights in this competition. <strong>Your vote</strong> could be the difference-maker, propelling me toward victory"
  },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }
});

const Site = mongoose.model("Site", SettingsSchema);

export default Site;