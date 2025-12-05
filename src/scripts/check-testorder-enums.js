// backend/src/scripts/check-testorder-enums.js

require('dotenv').config();
const mongoose = require('mongoose');
const { TestOrder } = require('../models/index.js');

async function checkEnums() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('TestOrder Enum Values:\n');
    
    const schema = TestOrder.schema.obj;
    
    // Check status enum
    if (schema.status && schema.status.enum) {
      console.log('Status enum values:');
      schema.status.enum.forEach(val => console.log(`  - ${val}`));
    }
    
    console.log('\n');
    
    // Check paymentStatus enum
    if (schema.paymentStatus && schema.paymentStatus.enum) {
      console.log('PaymentStatus enum values:');
      schema.paymentStatus.enum.forEach(val => console.log(`  - ${val}`));
    }
    
    console.log('\n');
    
    // Check urgency enum
    if (schema.urgency && schema.urgency.enum) {
      console.log('Urgency enum values:');
      schema.urgency.enum.forEach(val => console.log(`  - ${val}`));
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEnums();