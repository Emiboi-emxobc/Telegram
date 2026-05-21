const jwt =
  require('jsonwebtoken');

const User =
  require('../modules/auth/auth.model');

const ApiError =
  require('../helpers/ApiError');

module.exports =
  async (req, res, next) => {
    try {
      const token =
        req.cookies?.token;
      
      if (!token) {
        throw new ApiError(
          401,
          'Authentication required'
        );
      }
      
      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );
      
      const user =
        await User.findById(
          decoded.id
        ).select('-password');
      
      if (!user) {
        throw new ApiError(
          401,
          'User not found'
        );
      }
      
      req.user = user;
      
      next();
    } catch (error) {
      next(error);
    }
  };