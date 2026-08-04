const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Create a new ticket (Student only)
const createTicket = async (req, res, next) => {
  try {
    const { subject, description, category } = req.body;

    if (!subject || !description || !category) {
      return sendError(res, 'Please provide subject, description, and category', 400);
    }

    if (!req.user.assignedMentor) {
      return sendError(res, 'No faculty mentor assigned. Please contact the administrator (HOD).', 400);
    }

    // Generate unique ticket ID, e.g. #AN-12345
    const ticketCount = await Ticket.countDocuments();
    const ticketId = `#AN-${1000 + ticketCount + 1}`;

    const newTicket = new Ticket({
      ticketId,
      studentId: req.user._id,
      mentorId: req.user.assignedMentor,
      subject,
      category,
      status: 'Open',
      messages: [{
        sender: req.user._id,
        text: description,
        timestamp: new Date()
      }]
    });

    await newTicket.save();
    return sendSuccess(res, 'Ticket raised successfully', { ticket: newTicket }, 201);
  } catch (error) {
    next(error);
  }
};

// List support tickets with pagination and filtering (Status, Category)
const listTickets = async (req, res, next) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    const query = {};

    // Enforce data isolation / RLS
    if (req.user.role === 'student') {
      query.studentId = req.user._id;
    } else if (req.user.role === 'faculty') {
      query.mentorId = req.user._id;
    } else if (req.user.role !== 'hod') {
      return sendError(res, 'Access denied', 403);
    }

    // Apply filters
    if (status && status !== 'All') {
      query.status = status;
    }
    if (category && category !== 'All Categories') {
      query.category = category;
    }

    const skipIndex = (page - 1) * limit;
    const total = await Ticket.countDocuments(query);
    
    const tickets = await Ticket.find(query)
      .populate('studentId', 'name email loginId section branch semester')
      .populate('mentorId', 'name email loginId')
      .sort({ updatedAt: -1 })
      .skip(skipIndex)
      .limit(Number(limit));

    return sendSuccess(res, 'Tickets retrieved successfully', {
      tickets,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

// Get details for a single ticket
const getTicketDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id)
      .populate('studentId', 'name email loginId section branch semester')
      .populate('mentorId', 'name email loginId')
      .populate('messages.sender', 'name role email');

    if (!ticket) {
      return sendError(res, 'Ticket not found', 404);
    }

    // Enforce role check for security
    const isStudentOwner = ticket.studentId._id.toString() === req.user._id.toString();
    const isAssignedMentor = ticket.mentorId._id.toString() === req.user._id.toString();
    const isHod = req.user.role === 'hod';

    if (!isStudentOwner && !isAssignedMentor && !isHod) {
      return sendError(res, 'Unauthorized to view this support ticket', 403);
    }

    return sendSuccess(res, 'Ticket details retrieved', { ticket });
  } catch (error) {
    next(error);
  }
};

// Add response message to a ticket
const addMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return sendError(res, 'Message text cannot be empty', 400);
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return sendError(res, 'Ticket not found', 404);
    }

    // Enforce role check for security
    const isStudentOwner = ticket.studentId.toString() === req.user._id.toString();
    const isAssignedMentor = ticket.mentorId.toString() === req.user._id.toString();
    const isHod = req.user.role === 'hod';

    if (!isStudentOwner && !isAssignedMentor && !isHod) {
      return sendError(res, 'Unauthorized to post response', 403);
    }

    // Add message
    ticket.messages.push({
      sender: req.user._id,
      text,
      timestamp: new Date()
    });

    // Auto-update status to 'In Progress' if mentor responds to an 'Open' ticket
    if (req.user.role === 'faculty' && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    const updatedTicket = await Ticket.findById(id)
      .populate('studentId', 'name email loginId section branch semester')
      .populate('mentorId', 'name email loginId')
      .populate('messages.sender', 'name role email');

    return sendSuccess(res, 'Response message added successfully', { ticket: updatedTicket });
  } catch (error) {
    next(error);
  }
};

// Resolve ticket
const resolveTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return sendError(res, 'Ticket not found', 404);
    }

    const isStudentOwner = ticket.studentId.toString() === req.user._id.toString();
    const isAssignedMentor = ticket.mentorId.toString() === req.user._id.toString();
    const isHod = req.user.role === 'hod';

    if (!isStudentOwner && !isAssignedMentor && !isHod) {
      return sendError(res, 'Unauthorized to modify ticket', 403);
    }

    ticket.status = 'Resolved';
    ticket.messages.push({
      sender: req.user._id,
      text: `Support ticket has been marked as Resolved by ${req.user.name}.`,
      timestamp: new Date()
    });

    await ticket.save();
    return sendSuccess(res, 'Ticket marked as resolved', { ticket });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTicket,
  listTickets,
  getTicketDetails,
  addMessage,
  resolveTicket
};
