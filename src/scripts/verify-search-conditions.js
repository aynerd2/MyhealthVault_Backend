// backend/src/scripts/verify-search-conditions.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/index.js');

async function verifySearchConditions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get doctor
    const doctor = await User.findOne({ email: 'dr.smith@healthvault.com' });
    
    console.log('👨‍⚕️ DOCTOR:');
    console.log(`   Hospital ID: ${doctor.hospitalId}\n`);

    // Search patients EXACTLY like the route does
    const searchQuery = {
      role: 'patient',
      hospitalId: { $in: [doctor.hospitalId] },
      $or: [
        { firstName: { $regex: 'john', $options: 'i' } },
        { lastName: { $regex: 'john', $options: 'i' } },
        { email: { $regex: 'john', $options: 'i' } },
      ],
    };

    console.log('🔍 Search Query:');
    console.log(JSON.stringify(searchQuery, null, 2));
    console.log();

    const patients = await User.find(searchQuery).select('firstName lastName email hospitalId');

    console.log(`📊 Results: ${patients.length} patients found\n`);

    patients.forEach((patient, idx) => {
      console.log(`${idx + 1}. ${patient.firstName} ${patient.lastName}`);
      console.log(`   Email: ${patient.email}`);
      console.log(`   Hospital ID: ${patient.hospitalId}`);
      console.log(`   Match: ${patient.hospitalId?.toString() === doctor.hospitalId?.toString() ? '✅' : '❌'}\n`);
    });

    // Also check all patients regardless of hospital
    console.log('📋 ALL PATIENTS (any hospital):');
    const allPatients = await User.find({ role: 'patient' }).select('firstName lastName hospitalId');
    allPatients.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.firstName} ${p.lastName} - Hospital: ${p.hospitalId}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifySearchConditions();