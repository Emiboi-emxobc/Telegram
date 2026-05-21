module.exports = (
  error,
  req,
  res,
  next
) => {
  console.error(error);

  return res.status(
    error.status || 500
  ).json({
    success: false,
    message:
      error.message ||
      'Server Error'
  });
};