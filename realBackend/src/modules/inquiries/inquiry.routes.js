const router =
  require('express').Router();

const controller =
  require('./inquiry.controller');

router.get(
  '/',
  controller.getInquiries
);

router.post(
  '/',
  controller.createInquiry
);

module.exports = router;