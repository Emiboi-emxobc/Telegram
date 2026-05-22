const jwt =
  require('jsonwebtoken');

const User =
  require('../modules/auth/auth.model');

const ApiError =
  require('../helpers/ApiError');

module.exports =
  async (
    req,
    res,
    next
  ) => {
    try {
      
      /* ======================
         TOKEN CHECK
      ====================== */
      
      const token =
        req.cookies?.token;
      
      if (!token) {
        return next(
          new ApiError(
            401,
            'Authentication required'
          )
        );
      }
      
      /* ======================
         VERIFY TOKEN
      ====================== */
      
      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );
      
      if (!decoded?.id) {
        return next(
          new ApiError(
            401,
            'Invalid token'
          )
        );
      }
      
      /* ======================
         FIND USER
      ====================== */
      
      const user =
        await User.findById(
          decoded.id
        ).select(
          '-password'
        );
      
      if (!user) {
        return next(
          new ApiError(
            401,
            'User no longer exists'
          )
        );
      }
      
      /* ======================
         BLOCK DISABLED USERS
      ====================== */
      
      if (
        user.status ===
        'disabled'
      ) {
        return next(
          new ApiError(
            403,
            'Account disabled'
          )
        );
      }
      
      /* ======================
         ATTACH USER
      ====================== */
      
      req.user = user;
      
      next();
      
    } catch (error) {
      
      /* ======================
         TOKEN ERRORS
      ====================== */
      
      if (
        error.name ===
        'JsonWebTokenError'
      ) {
        return next(
          new ApiError(
            401,
            'Invalid token'
          )
        );
      }
      
      if (
        error.name ===
        'TokenExpiredError'
      ) {
        return next(
          new ApiError(
            401,
            'Session expired'
          )
        );
      }
      
      next(error);
    }
  };