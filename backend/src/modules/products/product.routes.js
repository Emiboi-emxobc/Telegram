const router =
  require('express').Router();

const controller =
  require('./product.controller');

const authMiddleware =
  require('../../middlewares/auth.middleware');

const adminMiddleware =
  require('../../middlewares/admin.middleware');

router.get(
  '/',
  controller.getProducts
);

router.get(
  '/:slug',
  controller.getProduct
);

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  controller.createProduct
);

router.patch(
  '/:id',
  authMiddleware,
  adminMiddleware,
  controller.updateProduct
);

router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  controller.deleteProduct
);

module.exports = router;