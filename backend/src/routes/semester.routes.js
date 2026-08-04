const express = require('express');
const router = express.Router();
const { startSemesterInit, getCurrentSetup, uploadFaculty, uploadStudent, validateData, finalizeSemester } = require('../controllers/semester.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.use(protect);
router.use(authorize('hod'));

router.post('/init', startSemesterInit);
router.get('/current', getCurrentSetup);
router.post('/upload-faculty', upload.single('file'), uploadFaculty);
router.post('/upload-student', upload.single('file'), uploadStudent);
router.get('/validate', validateData);
router.post('/finalize', finalizeSemester);

module.exports = router;
