const express = require('express');
require('dotenv').config();
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const corsOptions = require('./config/cors');
const errorHandler = require('./middleware/error.middleware');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

// Routes imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const ticketRoutes = require('./routes/ticket.routes');
const semesterRoutes = require('./routes/semester.routes');

const app = express();

// Apply security headers
app.use(helmet());

// Enable CORS
app.use(cors(corsOptions));

// HTTP Request Logger
app.use(morgan('dev'));

// Capped incoming JSON payloads to 10kb to prevent Memory Exhaustion DoS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parse cookies (used for secure HttpOnly JWT tokens)
app.use(cookieParser());

// Base Route
app.get('/', (req, res) => {
  res.json({ message: 'SSMP Support Portal API is active' });
});

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/semester', semesterRoutes);

// Serve Static Frontend Assets in Production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  
  // Wildcard fallback for SPA routing: send index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../../frontend/dist', 'index.html'));
    }
  });
}

// Global Error Handler
app.use(errorHandler);

module.exports = app;
