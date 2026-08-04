const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Academic', 'ERP/Tech', 'Infrastructure']
  },
  status: {
    type: String,
    required: true,
    enum: ['Open', 'In Progress', 'Resolved'],
    default: 'Open'
  },
  messages: [messageSchema]
}, {
  timestamps: true
});

ticketSchema.index({ ticketId: 1 }, { unique: true });
ticketSchema.index({ studentId: 1 });
ticketSchema.index({ mentorId: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
