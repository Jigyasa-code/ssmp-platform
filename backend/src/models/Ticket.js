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
    unique: true,
    trim: true
    // Note: generated in pre-save hook below; don't set required:true so
    // the hook fires before validation.
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
  // Student satisfaction rating — 1 to 5 stars, set once when ticket is Resolved
  satisfactionRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  messages: [messageSchema]
}, {
  timestamps: true
});

// Auto-generate ticketId before first save if not already set
ticketSchema.pre('save', async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticketId = `TKT-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

ticketSchema.index({ ticketId: 1 }, { unique: true });
ticketSchema.index({ studentId: 1 });
ticketSchema.index({ mentorId: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);

