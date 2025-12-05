// backend/src/scripts/debug-hospital-ids.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models');

async function debugHospitalIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get doctor
    const doctor = await User.findOne({ email: 'dr.smith@healthvault.com' })
      .populate('hospitalId', 'name');
    
    console.log('👨‍⚕️ DOCTOR:');
    console.log(`   Name: ${doctor.firstName} ${doctor.lastName}`);
    console.log(`   Email: ${doctor.email}`);
    console.log(`   Hospital ID: ${doctor.hospitalId?._id || 'NONE'}`);
    console.log(`   Hospital Name: ${doctor.hospitalId?.name || 'NONE'}`);
    console.log();

    // Get patients
    const patients = await User.find({ role: 'patient' })
      .populate('hospitalId', 'name');

    console.log(`👥 PATIENTS (${patients.length} total):`);
    patients.forEach((patient, idx) => {
      console.log(`\n${idx + 1}. ${patient.firstName} ${patient.lastName}`);
      console.log(`   Email: ${patient.email}`);
      console.log(`   Hospital ID: ${patient.hospitalId?._id || 'NONE'}`);
      console.log(`   Hospital Name: ${patient.hospitalId?.name || 'NONE'}`);
      
      if (doctor.hospitalId?._id && patient.hospitalId?._id) {
        const match = doctor.hospitalId._id.toString() === patient.hospitalId._id.toString();
        console.log(`   MATCH WITH DOCTOR: ${match ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log(`   MATCH WITH DOCTOR: ❌ Missing Hospital ID`);
      }
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugHospitalIds();