const mongoose = require('mongoose');

const semesterSchema = new mongoose.Schema({
  academicYear: {
    type: String,
    required: true,
    trim: true
  },
  term: {
    type: String,
    required: true,
    enum: ['Odd', 'Even'],
    default: 'Odd'
  },
  isInitialized: {
    type: Boolean,
    default: false
  },
  currentStep: {
    type: Number,
    default: 1 // Stepper: 1: New Semester, 2: Upload Faculty, 3: Upload Student, 4: Validation, 5: Accounts & Sections Created
  },
  facultyData: {
    type: Array,
    default: []
  },
  studentData: {
    type: Array,
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Semester', semesterSchema);
