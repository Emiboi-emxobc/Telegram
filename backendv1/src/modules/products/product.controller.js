const productService = require("./product.service");
const asyncHandler = require("../../helpers/asyncHandler");
const sendResponse = require("../../helpers/sendResponse");
const ApiError = require("../../helpers/ApiError");
const uploadImage = require("../../helpers/uploadImage");

exports.getProducts = asyncHandler(async (req, res) => {
  const result = await productService.getProducts(req.query);
  
  return sendResponse(res, {
    message: "Products fetched",
    data: result.products,
    meta: result.pagination
  });
});

exports.getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  return sendResponse(res, {
    message: "Product fetched",
    data: product
  });
});

exports.createProduct = asyncHandler(async (req, res) => {
  const body = req.body;
  
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

exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(
    req.params.id,
    req.body
  );
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  return sendResponse(res, {
    message: "Product updated",
    data: product
  });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await productService.deleteProduct(req.params.id);
  
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  return sendResponse(res, {
    message: "Product deleted"
  });
});