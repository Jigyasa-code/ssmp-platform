const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseHandler');

const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });

  const cookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  };

  res.cookie('token', token, cookieOptions);
  return token;
};

// Login user (Student, Faculty, or HOD)
const login = async (req, res, next) => {
  try {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
      return sendError(res, 'Please provide Registration Number/Faculty ID and Password', 400);
    }

    // Find user (case-insensitive loginId check to prevent collation issue)
    const user = await User.findOne({ loginId: { $regex: new RegExp(`^${loginId}$`, 'i') } });
    if (!user) {
      return sendError(res, 'Invalid credentials', 401);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    // Set cookie and send response
    generateTokenAndSetCookie(res, user._id);

    // Clean user response
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      loginId: user.loginId,
      role: user.role,
      section: user.section,
      branch: user.branch,
      semester: user.semester,
      tempPasswordUsed: user.tempPasswordUsed
    };

    return sendSuccess(res, 'Logged in successfully', { user: userResponse });
  } catch (error) {
    next(error);
  }
};

// Logout user & clear cookie
const logout = async (req, res, next) => {
  try {
    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0),
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return sendSuccess(res, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// Get current logged-in user
const getMe = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }
    return sendSuccess(res, 'Session active', { user: req.user });
  } catch (error) {
    next(error);
  }
};

// Update password (especially for temp credentials)
const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return sendError(res, 'Please provide old and new passwords', 400);
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return sendError(res, 'Incorrect current password', 400);
    }

    // Hash new password using 12 rounds
    const salt = await bcrypt.genSalt(12);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.tempPasswordUsed = true; // Mark as permanent/updated

    await user.save();
    return sendSuccess(res, 'Password updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  getMe,
  updatePassword
};
