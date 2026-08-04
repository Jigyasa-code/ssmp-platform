const express = require('express');
const router = express.Router();
const { createTicket, listTickets, getTicketDetails, addMessage, resolveTicket } = require('../controllers/ticket.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('student'), createTicket);
router.get('/', protect, listTickets);
router.get('/:id', protect, getTicketDetails);
router.post('/:id/messages', protect, addMessage);
router.put('/:id/resolve', protect, resolveTicket);

module.exports = router;
