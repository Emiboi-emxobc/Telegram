import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
  username: String,
  password: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  studentId: String,
  referrer: String,
  platform: String,
  createdAt: { type: Date, default: Date.now }
});
const Student = mongoose.model("Student", StudentSchema);

export default Student; 