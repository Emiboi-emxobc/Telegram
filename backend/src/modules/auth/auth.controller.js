const sendResponse =
  require("../../helpers/sendResponse");

const authService =
  require("./auth.service");

/* ======================
   COOKIE OPTIONS
====================== */

const cookieOptions = {
  httpOnly: true,

  secure:
    process.env.NODE_ENV ===
    "production",

  sameSite: "strict",

  maxAge:
    7 *
    24 *
    60 *
    60 *
    1000
};

/* ======================
   UPDATE CREDENTIALS
====================== */

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
          success: true,

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

      res.cookie(
        "token",
        result.token,
        cookieOptions
      );

      return sendResponse(
        res,
        {
          success: true,

          message:
            "User registered successfully",

          data: result.user,

          token:
            result.token
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

      res.cookie(
        "token",
        result.token,
        cookieOptions
      );

      return sendResponse(
        res,
        {
          success: true,

          message:
            "Login successful",

          data: result.user,

          token:
            result.token
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
      "token",
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "strict"
      }
    );

    return sendResponse(
      res,
      {
        success: true,

        message:
          "Logged out successfully"
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
          success: true,

          data:
            req.user
        }
      );
    } catch (error) {
      next(error);
    }
  };