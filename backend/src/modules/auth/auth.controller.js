const sendResponse =
  require('../../helpers/sendResponse');

const authService =
  require('./auth.service');

/* ======================
   COOKIE OPTIONS
====================== */

const cookieOptions = {
  httpOnly: true,

  secure:
    process.env.NODE_ENV ===
    'production',

  sameSite: 'strict',

  maxAge:
    7 *
    24 *
    60 *
    60 *
    1000
};


exports.updateCredentials =
  async (req, res, next) => {
    try {

      const result =
        await authService.updateCredentials(
          req.user,
          req.body
        );

      return sendResponse(
        res,
        {
          message:
            "Credentials updated successfully",
          data: result
        }
      );

    } catch (error) {
      next(error);
    }
  };

/* ======================
   REGISTER
====================== */

exports.register =
  async (
    req,
    res,
    next
  ) => {
    try {

      const result =
        await authService.registerUser(
          req.body
        );

      /* ======================
         STORE TOKEN
      ====================== */

      res.cookie(
        'token',
        result.token,
        cookieOptions
      );

      /* ======================
         RESPONSE
      ====================== */

      return sendResponse(
        res,
        {
          message:
            'User registered',

          data:
            result.user
        },
        201
      );

    } catch (error) {
      next(error);
    }
  };

/* ======================
   LOGIN
====================== */

exports.login =
  async (
    req,
    res,
    next
  ) => {
    try {

      const result =
        await authService.loginUser(
          req.body
        );

      /* ======================
         STORE TOKEN
      ====================== */

      res.cookie(
        'token',
        result.token,
        cookieOptions
      );

      /* ======================
         RESPONSE
      ====================== */

      return sendResponse(
        res,
        {
          message:
            'Login successful',

          data:
            result.user,
            token : result.token
        }
      );

    } catch (error) {
      next(error);
    }
  };

/* ======================
   LOGOUT
====================== */

exports.logout =
  (
    req,
    res
  ) => {

    res.clearCookie(
      'token',
      {
        httpOnly: true,
        sameSite: 'strict',
        secure:
          process.env.NODE_ENV ===
          'production'
      }
    );

    return sendResponse(
      res,
      {
        message:
          'Logged out successfully'
      }
    );
  };

/* ======================
   CURRENT USER
====================== */

exports.getMe =
  async (
    req,
    res,
    next
  ) => {
    try {

      return sendResponse(
        res,
        {
          data: req.user
        }
      );

    } catch (error) {
      next(error);
    }
  };