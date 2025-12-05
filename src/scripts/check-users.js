// backend/src/scripts/check-users.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model.js');

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all users
    const users = await User.find({}).select('email role hospitalId approvalStatus');
    
    console.log(`📊 Total users in database: ${users.length}\n`);
    
    if (users.length === 0) {
      console.log('⚠️  No users found! Migration may not have run.\n');
      console.log('Run: npm run migrate');
    } else {
      console.log('Users in database:');
      users.forEach((user, i) => {
        console.log(`${i + 1}. ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.approvalStatus}`);
        console.log(`   Hospital: ${user.hospitalId || 'None'}\n`);
      });
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkUsers();