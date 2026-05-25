const jwt = require("jsonwebtoken");
const User = require("../modules/auth/auth.model");
const ApiError = require("../helpers/ApiError");

module.exports = async (req, res, next) => {
  try {
    /* ======================
       EXTRACT TOKEN SAFELY
    ====================== */
    
    let cookieToken = req.cookies?.token;
    let headerToken = null;
    
    const authHeader = req.headers.authorization;
    
    if (authHeader && typeof authHeader === "string") {
      const parts = authHeader.split(" ");
      
      if (
        parts.length === 2 &&
        parts[0] === "Bearer" &&
        parts[1]
      ) {
        headerToken = parts[1].trim();
      }
    }
    
    /* ======================
       TOKEN PRIORITY RULE
       (HEADER FIRST - API SAFE)
    ====================== */
    
    let token = headerToken || cookieToken;
    
    if (!token || typeof token !== "string") {
      return next(
        new ApiError(401, "Authentication required")
      );
    }
    
    token = token.trim();
    
    /* ======================
       STRONG TOKEN VALIDATION
    ====================== */
    
    if (!/^[A-Za-z0-9-_\.]+$/.test(token)) {
      return next(
        new ApiError(401, "Invalid token format")
      );
    }
    
    if (token.length < 10 || token.length > 1000) {
      return next(
        new ApiError(401, "Invalid token length")
      );
    }
    
    /* ======================
       VERIFY TOKEN (HARDENED)
    ====================== */
    
    let decoded;
    
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"]
      });
    } catch (err) {
      return next(
        new ApiError(401, "Invalid or expired token")
      );
    }
    
    if (!decoded?.id || typeof decoded.id !== "string") {
      return next(
        new ApiError(401, "Invalid token payload")
      );
    }
    
    /* ======================
       FETCH USER
    ====================== */
    
    const user = await User.findById(decoded.id).select(
      "-password"
    );
    
    if (!user) {
      return next(
        new ApiError(401, "User no longer exists")
      );
    }
    
    /* ======================
       ACCOUNT STATUS CHECK
    ====================== */
    
    if (user.status === "disabled") {
      return next(
        new ApiError(403, "Account disabled")
      );
    }
    
    /* ======================
       FUTURE: SESSION REVOCATION HOOK
    ====================== */
    
    // if (user.tokenVersion !== decoded.ver) {
    //   return next(new ApiError(401, "Session revoked"));
    // }
    
    /* ======================
       ATTACH USER CONTEXT
    ====================== */
    
    req.user = user;
    
    next();
  } catch (error) {
    next(error);
  }
};