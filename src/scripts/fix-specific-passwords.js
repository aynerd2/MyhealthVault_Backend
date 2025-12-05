// backend/src/scripts/fix-specific-passwords.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model.js');

async function fixPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const usersToFix = [
      { email: 'superadmin@myhealthvault.com', password: 'superadmin123' },
      { email: 'hospitaladmin@generalcityhospital.com', password: 'hospitaladmin123' },
      { email: 'labtech@generalcityhospital.com', password: 'staff123' },
      { email: 'radtech@generalcityhospital.com', password: 'staff123' },
      { email: 'pharmacist@generalcityhospital.com', password: 'staff123' },
    ];

    for (const { email, password } of usersToFix) {
      console.log(`Processing: ${email}`);
      
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        console.log(`❌ User not found: ${email}\n`);
        continue;
      }

      console.log(`   Found user: ${user.firstName} ${user.lastName}`);
      console.log(`   Role: ${user.role}`);

      // Test current password first
      if (user.password) {
        const isCurrentValid = await bcrypt.compare(password, user.password);
        if (isCurrentValid) {
          console.log(`   ✅ Password already correct\n`);
          continue;
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update using findOneAndUpdate to bypass any pre-save hooks
      await User.updateOne(
        { _id: user._id },
        { $set: { password: hashedPassword } }
      );

      console.log(`   ✅ Password reset to: ${password}`);

      // Verify the update worked
      const updatedUser = await User.findById(user._id).select('+password');
      const isValid = await bcrypt.compare(password, updatedUser.password);
      console.log(`   Verification: ${isValid ? '✅ Success' : '❌ Failed'}\n`);
    }

    console.log('✨ All passwords fixed!\n');

    // Print test credentials
    console.log('🔑 Test Credentials:');
    console.log('   Super Admin:');
    console.log('     Email: superadmin@myhealthvault.com');
    console.log('     Password: superadmin123\n');
    console.log('   Hospital Admin:');
    console.log('     Email: hospitaladmin@generalcityhospital.com');
    console.log('     Password: hospitaladmin123\n');
    console.log('   Lab Tech:');
    console.log('     Email: labtech@generalcityhospital.com');
    console.log('     Password: staff123\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixPasswords();