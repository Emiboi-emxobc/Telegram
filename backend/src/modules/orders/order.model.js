const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true
        },
        quantity: Number,
        price: Number
      }
    ],

    subtotal: Number,
    total: Number,

    status: {
      type: String,
      default: "pending"
    },

    checkoutType: {
      type: String,
      default: "whatsapp"
    },

    customer: {
      name: String,
      phone: String,
      email: String
    },

    notes: String,

    location: {
      address: String,
      city: String,
      state: String
    },

    requestLocation: {
      country: String,
      region: String,
      city: String,
      ip: String
    },

    timeline: [
      {
        status: String,
        at: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);