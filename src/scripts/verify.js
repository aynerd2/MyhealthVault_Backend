// backend/src/scripts/verify-migration.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User, Hospital, Department } = require('../models/index.js');

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('\n🔍 Verifying Migration...\n');
  
  // Check hospitals
  const hospitals = await Hospital.find({});
  console.log(`✓ Hospitals: ${hospitals.length}`);
  hospitals.forEach(h => console.log(`  - ${h.name} (${h.approvalStatus})`));
  
  // Check departments
  const departments = await Department.find({});
  console.log(`\n✓ Departments: ${departments.length}`);
  for (const dept of departments) {
    const hospital = await Hospital.findById(dept.hospitalId);
    console.log(`  - ${dept.name} at ${hospital.name}`);
  }
  
  // Check users by role
  const roles = ['super_admin', 'hospital_admin', 'doctor', 'nurse', 'department_staff', 'patient'];
  console.log('\n✓ Users by Role:');
  for (const role of roles) {
    const count = await User.countDocuments({ role });
    console.log(`  - ${role}: ${count}`);
  }
  
  // Check users with hospital assignment
  const usersWithHospital = await User.countDocuments({ hospitalId: { $exists: true, $ne: null } });
  const totalUsers = await User.countDocuments({});
  console.log(`\n✓ Users assigned to hospitals: ${usersWithHospital}/${totalUsers}`);
  
  await mongoose.connection.close();
  console.log('\n✅ Verification complete!\n');
}

verify();