const sendResponse =
  require('../../helpers/sendResponse');

const authService =
  require('./auth.service');

exports.register =
  async (req, res, next) => {
    try {
      const user =
        await authService.registerUser(
          req.body
        );

      return sendResponse(res, {
        message:
          'User registered',
        data: user
      });
    } catch (error) {
      next(error);
    }
  };

exports.login =
  async (req, res, next) => {
    try {
      const result =
        await authService.loginUser(
          req.body
        );

      res.cookie(
        'token',
        result.token,
        {
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
        }
      );

      return sendResponse(res, {
        message:
          'Login successful',

        data: result.user
      });
    } catch (error) {
      next(error);
    }
  };

exports.logout = (
  req,
  res
) => {
  res.clearCookie('token');

  return sendResponse(res, {
    message:
      'Logged out successfully'
  });
};