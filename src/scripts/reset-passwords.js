// backend/src/scripts/reset-passwords.js - ADD .select('+password')


require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model.js');
const bcrypt = require('bcryptjs');

async function resetPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    for (const { email, password } of passwordResets) {
      // IMPORTANT: Add .select('+password')
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        console.log(`⚠️  User not found: ${email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
      await user.save();

      console.log(`✅ Password reset for: ${email}`);
      console.log(`   Password: ${password}`);
    }

    console.log('\n✨ All passwords reset successfully!\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}