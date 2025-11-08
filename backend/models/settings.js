// backend/models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  siteTitle: String,
  siteDescription: String,
  bannerText: String,
  buttonText: String,
  premiumPrices: {
    weekly: Number,
    monthly: Number,
    yearly: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);