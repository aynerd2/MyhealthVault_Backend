/**
 * MY HEALTH VAULT - MAIN SERVER FILE
 * This is where everything starts!
 * 
 * What this file does:
 * 1. Loads environment variables
 * 2. Sets up Express server
 * 3. Configures security and middleware
 * 4. Connects to MongoDB database
 * 5. Sets up routes
 * 6. Starts listening for requests
 */

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const routes = require('./routes/index.js');

// ==================== LOAD ENVIRONMENT VARIABLES ====================
// This loads variables from .env file (like database password, API keys)
dotenv.config();

// ✅ CHANGED: Updated required environment variables for Express auth
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET']; // ← CHANGED

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('Please check your .env file');
    process.exit(1); // Stop the server
  }
}

// ==================== CREATE EXPRESS APP ====================
const app = express();

// Trust proxy (needed when behind Railway/Render/Nginx)
app.set('trust proxy', 1);

// ==================== SECURITY MIDDLEWARE ====================

// 1. Helmet - Sets security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false,
}));

// 2. CORS - Allows frontend to make requests
const allowedOrigins = [
   'http://localhost:3000',
  'https://vaultmyhealth.com',
  'https://www.vaultmyhealth.com',
  'https://myhealthvault-frontend.vercel.app',
  process.env.FRONTEND_URL, // Production frontend
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ==================== BODY PARSING ====================
// These parse incoming request data

app.use(express.json({ limit: '10mb' })); // Parse JSON in request body
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse form data

// ==================== COMPRESSION ====================
// This makes responses smaller and faster
app.use(compression());

// ==================== LOGGING ====================
// Morgan logs all HTTP requests
if (process.env.NODE_ENV !== 'test') {
  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));
}


app.use('/uploads', express.static('uploads'));




// ==================== RATE LIMITING ====================
// Prevents abuse by limiting how many requests per IP

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Max requests
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all /api routes
app.use('/api/', limiter);

// ==================== ROUTES ====================

// Root route - Shows API info
app.get('/', (req, res) => {
  res.json({
    name: 'My Health Vault API',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth', // ✅ ADDED
      patients: '/api/patients',
      medicalRecords: '/api/medical-records',
      prescriptions: '/api/prescriptions',
      testResults: '/api/test-results',
      auditLogs: '/api/audit-logs',
    },
  });
});

// API routes (all routes from routes/index.js)
app.use('/api', routes);

// ==================== 404 HANDLER ====================
// This runs when no route matches
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

// ==================== ERROR HANDLER ====================
// This catches all errors in the app

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large',
      message: 'File size cannot exceed 10MB',
    });
  }

  // Multer file type error
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: err.message,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please check your input',
      details: err.errors,
    });
  }

  // Mongoose invalid ID error
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'The ID format is invalid',
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'This record already exists',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication token is invalid',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      message: 'Please log in again',
    });
  }

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
    });
  }

  // Default error (500 Internal Server Error)
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong',
    // Only show stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ==================== DATABASE CONNECTION ====================

const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔄 Connecting to MongoDB...');

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB successfully!');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 Host: ${mongoose.connection.host}`);
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Please check your MONGODB_URI in .env file');
    process.exit(1);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Will try to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// ==================== GRACEFUL SHUTDOWN ====================
// This handles server shutdown gracefully

async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
  
  try {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
}

// Listen for shutdown signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Kill command

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  shutdown('unhandledRejection');
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, HOST, () => {
    console.log('\n🎉 ===================================');
    console.log('🚀 Server started successfully!');
    console.log('🎉 ===================================\n');
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Server URL: http://${HOST}:${PORT}`);
    console.log(`🔗 API Base: http://${HOST}:${PORT}/api`);
    console.log(`💚 Health: http://${HOST}:${PORT}/api/health\n`);
    console.log('📋 Available endpoints:');
    console.log('   - GET    /api/health');
    console.log('   - POST   /api/auth/register'); // ✅ ADDED
    console.log('   - POST   /api/auth/login');    // ✅ ADDED
    console.log('   - GET    /api/auth/me');       // ✅ ADDED
    console.log('   - POST   /api/patients');
    console.log('   - GET    /api/patients/me');
    console.log('   - POST   /api/medical-records');
    console.log('   - POST   /api/prescriptions');
    console.log('   - POST   /api/test-results');
    console.log('   - GET    /api/audit-logs\n');
    console.log('✨ Press Ctrl+C to stop the server\n');
  });

  // Handle server errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`);
      console.error('Try a different port or stop the other server');
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

// Export app for testing
module.exports = app;