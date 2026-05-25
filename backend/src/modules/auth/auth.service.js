const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./auth.model");
const ApiError = require("../../helpers/ApiError");

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
      expiresIn: "7d"
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
    createdAt: user.createdAt
  };
}

/* ======================
   REGISTER USER
====================== */
exports.registerUser = async (payload) => {
  const email = payload.email.trim().toLowerCase();

  const exists = await User.findOne({ email });

  if (exists) {
    throw new ApiError(400, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);

  const user = await User.create({
    ...payload,
    email,
    password: hashedPassword
  });

  const token = generateToken(user);

  return {
    token,
    user: sanitizeUser(user)
  };
};

/* ======================
   LOGIN USER
====================== */
exports.loginUser = async (payload) => {
  const email = payload.email.trim().toLowerCase();

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(
    payload.password,
    user.password
  );

  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = generateToken(user);

  return {
    token,
    user: sanitizeUser(user)
  };
};

/* ======================
   UPDATE CREDENTIALS
   (EMAIL / PASSWORD / ADMIN OVERRIDE)
====================== */
exports.updateCredentials = async (user, payload) => {
  const dbUser = await User.findById(user.id).select("+password");

  if (!dbUser) {
    throw new ApiError(404, "User not found");
  }

  const updates = {};

  /* ======================
     EMAIL UPDATE
  ====================== */
  if (payload.email) {
    updates.email = payload.email.trim().toLowerCase();
  }

  /* ======================
     PASSWORD UPDATE
  ====================== */
  if (payload.newPassword) {
    const adminSecret = payload.adminSecret;

    const isAdmin = dbUser.role === "admin";

    const hasSecret =
      adminSecret &&
      adminSecret === process.env.ADMIN_SECRET;

    /* ======================
       NORMAL MODE (SAFE)
    ====================== */
    if (!hasSecret) {
      if (!payload.currentPassword) {
        throw new ApiError(
          400,
          "Current password required"
        );
      }

      const isMatch = await bcrypt.compare(
        payload.currentPassword,
        dbUser.password
      );

      if (!isMatch) {
        throw new ApiError(
          401,
          "Invalid current password"
        );
      }
    }

    /* ======================
       ADMIN SECRET OVERRIDE SAFETY
    ====================== */
    if (hasSecret && !isAdmin) {
      throw new ApiError(
        403,
        "Unauthorized secret usage"
      );
    }

    updates.password = await bcrypt.hash(
      payload.newPassword,
      12
    );
  }

  /* ======================
     NO UPDATE GUARD
  ====================== */
  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided");
  }

  const updated = await User.findByIdAndUpdate(
    dbUser._id,
    updates,
    { new: true }
  );

  return sanitizeUser(updated);
};