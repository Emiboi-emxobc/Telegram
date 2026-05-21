const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },

    sku: {
      type: String,
      required: true,
      unique: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      index: true
    },

    shortDescription: String,
    description: String,

    category: {
      type: String,
      required: true,
      index: true
    },

    subCategory: {
      type: String,
      index: true
    },

    brand: String,
    color: String,
    material: String,
    finish: String,

    price: {
      type: Number,
      required: true,
      index: true
    },

    promo: Number,
    currency: {
      type: String,
      default: 'NGN'
    },

    stock: {
      type: Number,
      default: 0
    },

    sold: {
      type: Number,
      default: 0
    },

    views: {
      type: Number,
      default: 0
    },

    likes: {
      type: Number,
      default: 0
    },

    comments: {
      type: Array,
      default: []
    },

    reviews: {
      type: Number,
      default: 0
    },

    rating: {
      type: Number,
      default: 0
    },

    tags: {
      type: [String],
      default: [],
      index: true
    },

    features: {
      type: [String],
      default: []
    },

    dimensions: {
      width: String,
      height: String,
      depth: String
    },

    weightCapacity: String,

    images: {
      type: [String],
      default: []
    },

    shipping: {
      time: String,
      fee: Number,
      freeShipping: Boolean
    },

    status: {
      type: String,
      default: 'in-stock'
    },

    featured: {
      type: Boolean,
      default: false,
      index: true
    },

    trending: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  category: 'text',
  subCategory: 'text'
});

module.exports = mongoose.model('Product', productSchema);