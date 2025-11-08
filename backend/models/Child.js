// models/Child.js
const mongoose = require("mongoose");

const ChildSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  referralCode: { type: String, default: "direct" },
  platform: { type: String } // optional, but captured if sent
}, { timestamps: true });

module.exports = mongoose.model("Child", ChildSchema);
