// backend/src/scripts/create-lab-test-order.js

require('dotenv').config();
const mongoose = require('mongoose');
const { TestOrder, User, Department, Hospital } = require('../models/index.js');

async function createLabTestOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get doctor
    const doctor = await User.findOne({ role: 'doctor' });
    if (!doctor) {
      console.error('❌ No doctor found');
      process.exit(1);
    }

    // Get patient
    const patient = await User.findOne({ role: 'patient' });
    if (!patient) {
      console.error('❌ No patient found');
      process.exit(1);
    }

    // Get hospital
    const hospital = await Hospital.findOne();
    if (!hospital) {
      console.error('❌ No hospital found');
      process.exit(1);
    }

    // Get LABORATORY department
    const labDept = await Department.findOne({ 
      type: 'laboratory',
      hospitalId: hospital._id 
    });
    
    if (!labDept) {
      console.error('❌ No laboratory department found');
      process.exit(1);
    }

    console.log('📋 Creating test order:');
    console.log('Department:', labDept.name, `(${labDept.code})`);
    console.log('Patient:', patient.firstName, patient.lastName);
    console.log('Doctor:', doctor.firstName, doctor.lastName);
    console.log('');

    // Create test order
    const testOrder = await TestOrder.create({
      patientId: patient._id,
      orderedBy: doctor._id,
      hospitalId: hospital._id,
      departmentId: labDept._id, // ✅ Laboratory department
      testName: 'Complete Blood Count',
      testType: 'Blood Test',
      testDescription: 'CBC with differential',
      paymentAmount: 50,
      urgency: 'routine',
      paymentRequired: true,
      paymentStatus: 'paid', // ✅ Already paid
      status: 'ready_for_test', // ✅ Ready for upload
      paymentDate: new Date(),
      paymentMethod: 'cash',
      orderedDate: new Date(),
    });

    console.log('✅ Test order created successfully!');
    console.log('=====================================');
    console.log('Order ID:', testOrder._id);
    console.log('Test Type:', testOrder.testType);
    console.log('Department:', labDept.name);
    console.log('Status:', testOrder.status);
    console.log('Payment Status:', testOrder.paymentStatus);
    console.log('=====================================\n');

    console.log('🎉 Lab tech can now upload results for this order!\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createLabTestOrder();