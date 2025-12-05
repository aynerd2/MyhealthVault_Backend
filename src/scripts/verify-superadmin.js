// backend/src/scripts/verify-superadmin.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model.js');
const bcrypt = require('bcryptjs');

async function verifySuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find super admin - IMPORTANT: Add .select('+password')
    const superAdmin = await User.findOne({ role: 'super_admin' }).select('+password');

    if (!superAdmin) {
      console.log('❌ Super Admin not found!\n');
      console.log('Creating Super Admin now...\n');

      // Create super admin
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      const newSuperAdmin = await User.create({
        email: 'superadmin@myhealthvault.com',
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        phone: '+1234567890',
        isActive: true,
        approvalStatus: 'approved',
      });

      console.log('✅ Super Admin created!');
      console.log(`   Email: ${newSuperAdmin.email}`);
      console.log(`   Password: superadmin123\n`);
    } else {
      console.log('✅ Super Admin found!');
      console.log(`   Email: ${superAdmin.email}`);
      console.log(`   Role: ${superAdmin.role}`);
      console.log(`   Status: ${superAdmin.approvalStatus}`);
      console.log(`   Has Password: ${!!superAdmin.password}\n`);

      // Check if password exists
      if (!superAdmin.password) {
        console.log('❌ Password field is missing!\n');
        console.log('Setting password now...\n');
        
        superAdmin.password = await bcrypt.hash('superadmin123', 10);
        await superAdmin.save();
        
        console.log('✅ Password set successfully!\n');
      } else {
        // Test password
        console.log('🔐 Testing password...');
        const isPasswordCorrect = await bcrypt.compare('superadmin123', superAdmin.password);
        
        if (isPasswordCorrect) {
          console.log('✅ Password is correct!\n');
        } else {
          console.log('❌ Password is INCORRECT!\n');
          console.log('Resetting password to: superadmin123\n');
          
          superAdmin.password = await bcrypt.hash('superadmin123', 10);
          await superAdmin.save();
          
          console.log('✅ Password reset successfully!\n');
        }
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}
verifySuperAdmin();