const mongoose = require('mongoose');

let mongoServer;
let isConnected = false;

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
    } catch (memError) {
      console.error(`Failed to start/connect to in-memory MongoDB: ${memError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;

