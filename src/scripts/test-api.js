// backend/src/scripts/test-api.js - COMPLETE REPLACEMENT

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:8000/api';

const credentials = {
  superAdmin: {
    email: 'superadmin@myhealthvault.com',
    password: 'superadmin123',
  },
  hospitalAdmin: {
    email: 'hospitaladmin@generalcityhospital.com',
    password: 'hospitaladmin123',
  },
  doctor: {
    email: 'dr.smith@healthvault.com',
    password: 'password123',
  },
  labTech: {
    email: 'labtech@generalcityhospital.com',
    password: 'staff123',
  },
  patient: {
    email: 'john.doe@example.com',
    password: 'password123',
  },
};

async function test() {
  console.log('🧪 Testing API Endpoints...');
  console.log(`API URL: ${API_URL}\n`);

  try {
    // Test 0: Health Check
    console.log('0️⃣ Testing Health Endpoint...');
    try {
      const healthRes = await axios.get(`${API_URL}/health`);
      console.log('✅ Server is running');
      console.log(`   Status: ${healthRes.data.status}`);
      console.log(`   Environment: ${healthRes.data.environment}\n`);
    } catch (error) {
      console.error('❌ Server not responding');
      console.error(`   Error: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.log('\n💡 Make sure to run: npm run dev\n');
      }
      process.exit(1);
    }

    // Test 1: Super Admin Login
    console.log('1️⃣ Testing Super Admin Login...');
    try {
      const superAdminRes = await axios.post(`${API_URL}/auth/login`, credentials.superAdmin);
      console.log('✅ Super Admin logged in');
      console.log(`   User: ${superAdminRes.data.user.email}`);
      console.log(`   Role: ${superAdminRes.data.user.role}\n`);
      var superAdminToken = superAdminRes.data.accessToken;
    } catch (error) {
      console.error('❌ Super Admin login failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Error: ${error.response?.data?.error || error.message}`);
      console.error(`   Message: ${error.response?.data?.message || error.message}`);
      console.log('\n💡 Run: node src/scripts/verify-superadmin.js\n');
    }

    // Test 2: Hospital Admin Login
    console.log('2️⃣ Testing Hospital Admin Login...');
    try {
      const hospitalAdminRes = await axios.post(`${API_URL}/auth/login`, credentials.hospitalAdmin);
      console.log('✅ Hospital Admin logged in');
      console.log(`   User: ${hospitalAdminRes.data.user.email}`);
      console.log(`   Hospital: ${hospitalAdminRes.data.user.hospitalId?.name || 'N/A'}\n`);
      var hospitalAdminToken = hospitalAdminRes.data.accessToken;
    } catch (error) {
      console.error('❌ Hospital Admin login failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
    }

    // Test 3: Get My Hospital
    if (hospitalAdminToken) {
      console.log('3️⃣ Testing Get My Hospital...');
      try {
        const hospitalRes = await axios.get(`${API_URL}/hospitals/my-hospital`, {
          headers: { Authorization: `Bearer ${hospitalAdminToken}` },
        });
        console.log('✅ Hospital fetched');
        console.log(`   Name: ${hospitalRes.data.data.name}`);
        console.log(`   Status: ${hospitalRes.data.data.approvalStatus}`);
        console.log(`   Subscription: ${hospitalRes.data.data.subscriptionStatus}\n`);
      } catch (error) {
        console.error('❌ Get hospital failed');
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
      }
    }

    // Test 4: Get Departments
    if (hospitalAdminToken) {
      console.log('4️⃣ Testing Get Departments...');
      try {
        const deptsRes = await axios.get(`${API_URL}/departments`, {
          headers: { Authorization: `Bearer ${hospitalAdminToken}` },
        });
        console.log(`✅ Found ${deptsRes.data.count} departments`);
        deptsRes.data.data.forEach((dept) => {
          console.log(`   - ${dept.name} (${dept.code})`);
        });
        console.log();
      } catch (error) {
        console.error('❌ Get departments failed');
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
      }
    }

    // Test 5: Doctor Login
    console.log('5️⃣ Testing Doctor Login...');
    try {
      const doctorRes = await axios.post(`${API_URL}/auth/login`, credentials.doctor);
      console.log('✅ Doctor logged in');
      console.log(`   User: ${doctorRes.data.user.email}`);
      console.log(`   Specialization: ${doctorRes.data.user.specialization || 'N/A'}\n`);
      var doctorToken = doctorRes.data.accessToken;
    } catch (error) {
      console.error('❌ Doctor login failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
    }

    // Test 6: Patient Login
    console.log('6️⃣ Testing Patient Login...');
    try {
      const patientRes = await axios.post(`${API_URL}/auth/login`, credentials.patient);
      console.log('✅ Patient logged in');
      console.log(`   User: ${patientRes.data.user.email}`);
      console.log(`   Name: ${patientRes.data.user.firstName} ${patientRes.data.user.lastName}\n`);
      var patientToken = patientRes.data.accessToken;
    } catch (error) {
      console.error('❌ Patient login failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
    }

    // Test 7: Lab Tech Login
    console.log('7️⃣ Testing Lab Tech Login...');
    try {
      const labTechRes = await axios.post(`${API_URL}/auth/login`, credentials.labTech);
      console.log('✅ Lab Tech logged in');
      console.log(`   User: ${labTechRes.data.user.email}`);
      console.log(`   Department Role: ${labTechRes.data.user.departmentRole || 'N/A'}\n`);
      var labTechToken = labTechRes.data.accessToken;
    } catch (error) {
      console.error('❌ Lab Tech login failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
    }

    // Test 8: Get Hospital Stats
    if (hospitalAdminToken) {
      console.log('8️⃣ Testing Get Hospital Stats...');
      try {
        const statsRes = await axios.get(`${API_URL}/hospitals/my-hospital/stats`, {
          headers: { Authorization: `Bearer ${hospitalAdminToken}` },
        });
        console.log('✅ Stats fetched');
        console.log(`   Doctors: ${statsRes.data.data.totalDoctors}`);
        console.log(`   Nurses: ${statsRes.data.data.totalNurses}`);
        console.log(`   Patients: ${statsRes.data.data.totalPatients}`);
        console.log(`   Departments: ${statsRes.data.data.totalDepartments}\n`);
      } catch (error) {
        console.error('❌ Get stats failed');
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Message: ${error.response?.data?.message || error.message}\n`);
      }
    }

    console.log('✨ All tests completed! ✨\n');

    // Summary
    console.log('📊 Summary:');
    console.log(`   ${superAdminToken ? '✅' : '❌'} Super Admin`);
    console.log(`   ${hospitalAdminToken ? '✅' : '❌'} Hospital Admin`);
    console.log(`   ${doctorToken ? '✅' : '❌'} Doctor`);
    console.log(`   ${patientToken ? '✅' : '❌'} Patient`);
    console.log(`   ${labTechToken ? '✅' : '❌'} Lab Tech\n`);

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

test();