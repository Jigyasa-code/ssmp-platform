const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

let mongoServer;
let isConnected = false;

const seedHodAccount = async () => {
  try {
    const hod = await User.findOne({ role: 'hod' });
    if (!hod) {
      console.log('Seeding default HOD account...');
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash('Password123', salt);
      
      const defaultHod = new User({
        name: 'Dr. Sarah Jenkins',
        email: 'hod@muj.manipal.edu',
        loginId: 'hod',
        passwordHash,
        role: 'hod',
        tempPasswordUsed: true
      });
      
      await defaultHod.save();
      console.log('Default HOD user created: loginId="hod", password="Password123"');
    } else {
      console.log('HOD account exists: loginId="hod"');
    }
  } catch (error) {
    console.error('Seeding HOD account failed:', error);
  }
};

const connectDB = async () => {
  if (isConnected) {
    console.log('MongoDB: Using cached database connection');
    return;
  }

  try {
    // Attempt standard connection with a 5-second timeout
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ssmp', {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = conn.connection.readyState === 1;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Seed default admin account
    await seedHodAccount();
  } catch (error) {
    console.warn(`Local MongoDB connection failed: ${error.message}`);
    console.log('Attempting to start an in-memory MongoDB server for development...');
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create({
        binary: {
          version: '4.4.29'
        }
      });
      const mongoUri = mongoServer.getUri();
      
      const conn = await mongoose.connect(mongoUri);
      isConnected = conn.connection.readyState === 1;
      console.log(`In-Memory MongoDB Connected: ${conn.connection.host}`);
      console.log(`Temporary Database URI: ${mongoUri}`);
      
      // Seed default admin account
      await seedHodAccount();
    } catch (memError) {
      console.error(`Failed to start/connect to in-memory MongoDB: ${memError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;

