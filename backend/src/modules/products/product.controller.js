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
    const body = { ...req.body };

    let images = [];

    /* ======================
       1. HANDLE EXISTING IMAGES
    ====================== */
    if (body.images) {
      let parsed = body.images;

      // if stringified JSON
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = [parsed];
        }
      }

      if (Array.isArray(parsed)) {
        images = parsed.filter(
          (img) => typeof img === "string"
        );
      }
    }

    /* ======================
       2. HANDLE NEW FILE UPLOADS
       (req.files OR object fallback)
    ====================== */
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await uploadImage(
          file,
          "marsdove-products"
        );

        images.push(uploaded.secure_url);
      }
    }

    /* ======================
       3. HANDLE BROKEN OBJECT IMAGES (YOUR BUG)
       e.g. [{}] coming from frontend state
    ====================== */
    if (Array.isArray(body.images)) {
      for (const img of body.images) {
        if (!img) continue;

        // already handled string
        if (typeof img === "string") continue;

        // treat object as file (defensive fix)
        if (typeof img === "object") {
          const uploaded = await uploadImage(
            img,
            "marsdove-products"
          );

          images.push(uploaded.secure_url);
        }
      }
    }

    /* ======================
       4. CLEAN FINAL ARRAY
    ====================== */
    images = images.filter(
      (img) =>
        typeof img === "string" &&
        img.trim().length > 0
    );

    if (images.length === 0) {
      throw new ApiError(
        400,
        "Product image is required"
      );
    }

    /* ======================
       5. UPDATE PRODUCT
    ====================== */
    const product =
      await productService.updateProduct(
        req.params.id,
        {
          ...body,
          price:
            body.price !== undefined
              ? Number(body.price)
              : undefined,
          stock:
            body.stock !== undefined
              ? Number(body.stock)
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
      message: "Product updated",
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