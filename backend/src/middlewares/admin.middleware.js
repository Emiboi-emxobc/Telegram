const ApiError =
  require('../helpers/ApiError');

module.exports =
  (req, res, next) => {
    if (
      req.user?.role !==
      'admin'
    ) {
      return next(
        new ApiError(
          403,
          'Admin access required'
        )
      );
    }
    
    next();
  };