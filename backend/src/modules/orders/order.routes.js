const express =
  require("express");

const protect =
  require("../../middlewares/auth.middleware");

const orderController =
  require("./order.controller.js");

const router =
  express.Router();

router.get(
  "/",
  protect,
  orderController.get
);

router.get(
  "/:id",
  protect,
  orderController.getOne
);

router.post(
  "/",
  protect,
  orderController.create
);

module.exports =
  router;