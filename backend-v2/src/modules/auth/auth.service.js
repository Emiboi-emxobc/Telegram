const bcrypt =
  require('bcryptjs');

const jwt =
  require('jsonwebtoken');

const User =
  require('./auth.model');

const ApiError =
  require('../../helpers/ApiError');

/* ======================
   TOKEN GENERATOR
====================== */

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role
    },

    process.env.JWT_SECRET,

    {
      expiresIn: '7d'
    }
  );
}

/* ======================
   SANITIZE USER
====================== */

function sanitizeUser(user) {
  return {
    id: user._id,

    name: user.name,

    email: user.email,

    role: user.role,

    createdAt:
      user.createdAt
  };
}

/* ======================
   REGISTER USER
====================== */

exports.registerUser =
  async payload => {

    const email =
      payload.email
        .trim()
        .toLowerCase();

    /* ======================
       CHECK EXISTING USER
    ====================== */

    const exists =
      await User.findOne({
        email
      });

    if (exists) {
      throw new ApiError(
        400,
        'User already exists'
      );
    }

    /* ======================
       HASH PASSWORD
    ====================== */

    const hashedPassword =
      await bcrypt.hash(
        payload.password,
        12
      );

    /* ======================
       CREATE USER
    ====================== */

    const user =
      await User.create({
        ...payload,

        email,

        password:
          hashedPassword
      });

    /* ======================
       GENERATE TOKEN
    ====================== */

    const token =
      generateToken(user);

    /* ======================
       RETURN SAFE DATA
    ====================== */

    return {
      token,

      user:
        sanitizeUser(user)
    };
  };

/* ======================
   LOGIN USER
====================== */

exports.loginUser =
  async payload => {

    const email =
      payload.email
        .trim()
        .toLowerCase();

    /* ======================
       FIND USER
    ====================== */

    const user =
  await User.findOne({
    email
  }).select('+password');

    if (!user) {
      throw new ApiError(
        401,
        'Invalid credentials'
      );
    }

    /* ======================
       CHECK PASSWORD
    ====================== */

    const isMatch =
      await bcrypt.compare(
        payload.password,
        user.password
      );

    if (!isMatch) {
      throw new ApiError(
        401,
        'Invalid credentials'
      );
    }

    /* ======================
       GENERATE TOKEN
    ====================== */

    const token =
      generateToken(user);

    /* ======================
       RETURN SAFE DATA
    ====================== */

    return {
      token,

      user:
        sanitizeUser(user)
    };
  };