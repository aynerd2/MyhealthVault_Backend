const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const { 
  requireRole,
  authenticate,
  requireHealthcareWorker,
  canAccessPatient,
  requireSuperAdmin,
  requireHospitalAdmin,
  requireDepartmentStaff,
} = require('../middleware/auth.js');
const { logAudit} = require('../middleware/audit.js');
const S3Service = require('../services/s3.service.js');
const {
  Hospital,
  Department,
  TestOrder,
  User, 
  MedicalRecord, 
  Prescription, 
  TestResult, 
  AuditLog, 
  HospitalSharing
} = require('../models/index.js');


const { validate } = require('../middleware/validate.js');


// Import new route files
const authRoutes = require('./auth.routes.js');
const hospitalRoutes = require('./hospital.routes.js');
const departmentRoutes = require('./department.routes.js');
const testOrderRoutes = require('./testOrder.routes.js');
const hospitalSharingRoutes = require('./hospitalSharing.routes.js');
const patientRoutes = require('./patient.routes.js')



const router = express.Router();




// Helper function to check if user can access patient from another hospital
async function canAccessCrossHospital(userHospitalId, patientHospitalId) {
  if (userHospitalId.toString() === patientHospitalId.toString()) {
    return true; // Same hospital
  }
  
  // Check if cross-hospital sharing is approved
  return await HospitalSharing.canAccess(userHospitalId, patientHospitalId);
}




// ============================================
// MOUNT ROUTES
// ============================================

// Auth routes
router.use('/auth', authRoutes);

// Hospital routes
router.use('/hospitals', hospitalRoutes);

// Department routes
router.use('/departments', departmentRoutes);

// Test order routes
router.use('/test-orders', testOrderRoutes);

// Hospital sharing routes
router.use('/hospital-sharing', hospitalSharingRoutes);

router.use('/patients', patientRoutes);




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
// function validate(req, res, next) {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ 
//       error: 'Validation failed',
//       errors: errors.array() 
//     });
//   }
//   next();
// }

// ==================== HEALTH CHECK ====================

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});


// ==================== USER/PROFILE ROUTES ====================

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

      // ==================== NEW: APPROVAL LOGIC ====================
      const requestedRole = req.body.role;
      let actualRole = requestedRole;
      let approvalStatus = 'approved';
      let appliedRole = null;
      
      // Healthcare workers need approval
      if (['doctor', 'nurse'].includes(requestedRole)) {
        actualRole = 'pending_approval';
        approvalStatus = 'pending';
        appliedRole = requestedRole;
      }
      // ===========================================================

      // Create new user
      user = await User.create({
        auth0Id,
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: actualRole,  // ← Use actualRole instead of req.body.role
        approvalStatus,
        appliedRole,
        appliedAt: appliedRole ? new Date() : null,
        
        // Patient fields
        ...(requestedRole === 'patient' && {
          dateOfBirth: req.body.dateOfBirth,
          gender: req.body.gender,
          bloodType: req.body.bloodType,
        }),
        
        // Healthcare worker fields
        ...(['doctor', 'nurse'].includes(requestedRole) && {
          licenseNumber: req.body.licenseNumber,
          specialization: req.body.specialization,
          hospitalAffiliation: req.body.hospitalAffiliation,
        }),
        
        // Optional fields
        phone: req.body.phone,
        address: req.body.address,
        emergencyContact: req.body.emergencyContact,
      });

      await logAudit(user._id, 'CREATE', 'user', user._id.toString(), req);

      // ==================== NEW: DIFFERENT RESPONSES ====================
      if (approvalStatus === 'pending') {
        // Healthcare worker pending approval
        return res.status(201).json({
          message: 'Application submitted successfully',
          status: 'pending_approval',
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            appliedRole: user.appliedRole,
            approvalStatus: user.approvalStatus,
          },
        });
      } else {
        // Patient - approved immediately
        return res.status(201).json({
          message: 'Account created successfully',
          status: 'approved',
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        });
      }
      // ==================================================================
    } catch (error) {
      console.error('Register error:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Email already exists',
        });
      }

      res.status(500).json({
        error: 'Failed to create account',
        details: error.message,
      });
    }
  }
);



// ==================== ADMIN APPROVAL ROUTES (ADD THESE!) ====================

/**
 * GET PENDING APPROVALS
 * GET /api/admin/pending-approvals
 * Admin only - see all users waiting for approval
 */
router.get(
  '/admin/pending-approvals',
  authenticate,
  requireHospitalAdmin,
  async (req, res) => {
    try {
      const pendingUsers = await User.find({
        hospitalId: req.hospitalId,
        approvalStatus: 'pending',
        role: { $in: ['doctor', 'nurse', 'department_staff'] },
      }).select('-password');

      res.json({
        count: pendingUsers.length,
        data: pendingUsers,
      });
    } catch (error) {
      console.error('Fetch pending approvals error:', error);
      res.status(500).json({
        error: 'Failed to fetch pending approvals',
        message: error.message,
      });
    }
  }
);

/**
 * APPROVE USER
 * POST /api/admin/approve-user/:userId
 * Admin only - approve a healthcare worker
 */

router.post('/admin/approve/:userId', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { departmentId } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Check if user belongs to admin's hospital
    if (user.hospitalId?.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only approve users in your hospital',
      });
    }

    user.approvalStatus = 'approved';
    user.approvedBy = req.userId;
    user.isActive = true;

    // Assign department if provided
    if (departmentId) {
      const department = await Department.findById(departmentId);
      if (department && department.hospitalId.toString() === req.hospitalId.toString()) {
        user.departmentId = departmentId;
      }
    }

    await user.save();

    await logAudit(req.userId, 'APPROVE', 'User', userId, {
      role: user.role,
      hospitalId: req.hospitalId,
    });

    res.json({
      message: 'User approved successfully',
      data: user,
    });
  } catch (error) {
    console.error('User approval error:', error);
    res.status(500).json({
      error: 'Approval failed',
      message: error.message,
    });
  }
});

/**
 * REJECT USER
 * POST /api/admin/reject-user/:userId
 * Admin only - reject a healthcare worker application
 */
// router.post('/admin/reject/:userId',
//   authenticate,
//   requireRole('admin'),
//   [
//     param('userId').isMongoId(),
//     body('rejectionReason').trim().notEmpty(),
//   ],
//   validate,
//   async (req, res) => {
//     try {
//       const user = await User.findById(req.params.userId);

//       if (!user) {
//         return res.status(404).json({ error: 'User not found' });
//       }

//       if (user.role !== 'pending_approval' || user.approvalStatus !== 'pending') {
//         return res.status(400).json({ 
//           error: 'User is not pending approval',
//           currentStatus: user.approvalStatus,
//         });
//       }

//       // Mark as rejected
//       user.approvalStatus = 'rejected';
//       user.rejectionReason = req.body.rejectionReason;
//       user.approvedBy = req.user._id;
//       user.approvedAt = new Date();
      
//       await user.save();

//       await logAudit(
//         req.user._id,
//         'UPDATE',
//         'user_rejection',
//         user._id.toString(),
//         req,
//         `Rejected ${user.email}: ${req.body.rejectionReason}`
//       );

//       // TODO: Send rejection email to user
//       // await sendRejectionEmail(user, req.body.rejectionReason);

//       res.json({
//         message: 'User application rejected',
//         user: {
//           id: user._id,
//           email: user.email,
//           approvalStatus: user.approvalStatus,
//         },
//       });
//     } catch (error) {
//       console.error('Reject user error:', error);
//       res.status(500).json({ error: 'Failed to reject user' });
//     }
//   }
// );

router.post(
  '/admin/reject/:userId',
  authenticate,
  requireHospitalAdmin,
  [body('reason').optional().trim(), validate],
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      if (user.hospitalId?.toString() !== req.hospitalId.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only reject users in your hospital',
        });
      }

      user.approvalStatus = 'rejected';
      user.approvedBy = req.userId;
      user.isActive = false;
      
      if (reason) {
        user.rejectionReason = reason;
      }

      await user.save();

      await logAudit(req.userId, 'REJECT', 'User', userId, {
        reason,
        hospitalId: req.hospitalId,
      });

      res.json({
        message: 'User rejected',
        data: user,
      });
    } catch (error) {
      console.error('User rejection error:', error);
      res.status(500).json({
        error: 'Rejection failed',
        message: error.message,
      });
    }
  }
);



/**
 * GET ALL USERS (ADMIN ONLY)
 * GET /api/admin/users
 * Admin can see all users with their statuses
 */
// router.get('/admin/users',
//   authenticate,
//   requireRole('admin'),
//   async (req, res) => {
//     try {
//       const page = parseInt(req.query.page) || 1;
//       const limit = parseInt(req.query.limit) || 50;
//       const skip = (page - 1) * limit;

//       const query = {};
      
//       // Filter by role if provided
//       if (req.query.role) {
//         query.role = req.query.role;
//       }
      
//       // Filter by approval status if provided
//       if (req.query.approvalStatus) {
//         query.approvalStatus = req.query.approvalStatus;
//       }

//       const [users, total] = await Promise.all([
//         User.find(query)
//           .select('-auth0Id') // Don't expose Auth0 ID
//           .sort({ createdAt: -1 })
//           .skip(skip)
//           .limit(limit),
//         User.countDocuments(query),
//       ]);

//       res.json({
//         users,
//         pagination: {
//           page,
//           limit,
//           total,
//           pages: Math.ceil(total / limit),
//         },
//       });
//     } catch (error) {
//       console.error('Get users error:', error);
//       res.status(500).json({ error: 'Failed to get users' });
//     }
//   }
// );

router.get('/admin/users', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const { role, departmentId, status, search } = req.query;

    const query = { hospitalId: req.hospitalId };

    if (role) query.role = role;
    if (departmentId) query.departmentId = departmentId;
    if (status) query.approvalStatus = status;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .populate('departmentId', 'name code')
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message,
    });
  }
});





/**
 * UPDATE USER STATUS (ADMIN ONLY)
 * PUT /api/admin/users/:userId/status
 * Admin can activate/deactivate users
 */
// router.put('/admin/users/:userId/status',
//   authenticate,
//   requireRole('admin'),
//   [
//     param('userId').isMongoId(),
//     body('isActive').isBoolean(),
//   ],
//   validate,
//   async (req, res) => {
//     try {
//       const user = await User.findById(req.params.userId);

//       if (!user) {
//         return res.status(404).json({ error: 'User not found' });
//       }

//       user.isActive = req.body.isActive;
//       await user.save();

//       await logAudit(
//         req.user._id,
//         'UPDATE',
//         'user_status',
//         user._id.toString(),
//         req,
//         `Set ${user.email} active status to ${req.body.isActive}`
//       );

//       res.json({
//         message: 'User status updated',
//         user: {
//           id: user._id,
//           email: user.email,
//           isActive: user.isActive,
//         },
//       });
//     } catch (error) {
//       console.error('Update user status error:', error);
//       res.status(500).json({ error: 'Failed to update user status' });
//     }
//   }
// );

router.put(
  '/admin/users/:userId/status',
  authenticate,
  requireHospitalAdmin,
  [body('isActive').isBoolean(), validate],
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      if (user.hospitalId?.toString() !== req.hospitalId.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only manage users in your hospital',
        });
      }

      user.isActive = isActive;
      await user.save();

      await logAudit(req.userId, 'UPDATE', 'User', userId, {
        isActive,
        hospitalId: req.hospitalId,
      });

      res.json({
        message: 'User status updated',
        data: user,
      });
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
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





/**
 * GET MEDICAL RECORDS FOR A PATIENT
 * GET /api/medical-records/patient/:patientId
 */
// router.get('/medical-records/patient/:patientId',
//   authenticate,
//   canAccessPatient,
//   async (req, res) => {
//     try {
//       const records = await MedicalRecord.find({ 
//         patientId: req.params.patientId 
//       })
//         .populate('doctorId', 'firstName lastName specialization')
//         .sort({ visitDate: -1 });

//       res.json(records);
//     } catch (error) {
//       console.error('Get medical records error:', error);
//       res.status(500).json({ error: 'Failed to get medical records' });
//     }
//   }
// );


// router.post('/medical-records',
//   authenticate,
//   requireRole('doctor', 'admin'),
//   [
//     body('patientId').isMongoId(),
//     body('hospitalName').trim().notEmpty(),
//     body('visitDate').isISO8601().toDate(),
//     body('visitType').isIn(['checkup', 'emergency', 'followup', 'consultation', 'surgery', 'other']),
//     body('diagnosis').trim().notEmpty(),
//   ],
//   validate,
//   async (req, res) => {
//     try {
//       // Verify patient exists
//       const patient = await User.findOne({
//         _id: req.body.patientId,
//         role: 'patient',
//       });

//       if (!patient) {
//         return res.status(404).json({ error: 'Patient not found' });
//       }

//       const record = await MedicalRecord.create({
//         ...req.body,
//         doctorId: req.user._id,
//       });

//       // Populate doctor info
//       await record.populate('doctorId', 'firstName lastName specialization');

//       await logAudit(
//         req.user._id,
//         'CREATE',
//         'medical_record',
//         record._id.toString(),
//         req,
//         `Patient: ${patient.firstName} ${patient.lastName}`
//       );

//       res.status(201).json({
//         message: 'Medical record created',
//         record,
//       });
//     } catch (error) {
//       console.error('Create medical record error:', error);
//       res.status(500).json({ error: 'Failed to create record' });
//     }
//   }
// );

router.get(
  '/medical-records/patient/:patientId',
  authenticate,
  canAccessPatient,
  async (req, res) => {
    try {
      const { patientId } = req.params;
      const { hospitalId } = req.query; // Optional: filter by hospital

      const query = { patientId };

      // If user is patient, show all their records from all hospitals
      if (req.user.role === 'patient') {
        // No hospital filter - show everything
      } else {
        // Healthcare worker or admin
        if (hospitalId) {
          // Filter by specific hospital
          query.hospitalId = hospitalId;
        } else {
          // Show records from user's hospital + shared hospitals
          const accessibleHospitals = [req.hospitalId];
          
          // Get shared hospitals
          const sharings = await HospitalSharing.find({
            requestingHospitalId: req.hospitalId,
            status: 'approved',
            isActive: true,
          });
          
          sharings.forEach((sharing) => {
            if (!sharing.isExpired) {
              accessibleHospitals.push(sharing.targetHospitalId);
            }
          });
          
          query.hospitalId = { $in: accessibleHospitals };
        }
      }

      const records = await MedicalRecord.find(query)
        .populate('doctorId', 'firstName lastName specialization')
        .populate('hospitalId', 'name')
        .populate('departmentId', 'name code')
        .populate({
          path: 'testOrders',
          populate: {
            path: 'departmentId',
            select: 'name code',
          },
        })
        .sort({ visitDate: -1 });

      res.json({
        count: records.length,
        data: records,
      });
    } catch (error) {
      console.error('Fetch medical records error:', error);
      res.status(500).json({
        error: 'Failed to fetch medical records',
        message: error.message,
      });
    }
  }
);






router.post(
  '/medical-records',
  authenticate,
  requireHealthcareWorker,
  [
    body('patientId').notEmpty().withMessage('Patient ID is required'),
    body('diagnosis').trim().notEmpty().withMessage('Diagnosis is required'),
    body('visitDate').isISO8601().withMessage('Valid visit date is required'),
    validate,
  ],
  canAccessPatient,
  async (req, res) => {
    try {
      const {
        patientId,
        diagnosis,
        symptoms,
        treatment,
        notes,
        visitDate,
        visitType,
        vitalSigns,
      } = req.body;

      // Create medical record
      const record = await MedicalRecord.create({
        patientId,
        doctorId: req.userId,
        hospitalId: req.hospitalId,
        departmentId: req.departmentId,
        diagnosis,
        symptoms,
        treatment,
        notes,
        visitDate: new Date(visitDate),
        visitType,
        vitalSigns,
      });

      const populatedRecord = await MedicalRecord.findById(record._id)
        .populate('doctorId', 'firstName lastName specialization')
        .populate('hospitalId', 'name')
        .populate('departmentId', 'name code');

      // Log audit trail
      await logAudit(req.userId, 'CREATE', 'MedicalRecord', record._id, {
        patientId,
        hospitalId: req.hospitalId,
      });

      res.status(201).json({
        message: 'Medical record created successfully',
        data: populatedRecord,
      });
    } catch (error) {
      console.error('Create medical record error:', error);
      res.status(500).json({
        error: 'Creation failed',
        message: error.message,
      });
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
 * @route   GET /api/medical-records/:recordId
 * @desc    Get single medical record
 * @access  Doctor, Nurse, Patient (own data)
 */
router.get('/medical-records/:recordId', authenticate, async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await MedicalRecord.findById(recordId)
      .populate('patientId', 'firstName lastName email phone')
      .populate('doctorId', 'firstName lastName specialization')
      .populate('hospitalId', 'name email phone address')
      .populate('departmentId', 'name code')
      .populate({
        path: 'testOrders',
        populate: [
          { path: 'departmentId', select: 'name code' },
          { path: 'resultUploadedBy', select: 'firstName lastName' },
        ],
      });

    if (!record) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Medical record not found',
      });
    }

    // Check access
    const isPatient = req.user.role === 'patient' && 
                      record.patientId._id.toString() === req.userId.toString();
    const isDoctor = record.doctorId._id.toString() === req.userId.toString();
    const isSameHospital = record.hospitalId._id.toString() === req.hospitalId?.toString();
    const canAccessShared = await canAccessCrossHospital(req.hospitalId, record.hospitalId._id);

    if (!isPatient && !isDoctor && !isSameHospital && !canAccessShared && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this record',
      });
    }

    res.json({ data: record });
  } catch (error) {
    console.error('Fetch medical record error:', error);
    res.status(500).json({
      error: 'Failed to fetch medical record',
      message: error.message,
    });
  }
});





/**
 * @route   PUT /api/medical-records/:recordId
 * @desc    Update medical record
 * @access  Doctor (who created it)
 */
