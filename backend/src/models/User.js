const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  loginId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['student', 'faculty', 'hod'],
    default: 'student'
  },
  section: {
    type: String,
    trim: true
  },
  branch: {
    type: String,
    trim: true
  },
  semester: {
    type: String,
    trim: true
  },
  // Faculty specific: students assigned to this mentor
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Student specific: mentor assigned to this student
  assignedMentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tempPasswordUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Force lowercase search/validation on email
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ loginId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
