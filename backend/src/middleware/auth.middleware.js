const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/responseHandler');

const protect = async (req, res, next) => {
  try {
    let token = req.cookies.token;

    if (!token) {
      return sendError(res, 'Not authorized, session token missing', 401);
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    req.user = await User.findById(decoded.id).select('-passwordHash');
    if (!req.user) {
      return sendError(res, 'User not found in system session', 401);
    }

    next();
  } catch (error) {
    console.error(error);
    return sendError(res, 'Session token expired or invalid', 401);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, `Forbidden: role '${req.user?.role}' does not have permission`, 403);
    }
    next();
  };
};

module.exports = {
  protect,
  authorize
};
