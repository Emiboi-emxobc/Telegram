const express =
  require("express");

const wishlistController =
  require("./wishlist.controller.js");

const protect =
  require("../middlewares/auth.middleware.js");

const router =
  express.Router();

router.get(
  "/",
  protect,
  wishlistController.get
);

router.post(
  "/:productId",
  protect,
  wishlistController.toggle
);

router.delete(
  "/",
  protect,
  wishlistController.clear
);

module.exports =
  router;