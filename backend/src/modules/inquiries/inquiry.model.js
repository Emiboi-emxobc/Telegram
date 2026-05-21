const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    email: String,

    phone: {
      type: String,
      required: true
    },

    message: {
      type: String,
      required: true
    },

    product: String,

    status: {
      type: String,
      default: 'pending'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inquiry', inquirySchema);