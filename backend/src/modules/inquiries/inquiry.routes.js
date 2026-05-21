const router = require('express').Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage()
});

router.post(
  '/upload',
  authMiddleware,
  adminMiddleware,
  upload.single('image'),
  controller.uploadProductImage
);
const controller = require('./inquiry.controller');

router.get('/', controller.getInquiries);
router.post('/', controller.createInquiry);

module.exports = router;