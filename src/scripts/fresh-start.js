// backend/src/scripts/fresh-start.js

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function freshStart() {
  console.log('🔄 FRESH START SCRIPT\n');
  console.log('This will:');
  console.log('  1. Drop the entire database');
  console.log('  2. Generate new JWT secrets');
  console.log('  3. Update .env file');
  console.log('  4. Run migration');
  console.log('  5. Create test users\n');

  rl.question('⚠️  Continue? This will DELETE ALL DATA! (yes/no): ', async (answer) => {
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Aborted');
      rl.close();
      process.exit(0);
    }

    try {
      // Step 1: Drop database
      console.log('\n1️⃣ Dropping database...');
      await mongoose.connect(process.env.MONGODB_URI);
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      console.log('✅ Database dropped\n');

      // Step 2: Generate new JWT secrets
      console.log('2️⃣ Generating new JWT secrets...');
      const jwtSecret = crypto.randomBytes(64).toString('hex');
      const jwtRefreshSecret = crypto.randomBytes(64).toString('hex');
      console.log('✅ Secrets generated\n');

      // Step 3: Update .env file
      console.log('3️⃣ Updating .env file...');
      const envPath = path.join(__dirname, '../../.env');
      let envContent = '';

      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        
        // Replace or add JWT secrets
        if (envContent.includes('JWT_SECRET=')) {
          envContent = envContent.replace(/JWT_SECRET=.*/g, `JWT_SECRET=${jwtSecret}`);
        } else {
          envContent += `\nJWT_SECRET=${jwtSecret}`;
        }

        if (envContent.includes('JWT_REFRESH_SECRET=')) {
          envContent = envContent.replace(/JWT_REFRESH_SECRET=.*/g, `JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
        } else {
          envContent += `\nJWT_REFRESH_SECRET=${jwtRefreshSecret}`;
        }
      } else {
        // Create new .env file
        envContent = `# Database
MONGODB_URI=mongodb://localhost:27017/healthvault

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Server
NODE_ENV=development
PORT=8000
HOST=0.0.0.0

# Frontend URL
FRONTEND_URL=http://localhost:3000
`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log('✅ .env file updated\n');

      // Step 4: Run migration
      console.log('4️⃣ Running migration...');
      console.log('   (This will take a moment...)\n');
      
      try {
        execSync('node src/scripts/migrate-to-v2.js', { 
          stdio: 'inherit',
          cwd: path.join(__dirname, '../..'),
        });
      } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
      }

      console.log('\n✨ FRESH START COMPLETE! ✨\n');
      console.log('📋 Next steps:');
      console.log('   1. Restart your server: npm run dev');
      console.log('   2. Test: node src/scripts/test-api.js\n');
      console.log('🔑 Test Credentials:');
      console.log('   Super Admin:');
      console.log('     Email: superadmin@myhealthvault.com');
      console.log('     Password: superadmin123\n');
      console.log('   Hospital Admin:');
      console.log('     Email: hospitaladmin@generalcityhospital.com');
      console.log('     Password: hospitaladmin123\n');
      console.log('   Doctor:');
      console.log('     Email: dr.smith@healthvault.com');
      console.log('     Password: password123\n');

      rl.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error(error);
      rl.close();
      process.exit(1);
    }
  });
}

freshStart();