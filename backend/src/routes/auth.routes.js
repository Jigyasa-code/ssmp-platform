const express = require('express');
const router = express.Router();
const { login, logout, getMe, updatePassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');

// Rate limit logins only
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/update-password', protect, updatePassword);

module.exports = router;
