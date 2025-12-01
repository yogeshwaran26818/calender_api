require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');

// Import configurations
require('./config/passport');

const app = express();

// CORS configuration
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection (optional - using JSON for prospects)
if (process.env.MONGODB_URI && process.env.USE_MONGODB === 'true') {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
      console.error('MongoDB connection error:', err.message);
      console.log('Using JSON file storage instead...');
    });
} else {
  console.log('Using JSON file storage for data...');
}

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/auth'));
app.use('/api/mcp', require('./routes/mcp'));
app.use('/api/llm', require('./routes/llm'));
app.use('/api/prospects', require('./routes/prospects'));

// Protected dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Access denied. Please login.' });
  }
  res.json({ 
    success: true, 
    message: 'Welcome to dashboard',
    user: {
      name: req.user.name,
      email: req.user.email,
      picture: req.user.picture
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});