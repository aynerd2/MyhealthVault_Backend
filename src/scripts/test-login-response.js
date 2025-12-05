// backend/src/scripts/test-login-response.js

const axios = require('axios');
const API_URL = 'http://localhost:8000/api';

async function testLoginResponse() {
  try {
    console.log('🔐 Testing Hospital Admin Login...\n');

    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'hospitaladmin@generalcityhospital.com',
      password: 'hospitaladmin123',
    });

    console.log('✅ Login successful\n');

    const { user, accessToken } = response.data;

    console.log('👤 User object returned:');
    console.log(JSON.stringify(user, null, 2));
    console.log();

    console.log('🔍 Key checks:');
    console.log('  Has hospitalId?', !!user.hospitalId);
    console.log('  hospitalId type:', typeof user.hospitalId);
    console.log('  hospitalId value:', user.hospitalId);
    console.log();

    if (user.hospitalId && typeof user.hospitalId === 'object') {
      console.log('✅ Hospital is populated');
      console.log('  Hospital name:', user.hospitalId.name);
      console.log('  Approval status:', user.hospitalId.approvalStatus);
      console.log('  Subscription status:', user.hospitalId.subscriptionStatus);
    } else if (user.hospitalId) {
      console.log('⚠️  Hospital ID is just a string, not populated');
      console.log('  This is fine, but middleware needs to handle it');
    } else {
      console.log('❌ No hospitalId at all!');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testLoginResponse();