router.put(
  '/medical-records/:recordId',
  authenticate,
  requireHealthcareWorker,
  async (req, res) => {
    try {
      const { recordId } = req.params;

      const record = await MedicalRecord.findById(recordId);

      if (!record) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Medical record not found',
        });
      }

      // Only the doctor who created it can update (or hospital admin)
      if (record.doctorId.toString() !== req.userId.toString() && 
          req.user.role !== 'hospital_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only update your own records',
        });
      }

      const allowedUpdates = [
        'diagnosis',
        'symptoms',
        'treatment',
        'notes',
        'vitalSigns',
        'visitType',
      ];

      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          record[field] = req.body[field];
        }
      });

      await record.save();

      const updatedRecord = await MedicalRecord.findById(recordId)
        .populate('doctorId', 'firstName lastName specialization')
        .populate('hospitalId', 'name')
        .populate('departmentId', 'name code');

      await logAudit(req.userId, 'UPDATE', 'MedicalRecord', recordId, {
        updates: req.body,
      });

      res.json({
        message: 'Medical record updated successfully',
        data: updatedRecord,
      });
    } catch (error) {
      console.error('Update medical record error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
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


/**
 * @route   GET /api/medical-records/hospital/all
 * @desc    Get all medical records in hospital (for hospital admin)
 * @access  Hospital Admin
 */
router.get(
  '/medical-records/hospital/all',
  authenticate,
  requireHospitalAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, search, departmentId, doctorId } = req.query;

      const query = { hospitalId: req.hospitalId };

      if (departmentId) query.departmentId = departmentId;
      if (doctorId) query.doctorId = doctorId;
      if (search) {
        query.$or = [
          { diagnosis: { $regex: search, $options: 'i' } },
          { symptoms: { $regex: search, $options: 'i' } },
        ];
      }

      const records = await MedicalRecord.find(query)
        .populate('patientId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName specialization')
        .populate('departmentId', 'name code')
        .sort({ visitDate: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await MedicalRecord.countDocuments(query);

      res.json({
        count: records.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        data: records,
      });
    } catch (error) {
      console.error('Fetch hospital records error:', error);
      res.status(500).json({
        error: 'Failed to fetch records',
        message: error.message,
      });
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
 * GET PRESCRIPTIONS FOR A PATIENT
 * GET /api/prescriptions/patient/:patientId
 */
// router.get('/prescriptions/patient/:patientId',
//   authenticate,
//   canAccessPatient,
//   async (req, res) => {
//     try {
//       const prescriptions = await Prescription.find({ 
//         patientId: req.params.patientId 
//       })
//         .populate('doctorId', 'firstName lastName specialization')
//         .sort({ prescribedDate: -1 });

//       res.json(prescriptions);
//     } catch (error) {
//       console.error('Get prescriptions error:', error);
//       res.status(500).json({ error: 'Failed to get prescriptions' });
//     }
//   }
// );

router.get(
  '/prescriptions/patient/:patientId',
  authenticate,
  canAccessPatient,
  async (req, res) => {
    try {
      const { patientId } = req.params;
      const { hospitalId, status } = req.query;

      const query = { patientId };

      // Apply hospital filter based on user role
      if (req.user.role === 'patient') {
        // Patients see all their prescriptions
      } else {
        if (hospitalId) {
          query.hospitalId = hospitalId;
        } else {
          // Show prescriptions from accessible hospitals
          const accessibleHospitals = [req.hospitalId];
          
          const sharings = await HospitalSharing.find({
            requestingHospitalId: req.hospitalId,
            status: 'approved',
            isActive: true,
          });
          
          sharings.forEach((sharing) => {
            if (!sharing.isExpired) {
              accessibleHospitals.push(sharing.targetHospitalId);
            }
          });
          
          query.hospitalId = { $in: accessibleHospitals };
        }
      }

      if (status) query.status = status;

      const prescriptions = await Prescription.find(query)
        .populate('doctorId', 'firstName lastName specialization')
        .populate('hospitalId', 'name')
        .sort({ prescribedDate: -1 });

      res.json({
        count: prescriptions.length,
        data: prescriptions,
      });
    } catch (error) {
      console.error('Fetch prescriptions error:', error);
      res.status(500).json({
        error: 'Failed to fetch prescriptions',
        message: error.message,
      });
    }
  }
);




/**
 * CREATE PRESCRIPTION
 * POST /api/prescriptions
 */
// router.post('/prescriptions',
//   authenticate,
//   requireHealthcareWorker,
//   [
//     body('patientId').isMongoId(),
//     body('medicationName').trim().notEmpty(),
//     body('dosage').trim().notEmpty(),
//     body('frequency').trim().notEmpty(),
//     body('duration').trim().notEmpty(),
//     body('hospitalName').trim().notEmpty(),
//     body('prescribedDate').isISO8601().toDate(),
//   ],
//   validate,
//   async (req, res) => {
//     try {
//       const prescription = await Prescription.create({
//         ...req.body,
//         doctorId: req.user._id,
//       });

//       await logAudit(
//         req.user._id,
//         'CREATE',
//         'prescription',
//         prescription._id.toString(),
//         req
//       );

//       res.status(201).json(prescription);
//     } catch (error) {
//       console.error('Create prescription error:', error);
//       res.status(500).json({ error: 'Failed to create prescription' });
//     }
//   }
// );

router.post(
  '/prescriptions',
  authenticate,
  requireHealthcareWorker,
  [
    body('patientId').notEmpty().withMessage('Patient ID is required'),
    body('medication').trim().notEmpty().withMessage('Medication is required'),
    body('dosage').trim().notEmpty().withMessage('Dosage is required'),
    body('frequency').trim().notEmpty().withMessage('Frequency is required'),
    body('duration').trim().notEmpty().withMessage('Duration is required'),
    validate,
  ],
  canAccessPatient,
  async (req, res) => {
    try {
      const {
        patientId,
        medication,
        dosage,
        frequency,
        duration,
        instructions,
        notes,
        refillable,
        refillsAllowed,
      } = req.body;

      const prescription = await Prescription.create({
        patientId,
        doctorId: req.userId,
        hospitalId: req.hospitalId,
        medication,
        dosage,
        frequency,
        duration,
        instructions,
        notes,
        prescribedDate: new Date(),
        refillable: refillable || false,
        refillsAllowed: refillsAllowed || 0,
        refillsRemaining: refillsAllowed || 0,
        status: 'active',
      });

      const populatedPrescription = await Prescription.findById(prescription._id)
        .populate('doctorId', 'firstName lastName specialization')
        .populate('hospitalId', 'name');

      await logAudit(req.userId, 'CREATE', 'Prescription', prescription._id, {
        patientId,
        medication,
      });

      res.status(201).json({
        message: 'Prescription created successfully',
        data: populatedPrescription,
      });
    } catch (error) {
      console.error('Create prescription error:', error);
      res.status(500).json({
        error: 'Creation failed',
        message: error.message,
      });
    }
  }
);





/**
 * GET PATIENT'S PRESCRIPTIONS
 * GET /api/patients/:patientId/prescriptions
 */
// router.get('/patients/:patientId/prescriptions',
//   authenticate,
//   canAccessPatient,
//   param('patientId').isMongoId(),
//   validate,
//   async (req, res) => {
//     try {
//       const query = { patientId: req.params.patientId };
      
//       if (req.query.active === 'true') {
//         query.isActive = true;
//       }

//       const prescriptions = await Prescription.find(query)
//         .populate('doctorId', 'firstName lastName specialization')
//         .sort({ prescribedDate: -1 })
//         .limit(100);

//       await logAudit(req.user._id, 'READ', 'prescriptions', req.params.patientId, req);

//       res.json(prescriptions);
//     } catch (error) {
//       console.error('Get prescriptions error:', error);
//       res.status(500).json({ error: 'Failed to get prescriptions' });
//     }
//   }
// );


router.get('/prescriptions/:prescriptionId', authenticate, async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    const prescription = await Prescription.findById(prescriptionId)
      .populate('patientId', 'firstName lastName email phone')
      .populate('doctorId', 'firstName lastName specialization email phone')
      .populate('hospitalId', 'name email phone address');

    if (!prescription) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Prescription not found',
      });
    }

    // Check access
    const isPatient = req.user.role === 'patient' && 
                      prescription.patientId._id.toString() === req.userId.toString();
    const isDoctor = prescription.doctorId._id.toString() === req.userId.toString();
    const isSameHospital = prescription.hospitalId._id.toString() === req.hospitalId?.toString();
    const isPharmacist = req.user.role === 'department_staff' && 
                         req.user.departmentRole === 'pharmacist';

    if (!isPatient && !isDoctor && !isSameHospital && !isPharmacist && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this prescription',
      });
    }

    res.json({ data: prescription });
  } catch (error) {
    console.error('Fetch prescription error:', error);
    res.status(500).json({
      error: 'Failed to fetch prescription',
      message: error.message,
    });
  }
});



router.put(
  '/prescriptions/:prescriptionId/status',
  authenticate,
  [
    body('status').isIn(['active', 'completed', 'cancelled']),
    validate,
  ],
  async (req, res) => {
    try {
      const { prescriptionId } = req.params;
      const { status, reason } = req.body;

      const prescription = await Prescription.findById(prescriptionId);

      if (!prescription) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Prescription not found',
        });
      }

      // Check permissions
      const isDoctor = prescription.doctorId.toString() === req.userId.toString();
      const isPharmacist = req.user.role === 'department_staff' && 
                           req.user.departmentRole === 'pharmacist' &&
                           prescription.hospitalId.toString() === req.hospitalId.toString();

      if (!isDoctor && !isPharmacist && req.user.role !== 'hospital_admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions',
        });
      }

      prescription.status = status;
      if (status === 'cancelled' && reason) {
        prescription.notes = (prescription.notes || '') + `\nCancelled: ${reason}`;
      }

      await prescription.save();

      await logAudit(req.userId, 'UPDATE', 'Prescription', prescriptionId, {
        status,
        reason,
      });

      res.json({
        message: 'Prescription status updated',
        data: prescription,
      });
    } catch (error) {
      console.error('Update prescription status error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
    }
  }
);




/**
 * @route   POST /api/prescriptions/:prescriptionId/refill
 * @desc    Request prescription refill
 * @access  Patient (own prescriptions)
 */
