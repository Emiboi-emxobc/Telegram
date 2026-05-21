import mongoose from "mongoose";

const contactMethodSchema = new mongoose.Schema({
  label: { type: String, required: true },
  tel: { type: String, required: true }
}, { _id: false });

const helpSchema = new mongoose.Schema({
  contactMethods: {
    type: [contactMethodSchema],
    required: true
  },

  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true
  },
studentId:String,
  useId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Child",
    required: true,
    index: true
  },

  active: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

export default mongoose.model("Help", helpSchema);