// backend/src/scripts/fix-hospital-admin.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model.js');
const Hospital = require('../models/Hospital.js');

async function fixHospitalAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find hospital admin
    const hospitalAdmin = await User.findOne({ 
      email: 'hospitaladmin@generalcityhospital.com' 
    });

    if (!hospitalAdmin) {
      console.log('❌ Hospital Admin not found!');
      process.exit(1);
    }

    console.log('Hospital Admin found:');
    console.log(`   Email: ${hospitalAdmin.email}`);
    console.log(`   Name: ${hospitalAdmin.firstName} ${hospitalAdmin.lastName}`);
    console.log(`   Role: ${hospitalAdmin.role}`);
    console.log(`   Hospital ID: ${hospitalAdmin.hospitalId || 'MISSING ❌'}\n`);

    // Find default hospital
    const hospital = await Hospital.findOne({ 
      registrationNumber: 'GH-DEFAULT-001' 
    });

    if (!hospital) {
      console.log('❌ Default hospital not found!');
      process.exit(1);
    }

    console.log('Hospital found:');
    console.log(`   Name: ${hospital.name}`);
    console.log(`   ID: ${hospital._id}\n`);

    // Check if hospital admin is already set
    if (hospitalAdmin.hospitalId && 
        hospitalAdmin.hospitalId.toString() === hospital._id.toString()) {
      console.log('✅ Hospital Admin already has correct hospitalId\n');
    } else {
      // Update hospital admin
      hospitalAdmin.hospitalId = hospital._id;
      await hospitalAdmin.save();
      console.log('✅ Hospital Admin hospitalId updated\n');
    }

    // Update hospital adminUserId if needed
    if (!hospital.adminUserId || 
        hospital.adminUserId.toString() !== hospitalAdmin._id.toString()) {
      hospital.adminUserId = hospitalAdmin._id;
      await hospital.save();
      console.log('✅ Hospital adminUserId updated\n');
    }

    // Verify the fix
    const updated = await User.findById(hospitalAdmin._id)
      .populate('hospitalId', 'name email');

    console.log('✅ Verification:');
    console.log(`   Hospital Admin ID: ${updated._id}`);
    console.log(`   Hospital ID: ${updated.hospitalId?._id}`);
    console.log(`   Hospital Name: ${updated.hospitalId?.name}\n`);

    await mongoose.connection.close();
    console.log('✨ Done!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixHospitalAdmin();