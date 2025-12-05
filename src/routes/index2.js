const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const { 
  authenticate, 
  requireRole,
  requireHealthcareWorker,
  requirePatient,
  canAccessPatient,
  canModifyPatientData,
} = require('../middleware/auth.js');
const { logAudit, auditRead } = require('../middleware/audit.js');
const { User, MedicalRecord, Prescription, TestResult, AuditLog } = require('../models/index.js');
const S3Service = require('../services/s3.service.js');

const router = express.Router();

// ==================== FILE UPLOAD CONFIGURATION ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (S3Service.isValidFileType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images allowed.'));
    }
  },
});

// ==================== VALIDATION HELPER ====================
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
}

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ==================== USER/PROFILE ROUTES ====================

/**
 * REGISTER/CREATE USER
 * POST /api/users/register
 * Public endpoint - creates initial user account
 */
router.post('/users/register',
  authenticate,
  [
    body('email').isEmail().normalizeEmail(),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('role').isIn(['patient', 'doctor', 'nurse']),
    
    // Patient-specific validations
    body('dateOfBirth').if(body('role').equals('patient')).isISO8601().toDate(),
    body('gender').if(body('role').equals('patient')).isIn(['Male', 'Female', 'Other']),
    
    // Healthcare worker validations
    body('licenseNumber').if(body('role').isIn(['doctor', 'nurse'])).notEmpty(),
    body('specialization').if(body('role').equals('doctor')).notEmpty(),
    body('hospitalAffiliation').if(body('role').isIn(['doctor', 'nurse'])).notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const auth0Id = req.auth.sub;

      // Check if user already exists
      let user = await User.findOne({ auth0Id });
      
      if (user) {
        return res.status(409).json({
          error: 'User already exists',
          message: 'You already have an account',
        });
      }

      // Create new user
      user = await User.create({
        auth0Id,
        ...req.body,
      });

      await logAudit(user._id, 'CREATE', 'user', user._id.toString(), req);

      res.status(201).json({
        message: 'Account created successfully',
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Email already exists',
        });
      }

      res.status(500).json({
        error: 'Failed to create account',
      });
    }
  }
);

/**
 * GET CURRENT USER PROFILE
 * GET /api/users/me
 */
router.get('/users/me',
  authenticate,
  async (req, res) => {
    try {
      await logAudit(req.user._id, 'READ', 'user', req.user._id.toString(), req);
      
      res.json({
        id: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
        ...(req.user.role === 'patient' && {
          dateOfBirth: req.user.dateOfBirth,
          gender: req.user.gender,
          bloodType: req.user.bloodType,
        }),
        ...((['doctor', 'nurse'].includes(req.user.role)) && {
          licenseNumber: req.user.licenseNumber,
          specialization: req.user.specialization,
          hospitalAffiliation: req.user.hospitalAffiliation,
        }),
        isActive: req.user.isActive,
        createdAt: req.user.createdAt,
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }
);

/**
 * UPDATE PROFILE
 * PATCH /api/users/me
 */
router.patch('/users/me',
  authenticate,
  async (req, res) => {
    try {
      // Only allow updating certain fields
      const allowedUpdates = ['phone', 'address', 'emergencyContact'];
      
      if (req.user.role === 'patient') {
        allowedUpdates.push('bloodType');
      }

      const updates = {};
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      Object.assign(req.user, updates);
      await req.user.save();

      await logAudit(req.user._id, 'UPDATE', 'user', req.user._id.toString(), req);

      res.json({
        message: 'Profile updated',
        user: req.user,
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// ==================== PATIENT SEARCH (Healthcare Workers Only) ====================

/**
 * SEARCH PATIENTS
 * GET /api/patients/search?q=john
 * Only healthcare workers can search
 */
router.get('/patients/search',
  authenticate,
  requireHealthcareWorker,
  query('q').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const searchQuery = req.query.q;
      
      const patients = await User.find({
        role: 'patient',
        $or: [
          { firstName: new RegExp(searchQuery, 'i') },
          { lastName: new RegExp(searchQuery, 'i') },
          { email: new RegExp(searchQuery, 'i') },
        ],
      })
      .select('firstName lastName email dateOfBirth gender bloodType')
      .limit(20);

      res.json(patients);
    } catch (error) {
      console.error('Search patients error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  }
);

/**
 * GET PATIENT DETAILS
 * GET /api/patients/:patientId
 * Healthcare workers can view any patient, patients can only view themselves
 */
router.get('/patients/:patientId',
  authenticate,
  canAccessPatient,
  param('patientId').isMongoId(),
  validate,
  async (req, res) => {
    try {
      const patient = await User.findOne({
        _id: req.params.patientId,
        role: 'patient',
      });

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      await logAudit(req.user._id, 'READ', 'patient', patient._id.toString(), req);

      res.json(patient);
    } catch (error) {
      console.error('Get patient error:', error);
      res.status(500).json({ error: 'Failed to get patient' });
    }
  }
);

// ==================== MEDICAL RECORDS ====================

/**
 * CREATE MEDICAL RECORD
 * POST /api/medical-records
 * Only doctors can create medical records
 */
router.post('/medical-records',
  authenticate,
  requireRole('doctor', 'admin'),
  [
    body('patientId').isMongoId(),
    body('hospitalName').trim().notEmpty(),
    body('visitDate').isISO8601().toDate(),
    body('visitType').isIn(['checkup', 'emergency', 'followup', 'consultation', 'surgery', 'other']),
    body('diagnosis').trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      // Verify patient exists
      const patient = await User.findOne({
        _id: req.body.patientId,
        role: 'patient',
      });

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const record = await MedicalRecord.create({
        ...req.body,
        doctorId: req.user._id,
      });

      // Populate doctor info
      await record.populate('doctorId', 'firstName lastName specialization');

      await logAudit(
        req.user._id,
        'CREATE',
        'medical_record',
        record._id.toString(),
        req,
        `Patient: ${patient.firstName} ${patient.lastName}`
      );

      res.status(201).json({
        message: 'Medical record created',
        record,
      });
    } catch (error) {
      console.error('Create medical record error:', error);
      res.status(500).json({ error: 'Failed to create record' });
    }
  }
);

/**
 * GET PATIENT'S MEDICAL RECORDS
 * GET /api/patients/:patientId/medical-records
 */
router.get('/patients/:patientId/medical-records',
  authenticate,
  canAccessPatient,
  param('patientId').isMongoId(),
  validate,
  async (req, res) => {
    try {
      const records = await MedicalRecord.find({
        patientId: req.params.patientId,
      })
      .populate('doctorId', 'firstName lastName specialization')
      .sort({ visitDate: -1 })
      .limit(100);

      await logAudit(req.user._id, 'READ', 'medical_records', req.params.patientId, req);

      res.json(records);
    } catch (error) {
      console.error('Get medical records error:', error);
      res.status(500).json({ error: 'Failed to get records' });
    }
  }
);

/**
 * UPDATE MEDICAL RECORD
 * PATCH /api/medical-records/:id
 * Only the doctor who created it or admin can update
 */
router.patch('/medical-records/:id',
  authenticate,
  requireHealthcareWorker,
  param('id').isMongoId(),
  validate,
  async (req, res) => {
    try {
      const record = await MedicalRecord.findById(req.params.id);

      if (!record) {
        return res.status(404).json({ error: 'Record not found' });
      }

      // Only the creator or admin can update
      if (req.user.role !== 'admin' && record.doctorId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only update records you created',
        });
      }

      const allowedUpdates = ['diagnosis', 'symptoms', 'treatment', 'notes', 'vitalSigns', 'status'];
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          record[field] = req.body[field];
        }
      });

      await record.save();
      await logAudit(req.user._id, 'UPDATE', 'medical_record', record._id.toString(), req);

      res.json({ message: 'Record updated', record });
    } catch (error) {
      console.error('Update medical record error:', error);
      res.status(500).json({ error: 'Failed to update record' });
    }
  }
);

// ==================== PRESCRIPTIONS ====================

/**
 * CREATE PRESCRIPTION
 * POST /api/prescriptions
 * Only doctors can prescribe
 */
router.post('/prescriptions',
  authenticate,
  requireRole('doctor', 'admin'),
  [
    body('patientId').isMongoId(),
    body('medicationName').trim().notEmpty(),
    body('dosage').trim().notEmpty(),
    body('frequency').trim().notEmpty(),
    body('duration').trim().notEmpty(),
    body('hospitalName').trim().notEmpty(),
    body('prescribedDate').isISO8601().toDate(),
  ],
  validate,
  async (req, res) => {
    try {
      const patient = await User.findOne({
        _id: req.body.patientId,
        role: 'patient',
      });

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const prescription = await Prescription.create({
        ...req.body,
        doctorId: req.user._id,
      });

      await prescription.populate('doctorId', 'firstName lastName specialization');

      await logAudit(
        req.user._id,
        'CREATE',
        'prescription',
        prescription._id.toString(),
        req,
        `Medication: ${prescription.medicationName} for ${patient.firstName} ${patient.lastName}`
      );

      res.status(201).json({
        message: 'Prescription created',
        prescription,
      });
    } catch (error) {
      console.error('Create prescription error:', error);
      res.status(500).json({ error: 'Failed to create prescription' });
    }
  }
);

/**
 * GET PATIENT'S PRESCRIPTIONS
 * GET /api/patients/:patientId/prescriptions
 */
router.get('/patients/:patientId/prescriptions',
  authenticate,
  canAccessPatient,
  param('patientId').isMongoId(),
  validate,
  async (req, res) => {
    try {
      const query = { patientId: req.params.patientId };
      
      if (req.query.active === 'true') {
        query.isActive = true;
      }

      const prescriptions = await Prescription.find(query)
        .populate('doctorId', 'firstName lastName specialization')
        .sort({ prescribedDate: -1 })
        .limit(100);

      await logAudit(req.user._id, 'READ', 'prescriptions', req.params.patientId, req);

      res.json(prescriptions);
    } catch (error) {
      console.error('Get prescriptions error:', error);
      res.status(500).json({ error: 'Failed to get prescriptions' });
    }
  }
);

/**
 * UPDATE PRESCRIPTION STATUS
 * PATCH /api/prescriptions/:id
 * Doctors and nurses can update
 */
router.patch('/prescriptions/:id',
  authenticate,
  requireHealthcareWorker,
  param('id').isMongoId(),
  body('isActive').isBoolean(),
  validate,
  async (req, res) => {
    try {
      const prescription = await Prescription.findByIdAndUpdate(
        req.params.id,
        { isActive: req.body.isActive },
        { new: true }
      ).populate('doctorId', 'firstName lastName');

      if (!prescription) {
        return res.status(404).json({ error: 'Prescription not found' });
      }

      await logAudit(req.user._id, 'UPDATE', 'prescription', prescription._id.toString(), req);

      res.json({ message: 'Prescription updated', prescription });
    } catch (error) {
      console.error('Update prescription error:', error);
      res.status(500).json({ error: 'Failed to update prescription' });
    }
  }
);

// ==================== TEST RESULTS ====================

/**
 * CREATE TEST RESULT
 * POST /api/test-results
 * Doctors and nurses can create
 */
router.post('/test-results',
  authenticate,
  requireHealthcareWorker,
  [
    body('patientId').isMongoId(),
    body('testName').trim().notEmpty(),
    body('testType').trim().notEmpty(),
    body('testDate').isISO8601().toDate(),
    body('result').trim().notEmpty(),
    body('hospitalName').trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const patient = await User.findOne({
        _id: req.body.patientId,
        role: 'patient',
      });

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const testResult = await TestResult.create({
        ...req.body,
        orderedBy: req.user._id,
      });

      await testResult.populate('orderedBy', 'firstName lastName role');

      await logAudit(req.user._id, 'CREATE', 'test_result', testResult._id.toString(), req);

      res.status(201).json({
        message: 'Test result created',
        testResult,
      });
    } catch (error) {
      console.error('Create test result error:', error);
      res.status(500).json({ error: 'Failed to create test result' });
    }
  }
);

/**
 * GET PATIENT'S TEST RESULTS
 * GET /api/patients/:patientId/test-results
 */
router.get('/patients/:patientId/test-results',
  authenticate,
  canAccessPatient,
  param('patientId').isMongoId(),
  validate,
  async (req, res) => {
    try {
      const testResults = await TestResult.find({
        patientId: req.params.patientId,
      })
      .populate('orderedBy', 'firstName lastName role')
      .sort({ testDate: -1 })
      .limit(100);

      await logAudit(req.user._id, 'READ', 'test_results', req.params.patientId, req);

      res.json(testResults);
    } catch (error) {
      console.error('Get test results error:', error);
      res.status(500).json({ error: 'Failed to get test results' });
    }
  }
);

/**
 * UPLOAD TEST FILE
 * POST /api/test-results/:id/upload
 */
router.post('/test-results/:id/upload',
  authenticate,
  requireHealthcareWorker,
  upload.single('file'),
  param('id').isMongoId(),
  validate,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const testResult = await TestResult.findById(req.params.id);

      if (!testResult) {
        return res.status(404).json({ error: 'Test result not found' });
      }

      const fileUrl = await S3Service.uploadFile(
        req.file,
        testResult.patientId.toString(),
        'test-results'
      );

      testResult.fileUrl = fileUrl;
      await testResult.save();

      await logAudit(
        req.user._id,
        'UPLOAD',
        'test_result',
        testResult._id.toString(),
        req,
        `File: ${req.file.originalname}`
      );

      res.json({
        message: 'File uploaded',
        fileUrl,
        testResult,
      });
    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

// ==================== AUDIT LOGS ====================

/**
 * GET AUDIT LOGS
 * GET /api/audit-logs
 * Healthcare workers can view all, patients see only their own
 */
router.get('/audit-logs',
  authenticate,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const query = {};

      // Patients can only see logs about themselves
      if (req.user.role === 'patient') {
        query.affectedPatientId = req.user._id;
      }

      // Filter by action type if provided
      if (req.query.action) {
        query.action = req.query.action;
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('userId', 'firstName lastName role')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit),
        AuditLog.countDocuments(query),
      ]);

      res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({ error: 'Failed to get audit logs' });
    }
  }
);

module.exports = router;