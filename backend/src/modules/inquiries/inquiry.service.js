const Inquiry = require('./inquiry.model');

async function createInquiry(payload) {
  return await Inquiry.create(payload);
}

async function getAllInquiries() {
  return await Inquiry.find().sort({ createdAt: -1 });
}

module.exports = {
  createInquiry,
  getAllInquiries
};