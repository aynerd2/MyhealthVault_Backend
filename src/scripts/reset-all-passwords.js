// backend/src/scripts/reset-all-passwords.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function resetAllPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const passwordResets = [
      { email: 'superadmin@myhealthvault.com', password: 'superadmin123' },
      { email: 'hospitaladmin@generalcityhospital.com', password: 'hospitaladmin123' },
      { email: 'dr.smith@healthvault.com', password: 'password123' },
      { email: 'nurse.williams@healthvault.com', password: 'password123' },
      { email: 'john.doe@example.com', password: 'password123' },
      { email: 'jane.smith@example.com', password: 'password123' },
      { email: 'bob.johnson@example.com', password: 'password123' },
      { email: 'radtech@generalcityhospital.com', password: 'staff123' },
      { email: 'labtech@generalcityhospital.com', password: 'staff123' },
      { email: 'pharmacist@generalcityhospital.com', password: 'staff123' },
    ];

    console.log('🔐 Resetting passwords...\n');

    for (const { email, password } of passwordResets) {
      // Hash password directly
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update directly in database (bypassing mongoose middleware)
      const result = await usersCollection.updateOne(
        { email },
        { $set: { password: hashedPassword } }
      );

      if (result.matchedCount > 0) {
        console.log(`✅ Reset: ${email} → ${password}`);
      } else {
        console.log(`⚠️  Not found: ${email}`);
      }
    }

    console.log('\n✨ All passwords reset!\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetAllPasswords();