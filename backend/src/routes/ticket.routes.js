const express = require('express');
const router = express.Router();
const { createTicket, listTickets, getTicketDetails, addMessage, resolveTicket, rateTicket } = require('../controllers/ticket.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('student'), createTicket);
router.get('/', protect, listTickets);
router.get('/:id', protect, getTicketDetails);
router.post('/:id/messages', protect, addMessage);
router.put('/:id/resolve', protect, resolveTicket);
router.patch('/:id/rating', protect, authorize('student'), rateTicket);

module.exports = router;
