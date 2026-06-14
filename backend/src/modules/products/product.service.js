const crypto = require("crypto");
const slugify = require("slugify");
const Product = require("./product.model");

/* ======================
   GET PRODUCTS
====================== */

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

  if (featured !== undefined) {
    filters.featured = featured === "true";
  }

  if (trending !== undefined) {
    filters.trending = trending === "true";
  }

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

/* ======================
   GET SINGLE PRODUCT
====================== */

async function getProduct(idOrSlug) {
  const query = { isDeleted: false };

  if (/^[0-9a-fA-F]{24}$/.test(idOrSlug)) {
    query._id = idOrSlug;
  } else {
    query.slug = idOrSlug;
  }

  return Product.findOne(query).lean();
}

/* ======================
   SANITIZE IMAGES (CORE FIX)
====================== */

function sanitizeImages(images = []) {
  if (!Array.isArray(images)) return [];

  return images.filter(
    (img) =>
      typeof img === "string" &&
      img.trim().startsWith("http")
  );
}

/* ======================
   CREATE
====================== */

async function createProduct(payload, user) {
  const images = sanitizeImages(payload.images);

  if (images.length === 0) {
    throw new Error("Product image is required");
  }

  return Product.create({
    id: crypto.randomUUID(),
    sku: `SKU-${Date.now()}`,
    slug: slugify(payload.name, {
      lower: true,
      strict: true
    }),
    createdBy: user?.id || null,
    ...payload,
    images
  });
}

/* ======================
   UPDATE
====================== */

async function updateProduct(id, payload) {
  const update = {};

  // Images
  if (payload.images !== undefined) {
    update.images = sanitizeImages(payload.images);
  }

  // Other fields
  Object.entries(payload).forEach(([key, value]) => {
    if (
      value !== undefined &&
      key !== "images"
    ) {
      update[key] = value;
    }
  });

  return Product.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false
    },
    update,
    {
      new: true,
      runValidators: true
    }
  );
}

/* ======================
   DELETE
====================== */

async function deleteProduct(id) {
  return Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
}

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
};