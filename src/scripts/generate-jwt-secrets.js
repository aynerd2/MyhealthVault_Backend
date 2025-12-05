// backend/src/scripts/generate-jwt-secrets.js

const crypto = require('crypto');

console.log('🔐 Generating JWT Secrets...\n');

const jwtSecret = crypto.randomBytes(64).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(64).toString('hex');

console.log('Add these to your .env file:\n');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
console.log();

// JWT_SECRET=ogunladeayobamiolawale
// JWT_REFRESH_SECRET=ogunladeayobamiolawalerf