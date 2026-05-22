const productService =
  require('./product.service');

const asyncHandler =
  require('../../helpers/asyncHandler');

const sendResponse =
  require('../../helpers/sendResponse');

const ApiError =
  require('../../helpers/ApiError');

const uploadImage =
  require('../../helpers/uploadImage');
/* ======================
   GET PRODUCTS
====================== */

exports.getProducts =
  asyncHandler(
    async (req, res) => {

      const result =
        await productService.getProducts(
          req.query
        );

      return sendResponse(res, {
        message:
          'Products fetched',
        data:
          result.products,
        meta:
          result.pagination
      });

    }
  );

/* ======================
   GET SINGLE PRODUCT
====================== */

exports.getProduct =
  asyncHandler(
    async (req, res) => {

      const product =
        await productService.getProductBySlug(
          req.params.slug
        );

      if (!product) {

        throw new ApiError(
          404,
          'Product not found'
        );

      }

      return sendResponse(res, {
        message:
          'Product fetched',
        data: product
      });

    }
  );

/* ======================
   CREATE PRODUCT
====================== */

exports.createProduct =
  asyncHandler(
    async (req, res) => {

      const product =
        await productService.createProduct(
          req.body
        );

      return sendResponse(res, {
        statusCode: 201,
        message:
          'Product created',
        data: product
      });

    }
  );

/* ======================
   UPDATE PRODUCT
====================== */

exports.updateProduct =
  asyncHandler(
    async (req, res) => {

      const product =
        await productService.updateProduct(
          req.params.id,
          req.body
        );

      if (!product) {

        throw new ApiError(
          404,
          'Product not found'
        );

      }

      return sendResponse(res, {
        message:
          'Product updated',
        data: product
      });

    }
  );

/* ======================
   DELETE PRODUCT
====================== */

exports.deleteProduct =
  asyncHandler(
    async (req, res) => {

      const product =
        await productService.deleteProduct(
          req.params.id
        );

      if (!product) {

        throw new ApiError(
          404,
          'Product not found'
        );

      }

      return sendResponse(res, {
        message:
          'Product deleted'
      });

    }
  );

/* ======================
   UPLOAD PRODUCT IMAGE
====================== */

exports.uploadProductImage =
  asyncHandler(
    async (req, res) => {

      if (!req.file) {

        throw new ApiError(
          400,
          'Image is required'
        );

      }

      const result =
  await uploadImage(
    req.file,
    'marsdove-products'
  );
  
      return sendResponse(res, {
        message:
          'Image uploaded',
        data: {
          url:
            result.secure_url
        }
      });

    }
  );