const bcrypt =
  require('bcryptjs');

const jwt =
  require('jsonwebtoken');

const User =
  require('./auth.model');

const ApiError =
  require('../../helpers/ApiError');

exports.registerUser =
  async payload => {
    const exists =
      await User.findOne({
        email: payload.email
      });

    if (exists) {
      throw new ApiError(
        400,
        'User already exists'
      );
    }

    const hashed =
      await bcrypt.hash(
        payload.password,
        12
      );

    const user =
      await User.create({
        ...payload,
        password: hashed
      });

    return user;
  };

exports.loginUser =
  async payload => {
    const user =
      await User.findOne({
        email: payload.email
      });

    if (!user) {
      throw new ApiError(
        401,
        'Invalid credentials'
      );
    }

    const match =
      await bcrypt.compare(
        payload.password,
        user.password
      );

    if (!match) {
      throw new ApiError(
        401,
        'Invalid credentials'
      );
    }

    const token =
      jwt.sign(
        {
          id: user._id,
          role: user.role
        },
        process.env.JWT_SECRET,
        {
          expiresIn: '7d'
        }
      );

    return {
      token,
      user
    };
  };