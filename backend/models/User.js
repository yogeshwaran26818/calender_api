const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, index: true, unique: true },
  email: { type: String, required: true, index: true },
  name: { type: String },
  picture: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);