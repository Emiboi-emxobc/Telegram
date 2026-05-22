module.exports = (
  error,
  req,
  res,
  next
) => {

  const status =
    error.status || 500;

  const response = {
    success: false,
    message:
      error.message ||
      'Server Error'
  };

  /* ======================
     DEVELOPMENT LOGS
  ====================== */

  if (
    process.env.NODE_ENV !==
    'production'
  ) {

    console.error(
      '❌ Error:',
      error
    );

    response.stack =
      error.stack;
  }

  /* ======================
     JWT ERRORS
  ====================== */

  if (
    error.name ===
    'JsonWebTokenError'
  ) {

    response.message =
      'Invalid token';
  }

  if (
    error.name ===
    'TokenExpiredError'
  ) {

    response.message =
      'Session expired';
  }

  /* ======================
     MONGOOSE ERRORS
  ====================== */

  if (
    error.name ===
    'ValidationError'
  ) {

    response.message =
      Object.values(
        error.errors
      )
        .map(
          item =>
            item.message
        )
        .join(', ');
  }

  if (
    error.code === 11000
  ) {

    response.message =
      'Duplicate field value';
  }

  return res
    .status(status)
    .json(response);

};