const bcrypt =
  require("bcryptjs");

const jwt =
  require("jsonwebtoken");

const User =
  require("./auth.model");

const ApiError =
  require("../../helpers/ApiError");

/* ======================
   TOKEN
====================== */

function generateToken(
  user
) {
  return jwt.sign(
    {
      id: user._id,

      role:
        user.role
    },

    process.env.JWT_SECRET,

    {
      expiresIn: "7d"
    }
  );
}

/* ======================
   SANITIZE
====================== */

function sanitizeUser(
  user
) {
  return {
    id: user._id,

    name:
      user.name,

    email:
      user.email,

    role:
      user.role,

    createdAt:
      user.createdAt
  };
}

/* ======================
   REGISTER
====================== */

exports.registerUser =
  async (
    payload
  ) => {

    let {
      name,
      email,
      password
    } = payload;

    email =
      email
        .trim()
        .toLowerCase();

    const exists =
      await User.findOne({
        email
      });

    if (exists) {
      throw new ApiError(
        400,
        "User already exists"
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    const user =
      await User.create({
        name,
        email,

        password:
          hashedPassword
      });

    return {
      token:
        generateToken(user),

      user:
        sanitizeUser(user)
    };
  };

/* ======================
   LOGIN
====================== */

exports.loginUser =
  async (
    payload
  ) => {

    const email =
      payload.email
        .trim()
        .toLowerCase();

    const user =
      await User.findOne({
        email
      }).select(
        "+password"
      );

    if (!user) {
      throw new ApiError(
        401,
        "Invalid credentials"
      );
    }

    const isMatch =
      await bcrypt.compare(
        payload.password,
        user.password
      );

    if (!isMatch) {
      throw new ApiError(
        401,
        "Invalid credentials"
      );
    }

    return {
      token:
        generateToken(user),

      user:
        sanitizeUser(user)
    };
  };

/* ======================
   UPDATE CREDENTIALS
====================== */

exports.updateCredentials =
  async (
    user,
    payload
  ) => {

    const dbUser =
      await User.findById(
        user.id
      ).select(
        "+password"
      );

    if (!dbUser) {
      throw new ApiError(
        404,
        "User not found"
      );
    }

    const updates = {};

    /* EMAIL */

    if (payload.email) {
      updates.email =
        payload.email
          .trim()
          .toLowerCase();
    }

    /* PASSWORD */

    if (
      payload.newPassword
    ) {

      const isAdmin =
        dbUser.role ===
        "admin";

      const hasSecret =
        payload.adminSecret &&
        payload.adminSecret ===
          process.env.ADMIN_SECRET;

      if (!hasSecret) {

        if (
          !payload.currentPassword
        ) {
          throw new ApiError(
            400,
            "Current password required"
          );
        }

        const valid =
          await bcrypt.compare(
            payload.currentPassword,
            dbUser.password
          );

        if (!valid) {
          throw new ApiError(
            401,
            "Invalid current password"
          );
        }
      }

      if (
        hasSecret &&
        !isAdmin
      ) {
        throw new ApiError(
          403,
          "Unauthorized secret usage"
        );
      }

      updates.password =
        await bcrypt.hash(
          payload.newPassword,
          12
        );
    }

    if (
      Object.keys(
        updates
      ).length === 0
    ) {
      throw new ApiError(
        400,
        "No valid fields provided"
      );
    }

    const updated =
      await User.findByIdAndUpdate(
        dbUser._id,
        updates,
        {
          new: true
        }
      );

    return sanitizeUser(
      updated
    );
  };