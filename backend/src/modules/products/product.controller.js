const productService = require("./product.service");
const asyncHandler = require("../../helpers/asyncHandler");
const sendResponse = require("../../helpers/sendResponse");
const ApiError = require("../../helpers/ApiError");
const uploadImage = require("../../helpers/uploadImage");

/* ======================
   GET PRODUCTS
====================== */

exports.getProducts = asyncHandler(
  async (req, res) => {
    const result =
      await productService.getProducts(
        req.query
      );

    return sendResponse(res, {
      message: "Products fetched",
      data: result.products,
      meta: result.pagination
    });
  }
);

/* ======================
   GET PRODUCT
====================== */

exports.getProduct = asyncHandler(
  async (req, res) => {
    const product =
      await productService.getProduct(
        req.params.idOrSlug
      );

    if (!product) {
      throw new ApiError(
        404,
        "Product not found"
      );
    }

    return sendResponse(res, {
      message: "Product fetched",
      data: product
    });
  }
);

/* ======================
   CREATE PRODUCT
====================== */

exports.createProduct = asyncHandler(
  async (req, res) => {
    const body = req.body;

    if (
      !body.name ||
      !body.price ||
      !body.category
    ) {
      throw new ApiError(
        400,
        "Missing required fields"
      );
    }

    if (
      !req.files ||
      req.files.length === 0
    ) {
      throw new ApiError(
        400,
        "Product image is required"
      );
    }

    const images = [];

    for (const file of req.files) {
      const uploaded =
        await uploadImage(
          file,
          "marsdove-products"
        );

      images.push(
        uploaded.secure_url
      );
    }

    const product =
      await productService.createProduct(
        {
          ...body,
          price: Number(
            body.price
          ),
          stock: Number(
            body.stock || 0
          ),
          images
        },
        req.user
      );

    return sendResponse(res, {
      statusCode: 201,
      message:
        "Product created",
      data: product
    });
  }
);

/* ======================
   UPDATE PRODUCT
====================== */

exports.updateProduct = asyncHandler(
  async (req, res) => {
    const body = {
      ...req.body
    };

    let images = [];

    // Existing images coming from form
    if (body.images) {
      if (
        Array.isArray(body.images)
      ) {
        images = body.images;
      } else {
        images = [body.images];
      }
    }

    // Upload newly added images
    if (
      req.files &&
      req.files.length > 0
    ) {
      for (const file of req.files) {
        const uploaded =
          await uploadImage(
            file,
            "marsdove-products"
          );

        images.push(
          uploaded.secure_url
        );
      }
    }

    // Product must always have at least one image
    if (images.length === 0) {
      throw new ApiError(
        400,
        "Product image is required"
      );
    }

    const product =
      await productService.updateProduct(
        req.params.id,
        {
          ...body,
          price:
            body.price !== undefined
              ? Number(
                  body.price
                )
              : undefined,
          stock:
            body.stock !== undefined
              ? Number(
                  body.stock
                )
              : undefined,
          images
        }
      );

    if (!product) {
      throw new ApiError(
        404,
        "Product not found"
      );
    }

    return sendResponse(res, {
      message:
        "Product updated",
      data: product
    });
  }
);

/* ======================
   DELETE PRODUCT
====================== */

exports.deleteProduct = asyncHandler(
  async (req, res) => {
    const product =
      await productService.deleteProduct(
        req.params.id
      );

    if (!product) {
      throw new ApiError(
        404,
        "Product not found"
      );
    }

    return sendResponse(res, {
      message:
        "Product deleted"
    });
  }
);