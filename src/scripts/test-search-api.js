// backend/src/scripts/test-search-api.js

require('dotenv').config();
const axios = require('axios');

async function testSearchAPI() {
  try {
    // 1. Login as doctor
    console.log('1️⃣ Logging in as doctor...\n');
    
    const loginResponse = await axios.post('http://localhost:8000/api/auth/login', {
      email: 'dr.smith@healthvault.com',
      password: 'password123',
    });

    const { accessToken } = loginResponse.data;
    console.log('✅ Login successful\n');

    // 2. Search for patients
    console.log('2️⃣ Searching for "john"...\n');

    try {
      const searchResponse = await axios.get('http://localhost:8000/api/patients/search?q=john', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('✅ Search successful');
      console.log(`   Found ${searchResponse.data.count} patients:\n`);

      searchResponse.data.data.forEach((patient, idx) => {
        console.log(`${idx + 1}. ${patient.firstName} ${patient.lastName}`);
        console.log(`   Email: ${patient.email}\n`);
      });
    } catch (error) {
      console.error('❌ Search failed:');
      console.error('   Status:', error.response?.status);
      console.error('   Error:', error.response?.data);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSearchAPI();