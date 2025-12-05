// backend/src/scripts/test-jwt-flow.js

require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔐 JWT Secret Check\n');

const JWT_SECRET = process.env.JWT_SECRET;

console.log('JWT_SECRET from .env:');
console.log('  First 30 chars:', JWT_SECRET?.substring(0, 30) + '...');
console.log('  Length:', JWT_SECRET?.length);
console.log('  Type:', typeof JWT_SECRET);
console.log('  Exists:', !!JWT_SECRET);
console.log();

// Test signing and verifying
console.log('Testing JWT sign/verify...\n');

try {
  // Sign a token
  const testPayload = { userId: '123456', type: 'access' };
  const token = jwt.sign(testPayload, JWT_SECRET, { expiresIn: '7d' });
  
  console.log('✅ Token signed successfully');
  console.log('  Token:', token.substring(0, 50) + '...');
  console.log();

  // Verify immediately
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log('✅ Token verified successfully');
  console.log('  Decoded:', decoded);
  console.log();

  console.log('✨ JWT sign/verify works correctly!\n');
  console.log('The issue must be elsewhere. Let\'s check the server...');

} catch (error) {
  console.error('❌ JWT Error:', error.message);
  console.log('\nThis means JWT_SECRET is not working correctly.');
}