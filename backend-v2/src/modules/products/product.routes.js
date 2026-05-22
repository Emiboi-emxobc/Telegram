const router =
  require('express').Router();

const controller =
  require('./product.controller');

const authMiddleware =
  require('../../middlewares/auth.middleware');

const adminMiddleware =
  require('../../middlewares/admin.middleware');

const validate =
  require('../../middlewares/validate.middleware');

const upload =
  require('../../middlewares/upload.middleware');

const {
  createProductSchema,
  updateProductSchema
} = require('./product.validation');

/* ======================
   PUBLIC ROUTES
====================== */

router.get(
  '/',
  controller.getProducts
);

router.get(
  '/:slug',
  controller.getProduct
);

/* ======================
   ADMIN ROUTES
====================== */

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  validate(
    createProductSchema
  ),
  controller.createProduct
);

router.patch(
  '/:id',
  authMiddleware,
  adminMiddleware,
  validate(
    updateProductSchema
  ),
  controller.updateProduct
);

router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  controller.deleteProduct
);

/* ======================
   IMAGE UPLOAD
====================== */

router.post(
  '/upload/image',

  authMiddleware,

  adminMiddleware,

  upload.single('image'),

  controller.uploadProductImage
);

module.exports =
  router;