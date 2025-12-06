// backend/src/scripts/fix-labtech-role.js

require('dotenv').config();
const mongoose = require('mongoose');
const { User, Department, Hospital } = require('../models/index.js');

async function fixLabTech() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the user
    let user = await User.findOne({ email: 'labtech@vaultmyhealth.com' });
    
    if (!user) {
      console.log('❌ Lab tech user not found. Creating new one...\n');
      
      // Get hospital and department
      const hospital = await Hospital.findOne({ approvalStatus: 'approved' });
      if (!hospital) {
        console.error('❌ No approved hospital found.');
        process.exit(1);
      }

      const department = await Department.findOne({ 
        hospitalId: hospital._id,
        type: 'laboratory'
      });
      
      if (!department) {
        console.error('❌ No laboratory department found.');
        process.exit(1);
      }

      // Create new user
      user = await User.create({
        email: 'labtech@vaultmyhealth.com',
        password: 'Staff@2025',
        firstName: 'Lab',
        lastName: 'Technician',
        role: 'department_staff',
        hospitalId: hospital._id,
        departmentId: department._id,
        departmentRole: 'lab_technician',
        isActive: true,
        approvalStatus: 'approved',
      });

      console.log('✅ Created new lab tech user!');
    } else {
      console.log('📝 Updating existing lab tech user...\n');
      
      // Update the role
      user.role = 'department_staff';
      
      // Make sure department and hospital are set
      if (!user.departmentId || !user.hospitalId) {
        const hospital = await Hospital.findOne({ approvalStatus: 'approved' });
        const department = await Department.findOne({ 
          hospitalId: hospital._id,
          type: 'laboratory'
        });
        
        user.hospitalId = hospital._id;
        user.departmentId = department._id;
      }
      
      user.departmentRole = 'lab_technician';
      user.isActive = true;
      user.approvalStatus = 'approved';
      
      await user.save();
      console.log('✅ Updated lab tech user!');
    }

    console.log('\n👤 Lab Tech Details:');
    console.log('=====================================');
    console.log('Email:', user.email);
    console.log('Password: Staff@2025');
    console.log('Name:', user.firstName, user.lastName);
    console.log('Role:', user.role);
    console.log('Department Role:', user.departmentRole);
    console.log('Active:', user.isActive);
    console.log('=====================================\n');

    console.log('🎉 You can now login at http://localhost:3000/login\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixLabTech();