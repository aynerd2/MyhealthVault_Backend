// backend/src/scripts/create-test-users.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model.js');
const Hospital = require('../models/Hospital.js');
const Department = require('../models/Department.js');

async function createTestUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get default hospital
    const hospital = await Hospital.findOne({ registrationNumber: 'GH-DEFAULT-001' });
    if (!hospital) {
      console.error('❌ Hospital not found!');
      process.exit(1);
    }

    // Get departments
    const cardiology = await Department.findOne({ hospitalId: hospital._id, code: 'CARD' });
    const radiology = await Department.findOne({ hospitalId: hospital._id, code: 'RAD' });

    const testUsers = [
      // Doctor
      {
        email: 'dr.smith@healthvault.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Smith',
        role: 'doctor',
        hospitalId: hospital._id,
        departmentId: cardiology._id,
        specialization: 'Cardiology',
        licenseNumber: 'MD12345',
        phone: '+1-555-0150',
        // Remove gender for doctor - not required
      },
      // Nurse
      {
        email: 'nurse.williams@healthvault.com',
        password: 'password123',
        firstName: 'Sarah',
        lastName: 'Williams',
        role: 'nurse',
        hospitalId: hospital._id,
        departmentId: radiology._id,
        specialization: 'Emergency Care',
        licenseNumber: 'RN67890',
        phone: '+1-555-0151',
      },
      // Patient 1
      {
        email: 'john.doe@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        role: 'patient',
        hospitalId: hospital._id,
        phone: '+1-555-0200',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'Male', // ✅ Capitalized
        bloodType: 'O+',
      },
      // Patient 2
      {
        email: 'jane.smith@example.com',
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'patient',
        hospitalId: hospital._id,
        phone: '+1-555-0201',
        dateOfBirth: new Date('1985-08-22'),
        gender: 'Female', // ✅ Capitalized
        bloodType: 'A+',
      },
      // Patient 3
      {
        email: 'bob.johnson@example.com',
        password: 'password123',
        firstName: 'Bob',
        lastName: 'Johnson',
        role: 'patient',
        hospitalId: hospital._id,
        phone: '+1-555-0202',
        dateOfBirth: new Date('1995-12-10'),
        gender: 'Male', // ✅ Capitalized
        bloodType: 'B+',
      },
    ];

    for (const userData of testUsers) {
      // Check if user already exists
      const existing = await User.findOne({ email: userData.email });
      if (existing) {
        console.log(`⚠️  User already exists: ${userData.email}`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = await User.create({
        ...userData,
        password: hashedPassword,
        isActive: true,
        approvalStatus: 'approved',
      });

      console.log(`✅ Created: ${user.email} (${user.role})`);
    }

    console.log('\n✨ Test users created!\n');

    console.log('🔑 Login Credentials:');
    console.log('   Doctor: dr.smith@healthvault.com / password123');
    console.log('   Nurse: nurse.williams@healthvault.com / password123');
    console.log('   Patient 1: john.doe@example.com / password123');
    console.log('   Patient 2: jane.smith@example.com / password123');
    console.log('   Patient 3: bob.johnson@example.com / password123\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createTestUsers();