// backend/src/scripts/reset-labtech-password.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/index.js');
const bcrypt = require('bcryptjs');

async function resetPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const user = await User.findOne({ email: 'labtech@generalcityhospital.com' });
    
    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    // Set new password
    const newPassword = 'password123';
    user.password = newPassword; // The pre-save hook will hash it
    await user.save();

    console.log('✅ Password reset successfully!');
    console.log('=====================================');
    console.log('Email:', user.email);
    console.log('New Password:', newPassword);
    console.log('=====================================\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetPassword();