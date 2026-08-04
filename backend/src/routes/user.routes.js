const express = require('express');
const router = express.Router();
const { getProfile, getAssignedStudents, getDashboardStats, getAllFaculty } = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.get('/profile', protect, getProfile);
router.get('/students', protect, authorize('faculty'), getAssignedStudents);
router.get('/stats', protect, getDashboardStats);
router.get('/faculty', protect, authorize('hod'), getAllFaculty);

module.exports = router;
