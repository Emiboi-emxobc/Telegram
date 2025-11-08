const mongoose = require("mongoose");

const VisitSchema = new mongoose.Schema({
  path: { type: String, required: true },
  referrer: { type: String, default: "direct" },
  ip: { type: String },
  userAgent: { type: String },
  utm: { type: Object },        // can store { source, campaign, medium, etc. }
  signedUp: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Child" }
}, { timestamps: true });

module.exports = mongoose.model("Visit", VisitSchema);
