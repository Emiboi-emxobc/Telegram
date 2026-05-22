module.exports = function (
  data,
  allowed = []
) {
  const filtered = {};

  for (const key of allowed) {
    filtered[key] = data[key];
  }

  return filtered;
};