const router =
  require('express').Router();

const controller =
  require('./auth.controller');

const validate =
  require('../../middlewares/validate.middleware');

const {
  registerSchema,
  loginSchema
} = require('./auth.validation');

router.post(
  '/register',
  validate(registerSchema),
  controller.register
);

router.post(
  '/login',
  validate(loginSchema),
  controller.login
);

router.post(
  '/logout',
  controller.logout
);

module.exports = router;