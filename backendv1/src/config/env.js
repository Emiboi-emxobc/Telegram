require('dotenv').config();

module.exports = {
  PORT:
    process.env.PORT || 3000,

  NODE_ENV:
    process.env.NODE_ENV,

  MONGO_URI:
    process.env.MONGO_URI,

  JWT_SECRET:
    process.env.JWT_SECRET,

  CLOUDINARY_NAME:
    process.env.CLOUDINARY_NAME,

  CLOUDINARY_KEY:
    process.env.CLOUDINARY_KEY,

  CLOUDINARY_SECRET:
    process.env.CLOUDINARY_SECRET
};