router.post(
  '/prescriptions/:prescriptionId/refill',
  authenticate,
  async (req, res) => {
    try {
      const { prescriptionId } = req.params;

      const prescription = await Prescription.findById(prescriptionId)
        .populate('doctorId', 'firstName lastName email')
        .populate('patientId', 'firstName lastName email');

      if (!prescription) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Prescription not found',
        });
      }

      // Only patient can request refill
      if (req.user.role !== 'patient' || 
          prescription.patientId._id.toString() !== req.userId.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only request refills for your own prescriptions',
        });
      }

      // Check if refillable
      if (!prescription.refillable) {
        return res.status(400).json({
          error: 'Not Refillable',
          message: 'This prescription is not refillable',
        });
      }

      // Check remaining refills
      if (prescription.refillsRemaining <= 0) {
        return res.status(400).json({
          error: 'No Refills',
          message: 'No refills remaining. Please contact your doctor.',
        });
      }

      // Decrease refills remaining
      prescription.refillsRemaining -= 1;
      prescription.lastRefillDate = new Date();
      await prescription.save();

      // TODO: Send notification to doctor
      // TODO: Send notification to pharmacy

      res.json({
        message: 'Refill request submitted successfully',
        data: prescription,
      });
    } catch (error) {
      console.error('Refill request error:', error);
      res.status(500).json({
        error: 'Refill request failed',
        message: error.message,
      });
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
 * GET TEST RESULTS FOR A PATIENT
 * GET /api/test-results/patient/:patientId
 */
router.get('/test-results/patient/:patientId',
  authenticate,
  canAccessPatient,
  async (req, res) => {
    try {
      const testResults = await TestResult.find({ 
        patientId: req.params.patientId 
      })
        .populate('orderedBy', 'firstName lastName specialization')
        .sort({ testDate: -1 });

      res.json(testResults);
    } catch (error) {
      console.error('Get test results error:', error);
      res.status(500).json({ error: 'Failed to get test results' });
    }
  }
);

/**
 * CREATE TEST RESULT
 * POST /api/test-results
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
      const testResult = await TestResult.create({
        ...req.body,
        orderedBy: req.user._id,
      });

      await logAudit(
        req.user._id,
        'CREATE',
        'test_result',
        testResult._id.toString(),
        req
      );

      res.status(201).json(testResult);
    } catch (error) {
      console.error('Create test result error:', error);
      res.status(500).json({ error: 'Failed to create test result' });
    }
  }
);

/**
 * UPLOAD TEST FILE
 * POST /api/test-results/upload
 */
router.post('/test-results/upload',
  authenticate,
  requireHealthcareWorker,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Upload to S3 or store locally
      // const fileUrl = await S3Service.uploadFile(req.file);
      const fileUrl = `/uploads/${req.file.filename}`; // Temporary

      res.json({ fileUrl });
    } catch (error) {
      console.error('Upload test file error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
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




// ============================================
// USER PROFILE
// ============================================

/**
 * @route   GET /api/users/profile
 * @desc    Get current user profile
 * @access  Authenticated
 */
router.get('/users/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('hospitalId', 'name email phone address logo')
      .populate('departmentId', 'name code type')
      .select('-password');

    res.json({ data: user });
  } catch (error) {
    console.error('Fetch profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: error.message,
    });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user profile
 * @access  Authenticated
 */
router.put(
  '/users/profile',
  authenticate,
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('dateOfBirth').optional().isISO8601(),
    validate,
  ],
  async (req, res) => {
    try {
      const allowedUpdates = [
        'firstName',
        'lastName',
        'phone',
        'dateOfBirth',
        'gender',
        'address',
        'emergencyContact',
        'bloodType',
        'allergies',
        'chronicConditions',
      ];

      const updates = {};
      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      const user = await User.findByIdAndUpdate(
        req.userId,
        { $set: updates },
        { new: true, runValidators: true }
      )
        .populate('hospitalId', 'name email')
        .populate('departmentId', 'name code')
        .select('-password');

      res.json({
        message: 'Profile updated successfully',
        data: user,
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
    }
  }
);



module.exports = router;





