// backend/src/scripts/test-health.js

const axios = require('axios');

const API_URL = 'http://localhost:8000/api';

async function testHealth() {
  console.log('🏥 Testing Health Endpoint...\n');
  
  try {
    const response = await axios.get(`${API_URL}/health`);
    console.log('✅ Server is running!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Server is not responding');
    console.error('Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Tips:');
      console.log('1. Make sure the server is running: npm run dev');
      console.log('2. Check if port 8000 is available');
      console.log('3. Verify your .env file has correct settings');
    }
  }
}

testHealth();