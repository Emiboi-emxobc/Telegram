const router =
  require('express').Router();

const controller =
  require('./auth.controller');

const validate =
  require('../../middlewares/validate.middleware');

const authMiddleware =
  require('../../middlewares/auth.middleware');

const {
  registerSchema,
  loginSchema
} = require('./auth.validation');

/* ======================
   REGISTER
====================== */
router.post(
  '/register',
  validate(registerSchema),
  controller.register
);

/* ======================
   LOGIN
====================== */
router.post(
  '/login',
  validate(loginSchema),
  controller.login
);

/* ======================
   LOGOUT
====================== */
router.post(
  '/logout',
  controller.logout
);

/* ======================
   CURRENT USER
====================== */
router.get(
  '/me',
  authMiddleware,
  controller.getMe
);

/* ======================
   UPDATE CREDENTIALS
   (EMAIL / PASSWORD / ADMIN OVERRIDE)
====================== */
router.patch(
  '/update-credentials',
  authMiddleware,
  controller.updateCredentials
);

module.exports = router;