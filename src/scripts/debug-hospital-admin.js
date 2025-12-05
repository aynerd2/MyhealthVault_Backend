// backend/src/scripts/debug-hospital-admin.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model.js');
const Hospital = require('../models/Hospital.js');

async function debugHospitalAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find hospital admin
    const hospitalAdmin = await User.findOne({ 
      email: 'hospitaladmin@generalcityhospital.com' 
    })
      .populate('hospitalId', 'name approvalStatus subscriptionStatus')
      .populate('departmentId', 'name code');

    if (!hospitalAdmin) {
      console.log('❌ Hospital Admin not found!');
      process.exit(1);
    }

    console.log('👤 Hospital Admin User:');
    console.log('   Email:', hospitalAdmin.email);
    console.log('   Role:', hospitalAdmin.role);
    console.log('   Active:', hospitalAdmin.isActive);
    console.log('   Approval Status:', hospitalAdmin.approvalStatus);
    console.log();

    console.log('🏥 Hospital Info:');
    if (hospitalAdmin.hospitalId) {
      console.log('   ID:', hospitalAdmin.hospitalId._id);
      console.log('   Name:', hospitalAdmin.hospitalId.name);
      console.log('   Approval Status:', hospitalAdmin.hospitalId.approvalStatus);
      console.log('   Subscription Status:', hospitalAdmin.hospitalId.subscriptionStatus);
    } else {
      console.log('   ❌ NO HOSPITAL ASSIGNED!');
    }
    console.log();

    // Check what the middleware would see
    console.log('🔍 Middleware Checks:');
    console.log('   Has hospitalId?', !!hospitalAdmin.hospitalId);
    console.log('   Hospital approved?', hospitalAdmin.hospitalId?.approvalStatus === 'approved');
    console.log('   Subscription active?', hospitalAdmin.hospitalId?.subscriptionStatus === 'active');
    console.log();

    if (hospitalAdmin.role !== 'super_admin' && hospitalAdmin.hospitalId) {
      if (hospitalAdmin.hospitalId.approvalStatus !== 'approved') {
        console.log('❌ PROBLEM: Hospital is not approved');
      } else if (hospitalAdmin.hospitalId.subscriptionStatus !== 'active') {
        console.log('❌ PROBLEM: Hospital subscription is not active');
      } else {
        console.log('✅ All checks pass - should work!');
      }
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

debugHospitalAdmin();