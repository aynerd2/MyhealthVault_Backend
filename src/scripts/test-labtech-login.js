// backend/src/scripts/test-labtech-login.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/index.js');
const jwt = require('jsonwebtoken');

async function testLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const user = await User.findOne({ email: 'labtech@generalcityhospital.com' })
      .select('+password');
    
    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log('👤 User from Database:');
    console.log('=====================================');
    console.log('Email:', user.email);
    console.log('Name:', user.firstName, user.lastName);
    console.log('Role:', user.role);
    console.log('Department Role:', user.departmentRole);
    console.log('Active:', user.isActive);
    console.log('Approval Status:', user.approvalStatus);
    console.log('=====================================\n');

    // Test password
    const testPassword = 'password123';
    const isMatch = await user.comparePassword(testPassword);
    console.log(`🔑 Password "${testPassword}" matches:`, isMatch);

    if (isMatch) {
      // Generate token to see what would be in JWT
      const tokenPayload = {
        _id: user._id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        departmentId: user.departmentId,
      };

      console.log('\n📝 JWT Payload would contain:');
      console.log(JSON.stringify(tokenPayload, null, 2));

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
      console.log('\n🎫 Sample Token Generated:');
      console.log(token);
      console.log('\nDecode this at https://jwt.io to verify\n');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLogin();