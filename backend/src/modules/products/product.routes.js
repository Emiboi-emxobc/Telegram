const router = require("express").Router();

const controller = require("./product.controller");
const auth = require("../../middlewares/auth.middleware");
const admin = require("../../middlewares/admin.middleware");
const upload = require("../../middlewares/upload.middleware");

router.get("/", controller.getProducts);
router.get("/:slug", controller.getProduct);

router.post(
  "/",
  auth,
  admin,
  upload.array("images", 10),
  controller.createProduct
);

router.patch(
  "/:id",
  auth,
  admin,
  controller.updateProduct
);

router.delete(
  "/:id",
  auth,
  admin,
  controller.deleteProduct
);

module.exports = router;