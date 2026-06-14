const productService = require("./product.service");
const asyncHandler = require("../../helpers/asyncHandler");
const sendResponse = require("../../helpers/sendResponse");
const ApiError = require("../../helpers/ApiError");
const uploadImage = require("../../helpers/uploadImage");

/* ======================
   SAFE PARSER
====================== */

function safeParse(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/* ======================
   UPDATE PRODUCT
====================== */

exports.updateProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // normalize ALL incoming formdata strings
  body.dimensions = safeParse(body.dimensions);
  body.shipping = safeParse(body.shipping);
  body.tags = safeParse(body.tags);
  body.features = safeParse(body.features);
  body.comments = safeParse(body.comments);
  body.images = safeParse(body.images);

  const payload = {};

  /* ======================
     IMAGES
  ====================== */

  let images = [];
  let imagesProvided = false;

  if (body.images !== undefined) {
    imagesProvided = true;

    let parsed = body.images;

    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = [parsed];
      }
    }

    if (Array.isArray(parsed)) {
      images = parsed.filter(img => typeof img === "string");
    }
  }

  if (req.files?.length) {
    imagesProvided = true;

    for (const file of req.files) {
      const uploaded = await uploadImage(file, "marsdove-products");
      images.push(uploaded.secure_url);
    }
  }

  if (imagesProvided) {
    payload.images = images.filter(img => img?.startsWith("http"));
  }

  /* ======================
     OTHER FIELDS
  ====================== */

  Object.entries(body).forEach(([key, value]) => {
    if (
      value !== undefined &&
      !["images", "price", "stock"].includes(key)
    ) {
      payload[key] = value;
    }
  });

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