module.exports = function (
  res,
  {
    success = true,
    statusCode = 200,
    message = '',
    data = null
  }
) {
  return res
    .status(statusCode)
    .json({
      success,
      message,
      data
    });
};