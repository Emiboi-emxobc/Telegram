const express =
require("express");

const  cartController = require("./cart.controller.js");

const protect = require("../middleware/auth.middleware.js");

const router =
  express.Router();

router.get(
  "/",
  protect,
  cartController.get
);

router.post(
  "/:productId",
  protect,
  cartController.add
);

router.patch(
  "/:productId",
  protect,
  cartController.updateQty
);

router.delete(
  "/:productId",
  protect,
  cartController.remove
);

router.delete(
  "/",
  protect,
  cartController.clear
);

module.exports = router;