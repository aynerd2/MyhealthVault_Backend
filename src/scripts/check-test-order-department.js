// backend/src/scripts/check-test-order-department.js

require('dotenv').config();
const mongoose = require('mongoose');
const { TestOrder, User, Department } = require('../models/index.js');

async function checkDepartments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get lab tech
    const labTech = await User.findOne({ email: 'labtech@generalcityhospital.com' })
      .populate('departmentId');
    
    console.log('👤 Lab Tech:');
    console.log('=====================================');
    console.log('Name:', labTech.firstName, labTech.lastName);
    console.log('Department ID:', labTech.departmentId._id);
    console.log('Department Name:', labTech.departmentId.name);
    console.log('Department Code:', labTech.departmentId.code);
    console.log('=====================================\n');

    // Get test orders that are ready for test
    const testOrders = await TestOrder.find({
      status: 'ready_for_test',
      paymentStatus: 'paid'
    })
    .populate('departmentId')
    .populate('patientId', 'firstName lastName');

    console.log(`📋 Found ${testOrders.length} test orders ready for upload:\n`);

    testOrders.forEach((order, index) => {
      const matchesDept = order.departmentId._id.toString() === labTech.departmentId._id.toString();
      
      console.log(`${index + 1}. Order ID: ${order._id}`);
      console.log(`   Patient: ${order.patientId.firstName} ${order.patientId.lastName}`);
      console.log(`   Test Type: ${order.testType}`);
      console.log(`   Department ID: ${order.departmentId._id}`);
      console.log(`   Department Name: ${order.departmentId.name}`);
      console.log(`   Matches Lab Tech Dept: ${matchesDept ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });

    // List all departments
    const allDepts = await Department.find();
    console.log('\n🏢 All Departments:');
    console.log('=====================================');
    allDepts.forEach(dept => {
      console.log(`${dept.name} (${dept.code}) - ID: ${dept._id}`);
    });
    console.log('=====================================\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDepartments();