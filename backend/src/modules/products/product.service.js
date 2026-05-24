const crypto = require("crypto");
const slugify = require("slugify");
const Product = require("./product.model");

async function getProducts(query = {}) {
  const {
    search,
    category,
    featured,
    trending,
    min,
    max,
    sort = "-createdAt",
    page = 1,
    limit = 12
  } = query;

  const filters = { isDeleted: false };

  if (search?.trim()) {
    filters.$text = { $search: search.trim() };
  }

  if (category) filters.category = category;

  if (featured !== undefined) filters.featured = featured === "true";
  if (trending !== undefined) filters.trending = trending === "true";

  if (min || max) {
    filters.price = {};
    if (min) filters.price.$gte = Number(min);
    if (max) filters.price.$lte = Number(max);
  }

  const pageNum = Math.max(Number(page), 1);
  const pageLimit = Math.min(Number(limit), 50);
  const skip = (pageNum - 1) * pageLimit;

  const products = await Product.find(filters)
    .sort(sort)
    .skip(skip)
    .limit(pageLimit)
    .lean();

  const total = await Product.countDocuments(filters);

  return {
    products,
    pagination: {
      total,
      page: pageNum,
      limit: pageLimit,
      pages: Math.ceil(total / pageLimit)
    }
  };
}

async function getProductBySlug(slug) {
  return Product.findOne({ slug, isDeleted: false }).lean();
}

async function createProduct(payload, user) {
  if (!payload.images || payload.images.length === 0) {
    throw new Error("Product image is required");
  }

  return Product.create({
    sku: `SKU-${Date.now()}`,
    id: crypto.randomUUID(),
    slug: slugify(payload.name, { lower: true, strict: true }),

    createdBy: user?.id || null,

    ...payload
  });
}

async function updateProduct(id, payload) {
  return Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    payload,
    { new: true, runValidators: true }
  );
}

async function deleteProduct(id) {
  return Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true }
  );
}

module.exports = {
  getProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct
};