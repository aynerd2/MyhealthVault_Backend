// backend/src/scripts/debug-token.js

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_URL = 'http://localhost:8000/api';

async function debugToken() {
  try {
    console.log('🔍 Debugging JWT Token...\n');

    // Login as hospital admin
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'hospitaladmin@generalcityhospital.com',
      password: 'hospitaladmin123',
    });

    console.log('✅ Login successful\n');

    const { user, accessToken } = loginRes.data;

    console.log('👤 User object:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Hospital ID: ${user.hospitalId?._id || user.hospitalId || 'MISSING ❌'}`);
    console.log(`   Hospital Name: ${user.hospitalId?.name || 'N/A'}\n`);

    console.log('🔐 Access Token:');
    console.log(`   ${accessToken.substring(0, 50)}...\n`);

    // Decode token (without verification)
    const decoded = jwt.decode(accessToken);
    console.log('📦 Decoded Token Payload:');
    console.log(JSON.stringify(decoded, null, 2));
    console.log();

    // Try to use the token
    console.log('🧪 Testing token with /hospitals/my-hospital...');
    try {
      const hospitalRes = await axios.get(`${API_URL}/hospitals/my-hospital`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log('✅ Request successful!');
      console.log(`   Hospital: ${hospitalRes.data.data.name}\n`);
    } catch (error) {
      console.error('❌ Request failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.message}\n`);

      if (error.response?.status === 401) {
        console.log('💡 Token is being rejected by the server');
        console.log('   This might be because:');
        console.log('   1. Token signature is invalid');
        console.log('   2. JWT_SECRET in .env doesn\'t match');
        console.log('   3. Auth middleware is rejecting the token\n');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

debugToken();