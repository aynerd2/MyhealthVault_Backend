// backend/src/scripts/check-testorder-model.js

require('dotenv').config();
const mongoose = require('mongoose');
const { TestOrder } = require('../models/index.js');

async function checkModel() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('TestOrder Schema Fields:\n');
    const schema = TestOrder.schema.obj;
    
    Object.keys(schema).forEach(field => {
      console.log(`- ${field}: ${schema[field].type?.name || schema[field].type || 'Mixed'}`);
      if (schema[field].required) console.log(`  (required)`);
    });
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkModel();