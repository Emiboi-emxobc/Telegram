const crypto = require("crypto");
const slugify = require("slugify");
const Product = require("./product.model");

// assume you already created this somewhere
const { uploadImage } = require("../utils/uploadImage");

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
   IMAGE NORMALIZER
   (core fix)
====================== */

async function normalizeImages(images = []) {
  const results = [];

  for (const img of images) {
    if (!img) continue;

    // already uploaded URL → keep it
    if (typeof img === "string") {
      results.push(img);
      continue;
    }

    // file object (multer)
    if (img.path) {
      const uploadedUrl = await uploadImage(img.path);
      results.push(uploadedUrl);
      continue;
    }

    // fallback ignore junk
  }

  return results;
}

/* ======================
   CREATE
====================== */

async function createProduct(payload, user) {
  const images = await normalizeImages(payload.images);

  if (!images.length) {
    throw new Error("Product image is required");
  }

  return Product.create({
    id: crypto.randomUUID(),
    sku: `SKU-${Date.now()}`,
    slug: slugify(payload.name, { lower: true, strict: true }),
    createdBy: user?.id || null,
    images,
    ...payload
  });
}

/* ======================
   UPDATE (FIXED CORE LOGIC)
====================== */

async function updateProduct(id, payload) {
  let updatedPayload = { ...payload };

  // handle images ONLY if provided
  if (payload.images) {
    const images = await normalizeImages(payload.images);
    updatedPayload.images = images;
  }

  return Product.findOneAndUpdate(
    { _id: id, isDeleted: false },
    updatedPayload,
    {
      new: true,
      runValidators: true
    }
  );
}

/* ======================
   DELETE (SOFT DELETE)
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