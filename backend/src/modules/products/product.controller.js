const productService = require("./product.service");
const asyncHandler = require("../../helpers/asyncHandler");
const sendResponse = require("../../helpers/sendResponse");
const ApiError = require("../../helpers/ApiError");
const uploadImage = require("../../helpers/uploadImage");

/* ======================
   BODY NORMALIZER (ONE PASS ONLY)
====================== */

function normalizeBody(body = {}) {
  const parsed = { ...body };

  const fields = [
    "dimensions",
    "shipping",
    "tags",
    "features",
    "comments",
    "images"
  ];

  for (const key of fields) {
    if (typeof parsed[key] === "string") {
      try {
        parsed[key] = JSON.parse(parsed[key]);
      } catch {
        parsed[key] = parsed[key];
      }
    }
  }

  return parsed;
}

/* ======================
   GET PRODUCTS
====================== */

exports.getProducts = asyncHandler(async (req, res) => {
  const result = await productService.getProducts(req.query);

  return sendResponse(res, {
    message: "Products fetched",
    data: result.products,
    meta: result.pagination
  });
});

/* ======================
   GET PRODUCT
====================== */

exports.getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProduct(req.params.idOrSlug);

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return sendResponse(res, {
    message: "Product fetched",
    data: product
  });
});

/* ======================
   CREATE PRODUCT
====================== */

exports.createProduct = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);

  if (!body.name || !body.price || !body.category) {
    throw new ApiError(400, "Missing required fields");
  }

  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, "Product image is required");
  }

  const images = [];

  for (const file of req.files) {
    const uploaded = await uploadImage(file, "marsdove-products");
    images.push(uploaded.secure_url);
  }

  const product = await productService.createProduct(
    {
      ...body,
      price: Number(body.price),
      stock: Number(body.stock || 0),
      images
    },
    req.user
  );

  return sendResponse(res, {
    statusCode: 201,
    message: "Product created",
    data: product
  });
});

/* ======================
   UPDATE PRODUCT
====================== */

exports.updateProduct = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);

  const payload = {};

  /* ======================
     IMAGES
  ====================== */

  let images = [];
  let imagesProvided = false;

  if (body.images !== undefined || req.files?.length) {
    imagesProvided = true;

    if (Array.isArray(body.images)) {
      images = body.images.filter(img => typeof img === "string");
    }

    if (req.files?.length) {
      for (const file of req.files) {
        const uploaded = await uploadImage(file, "marsdove-products");
        images.push(uploaded.secure_url);
      }
    }

    payload.images = images.filter(img => img?.startsWith("http"));
  }

  /* ======================
     OTHER FIELDS
  ====================== */

  for (const [key, value] of Object.entries(body)) {
    if (
      value !== undefined &&
      key !== "images" &&
      key !== "price" &&
      key !== "stock"
    ) {
      payload[key] = value;
    }
  }

  /* ======================
     NUMERIC FIELDS
  ====================== */

  if (body.price !== undefined) {
    payload.price = Number(body.price);
  }

  if (body.stock !== undefined) {
    payload.stock = Number(body.stock);
  }

  const product = await productService.updateProduct(
    req.params.id,
    payload
  );

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return sendResponse(res, {
    message: "Product updated",
    data: product
  });
});

/* ======================
   DELETE PRODUCT
====================== */

exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await productService.deleteProduct(req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return sendResponse(res, {
    message: "Product deleted"
  });
});