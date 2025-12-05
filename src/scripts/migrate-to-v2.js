// backend/src/scripts/migrate-to-v2.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User.model.js');
const Hospital = require('../models/Hospital.js');
const Department = require('../models/Department.js');
const TestOrder = require('../models/TestOrder.js');
const { MedicalRecord, Prescription } = require('../models/index.js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
};

async function migrate() {
  try {
    // Connect to MongoDB
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    log.success('Connected to MongoDB');

    // ============================================
    // STEP 1: Create Super Admin
    // ============================================
    log.info('\n📋 Step 1: Creating Super Admin...');
    
    let superAdmin = await User.findOne({ role: 'super_admin' });
    
    if (!superAdmin) {
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      
      superAdmin = await User.create({
        email: 'superadmin@myhealthvault.com',
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        phone: '+1234567890',
        isActive: true,
        approvalStatus: 'approved',
      });
      
      log.success(`Super Admin created: ${superAdmin.email}`);
      log.warning('Password: superadmin123 (CHANGE THIS IN PRODUCTION!)');
    } else {
      log.warning('Super Admin already exists');
    }

    // ============================================
    // STEP 2: Create Default Hospital
    // ============================================
    log.info('\n📋 Step 2: Creating Default Hospital...');
    
    let defaultHospital = await Hospital.findOne({ 
      registrationNumber: 'GH-DEFAULT-001' 
    });
    
    if (!defaultHospital) {
      defaultHospital = await Hospital.create({
        name: 'General City Hospital',
        registrationNumber: 'GH-DEFAULT-001',
        email: 'admin@generalcityhospital.com',
        phone: '+1-555-0100',
        address: {
          street: '123 Medical Center Drive',
          city: 'Lagos',
          state: 'Lagos',
          zipCode: '100001',
          country: 'Nigeria',
        },
        subscriptionPlan: 'premium',
        subscriptionStatus: 'active',
        approvalStatus: 'approved',
        approvedBy: superAdmin._id,
        approvedAt: new Date(),
        features: {
          allowCrossHospitalSharing: true,
          allowTelemedicine: true,
          allowOnlinePayments: true,
          allowPatientPortal: true,
        },
        logo: 'https://via.placeholder.com/150',
        website: 'https://generalcityhospital.com',
        description: 'Leading healthcare provider in the city',
        isActive: true,
      });
      
      log.success(`Hospital created: ${defaultHospital.name}`);
    } else {
      log.warning('Default hospital already exists');
    }

    // ============================================
    // STEP 3: Create Second Hospital (for testing cross-hospital)
    // ============================================
    log.info('\n📋 Step 3: Creating Second Hospital...');
    
    let secondHospital = await Hospital.findOne({ 
      registrationNumber: 'MH-DEFAULT-002' 
    });
    
    if (!secondHospital) {
      secondHospital = await Hospital.create({
        name: 'Metropolitan Health Center',
        registrationNumber: 'MH-DEFAULT-002',
        email: 'admin@metrohealthcenter.com',
        phone: '+1-555-0200',
        address: {
          street: '456 Health Avenue',
          city: 'Lagos',
          state: 'Lagos',
          zipCode: '100002',
          country: 'Nigeria',
        },
        subscriptionPlan: 'basic',
        subscriptionStatus: 'active',
        approvalStatus: 'approved',
        approvedBy: superAdmin._id,
        approvedAt: new Date(),
        features: {
          allowCrossHospitalSharing: true,
          allowTelemedicine: false,
          allowOnlinePayments: true,
          allowPatientPortal: true,
        },
        isActive: true,
      });
      
      log.success(`Hospital created: ${secondHospital.name}`);
    } else {
      log.warning('Second hospital already exists');
    }

    // ============================================
    // STEP 4: Create Departments for Hospital 1
    // ============================================
    log.info('\n📋 Step 4: Creating Departments for Hospital 1...');
    
    const departments = [
      {
        name: 'Radiology',
        code: 'RAD',
        type: 'radiology',
        description: 'X-Ray, CT Scan, MRI, and imaging services',
        services: [
          { name: 'X-Ray', price: 5000, duration: 30 },
          { name: 'CT Scan', price: 25000, duration: 60 },
          { name: 'MRI', price: 45000, duration: 90 },
          { name: 'Ultrasound', price: 8000, duration: 45 },
        ],
        departmentEmail: 'radiology@generalcityhospital.com',
        phone: '+1-555-0101',
        location: 'Building A, Ground Floor',
      },
      {
        name: 'Laboratory',
        code: 'LAB',
        type: 'laboratory',
        description: 'Blood tests, urinalysis, and medical testing',
        services: [
          { name: 'Complete Blood Count', price: 3000, duration: 60 },
          { name: 'Lipid Profile', price: 4500, duration: 120 },
          { name: 'Liver Function Test', price: 5000, duration: 120 },
          { name: 'Urinalysis', price: 2000, duration: 30 },
        ],
        departmentEmail: 'laboratory@generalcityhospital.com',
        phone: '+1-555-0102',
        location: 'Building A, 1st Floor',
      },
      {
        name: 'Cardiology',
        code: 'CARD',
        type: 'cardiology',
        description: 'Heart and cardiovascular care',
        services: [
          { name: 'ECG', price: 3500, duration: 30 },
          { name: 'Echocardiogram', price: 15000, duration: 60 },
          { name: 'Stress Test', price: 12000, duration: 90 },
        ],
        departmentEmail: 'cardiology@generalcityhospital.com',
        phone: '+1-555-0103',
        location: 'Building B, 2nd Floor',
      },
      {
        name: 'Pharmacy',
        code: 'PHARM',
        type: 'pharmacy',
        description: 'Prescription medications and pharmaceutical care',
        services: [],
        departmentEmail: 'pharmacy@generalcityhospital.com',
        phone: '+1-555-0104',
        location: 'Building A, Ground Floor',
      },
    ];

    const createdDepartments = {};
    
    for (const deptData of departments) {
      let dept = await Department.findOne({
        hospitalId: defaultHospital._id,
        code: deptData.code,
      });

      if (!dept) {
        // Set default operating hours
        const defaultHours = {
          monday: { open: '08:00', close: '17:00', isOpen: true },
          tuesday: { open: '08:00', close: '17:00', isOpen: true },
          wednesday: { open: '08:00', close: '17:00', isOpen: true },
          thursday: { open: '08:00', close: '17:00', isOpen: true },
          friday: { open: '08:00', close: '17:00', isOpen: true },
          saturday: { open: '09:00', close: '13:00', isOpen: true },
          sunday: { open: '', close: '', isOpen: false },
        };

        dept = await Department.create({
          ...deptData,
          hospitalId: defaultHospital._id,
          operatingHours: defaultHours,
          departmentLoginEnabled: true,
          departmentPassword: 'department123', // Will be hashed by pre-save middleware
          isActive: true,
        });
        
        log.success(`  Created department: ${dept.name} (${dept.code})`);
      } else {
        log.warning(`  Department ${dept.name} already exists`);
      }
      
      createdDepartments[deptData.code] = dept;
    }

    // ============================================
    // STEP 5: Create Departments for Hospital 2
    // ============================================
    log.info('\n📋 Step 5: Creating Departments for Hospital 2...');
    
    const hospital2Departments = [
      {
        name: 'Radiology',
        code: 'RAD',
        type: 'radiology',
        departmentEmail: 'radiology@metrohealthcenter.com',
      },
      {
        name: 'Laboratory',
        code: 'LAB',
        type: 'laboratory',
        departmentEmail: 'laboratory@metrohealthcenter.com',
      },
    ];

    for (const deptData of hospital2Departments) {
      let dept = await Department.findOne({
        hospitalId: secondHospital._id,
        code: deptData.code,
      });

      if (!dept) {
        dept = await Department.create({
          ...deptData,
          hospitalId: secondHospital._id,
          departmentPassword: 'department123',
          isActive: true,
        });
        
        log.success(`  Created department: ${dept.name} for Hospital 2`);
      }
    }

    // ============================================
    // STEP 6: Update Existing Admin to Hospital Admin
    // ============================================
    log.info('\n📋 Step 6: Updating existing admin users...');
    
    const admins = await User.find({ role: 'admin' });
    
    if (admins.length > 0) {
      for (const admin of admins) {
        admin.role = 'hospital_admin';
        admin.hospitalId = defaultHospital._id;
        await admin.save();
        log.success(`  Updated ${admin.email} to hospital_admin`);
      }
      
      // Set first admin as hospital admin user
      if (admins[0] && !defaultHospital.adminUserId) {
        defaultHospital.adminUserId = admins[0]._id;
        await defaultHospital.save();
        log.success(`  Set ${admins[0].email} as hospital admin`);
      }
    } else {
      log.warning('  No existing admin users found');
      
      // Create a hospital admin
      const hashedPassword = await bcrypt.hash('hospitaladmin123', 10);
      const hospitalAdmin = await User.create({
        email: 'hospitaladmin@generalcityhospital.com',
        password: hashedPassword,
        firstName: 'Hospital',
        lastName: 'Administrator',
        role: 'hospital_admin',
        hospitalId: defaultHospital._id,
        phone: '+1-555-0110',
        isActive: true,
        approvalStatus: 'approved',
        approvedBy: superAdmin._id,
      });
      
      defaultHospital.adminUserId = hospitalAdmin._id;
      await defaultHospital.save();
      
      log.success(`  Created hospital admin: ${hospitalAdmin.email}`);
      log.warning('  Password: hospitaladmin123');
    }

    // ============================================
    // STEP 7: Update Existing Doctors and Nurses
    // ============================================
    log.info('\n📋 Step 7: Updating doctors and nurses...');
    
    const doctors = await User.find({ role: 'doctor' });
    const nurses = await User.find({ role: 'nurse' });
    
    // Assign doctors to departments
    let doctorIndex = 0;
    const deptKeys = Object.keys(createdDepartments);
    
    for (const doctor of doctors) {
      if (!doctor.hospitalId) {
        doctor.hospitalId = defaultHospital._id;
        // Rotate through departments
        doctor.departmentId = createdDepartments[deptKeys[doctorIndex % deptKeys.length]]._id;
        await doctor.save();
        log.success(`  Updated doctor: ${doctor.email}`);
        doctorIndex++;
      }
    }
    
    // Assign nurses to departments
    let nurseIndex = 0;
    for (const nurse of nurses) {
      if (!nurse.hospitalId) {
        nurse.hospitalId = defaultHospital._id;
        nurse.departmentId = createdDepartments[deptKeys[nurseIndex % deptKeys.length]]._id;
        await nurse.save();
        log.success(`  Updated nurse: ${nurse.email}`);
        nurseIndex++;
      }
    }

    // ============================================
    // STEP 8: Update Existing Patients
    // ============================================
    log.info('\n📋 Step 8: Updating patients...');
    
    const patients = await User.find({ role: 'patient' });
    
    for (const patient of patients) {
      if (!patient.hospitalId) {
        // Assign patients to either hospital (for cross-hospital testing)
        patient.hospitalId = patients.indexOf(patient) % 2 === 0 
          ? defaultHospital._id 
          : secondHospital._id;
        await patient.save();
        log.success(`  Updated patient: ${patient.email}`);
      }
    }

    // ============================================
    // STEP 9: Create Department Staff Users
    // ============================================
    log.info('\n📋 Step 9: Creating department staff...');
    
    const staffMembers = [
      {
        email: 'radtech@generalcityhospital.com',
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'department_staff',
        departmentRole: 'radiologist',
        departmentId: createdDepartments['RAD']._id,
        specialization: 'Diagnostic Radiology',
      },
      {
        email: 'labtech@generalcityhospital.com',
        firstName: 'Michael',
        lastName: 'Chen',
        role: 'department_staff',
        departmentRole: 'lab_technician',
        departmentId: createdDepartments['LAB']._id,
        specialization: 'Clinical Laboratory Science',
      },
      {
        email: 'pharmacist@generalcityhospital.com',
        firstName: 'Emily',
        lastName: 'Rodriguez',
        role: 'department_staff',
        departmentRole: 'pharmacist',
        departmentId: createdDepartments['PHARM']._id,
        specialization: 'Clinical Pharmacy',
      },
    ];

    for (const staffData of staffMembers) {
      let staff = await User.findOne({ email: staffData.email });
      
      if (!staff) {
        const hashedPassword = await bcrypt.hash('staff123', 10);
        
        staff = await User.create({
          ...staffData,
          password: hashedPassword,
          hospitalId: defaultHospital._id,
          phone: '+1-555-0' + (120 + staffMembers.indexOf(staffData)),
          isActive: true,
          approvalStatus: 'approved',
          approvedBy: defaultHospital.adminUserId,
        });
        
        log.success(`  Created staff: ${staff.email} (${staff.departmentRole})`);
      } else {
        log.warning(`  Staff ${staff.email} already exists`);
      }
    }

    // ============================================
    // STEP 10: Update Medical Records
    // ============================================
    log.info('\n📋 Step 10: Updating medical records...');
    
    const medicalRecords = await MedicalRecord.find({});
    
    for (const record of medicalRecords) {
      if (!record.hospitalId) {
        const doctor = await User.findById(record.doctorId);
        record.hospitalId = doctor?.hospitalId || defaultHospital._id;
        record.departmentId = doctor?.departmentId;
        await record.save();
      }
    }
    
    log.success(`  Updated ${medicalRecords.length} medical records`);

    // ============================================
    // STEP 11: Update Prescriptions
    // ============================================
    log.info('\n📋 Step 11: Updating prescriptions...');
    
    const prescriptions = await Prescription.find({});
    
    for (const prescription of prescriptions) {
      if (!prescription.hospitalId) {
        const doctor = await User.findById(prescription.doctorId);
        prescription.hospitalId = doctor?.hospitalId || defaultHospital._id;
        await prescription.save();
      }
    }
    
    log.success(`  Updated ${prescriptions.length} prescriptions`);

    // ============================================
    // STEP 12: Update Hospital Stats
    // ============================================
    log.info('\n📋 Step 12: Updating hospital statistics...');
    
    for (const hospital of [defaultHospital, secondHospital]) {
      const stats = await calculateHospitalStats(hospital._id);
      hospital.stats = stats;
      await hospital.save();
      
      log.success(`  Updated stats for ${hospital.name}:`);
      log.info(`    - Doctors: ${stats.totalDoctors}`);
      log.info(`    - Nurses: ${stats.totalNurses}`);
      log.info(`    - Patients: ${stats.totalPatients}`);
      log.info(`    - Departments: ${stats.totalDepartments}`);
    }

    // ============================================
    // SUMMARY
    // ============================================
    log.info('\n' + '='.repeat(50));
    log.success('✨ Migration Completed Successfully! ✨');
    log.info('='.repeat(50));
    
    log.info('\n📊 Summary:');
    log.info(`  - Hospitals created: 2`);
    log.info(`  - Departments created: ${Object.keys(createdDepartments).length} (Hospital 1) + 2 (Hospital 2)`);
    log.info(`  - Users updated: ${doctors.length + nurses.length + patients.length}`);
    log.info(`  - Department staff created: ${staffMembers.length}`);
    
    log.info('\n🔑 Login Credentials:');
    log.info('  Super Admin:');
    log.info(`    Email: superadmin@myhealthvault.com`);
    log.info(`    Password: superadmin123`);
    log.info('  Hospital Admin (Hospital 1):');
    log.info(`    Email: hospitaladmin@generalcityhospital.com`);
    log.info(`    Password: hospitaladmin123`);
    log.info('  Department Staff:');
    log.info(`    Email: radtech@generalcityhospital.com (Radiologist)`);
    log.info(`    Email: labtech@generalcityhospital.com (Lab Tech)`);
    log.info(`    Email: pharmacist@generalcityhospital.com (Pharmacist)`);
    log.info(`    Password (all): staff123`);
    log.info('  Department Login:');
    log.info(`    Email: radiology@generalcityhospital.com`);
    log.info(`    Email: laboratory@generalcityhospital.com`);
    log.info(`    Password (all): department123`);
    
    log.warning('\n⚠️  IMPORTANT: Change all default passwords in production!');

  } catch (error) {
    log.error(`\n❌ Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    log.info('\n👋 Database connection closed');
    process.exit(0);
  }
}

// Helper function to calculate hospital stats
async function calculateHospitalStats(hospitalId) {
  const [doctors, nurses, patients, departments] = await Promise.all([
    User.countDocuments({ hospitalId, role: 'doctor', isActive: true }),
    User.countDocuments({ hospitalId, role: 'nurse', isActive: true }),
    User.countDocuments({ hospitalId, role: 'patient', isActive: true }),
    Department.countDocuments({ hospitalId, isActive: true }),
  ]);

  return {
    totalDoctors: doctors,
    totalNurses: nurses,
    totalPatients: patients,
    totalDepartments: departments,
  };
}

// Run migration
migrate();