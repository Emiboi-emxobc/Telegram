const mongoose = require('mongoose');
const securityCodeSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  code: { type: Number, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});


const Code = mongoose.model('SecurityCode', securityCodeSchema);

