// backend/src/routes/hospital.routes.js

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.js');
const {
  authenticate,
  requireSuperAdmin,
  requireHospitalAdmin,
} = require('../middleware/auth.js');
const { Hospital, User, Department } = require('../models/index.js');
const bcrypt = require('bcryptjs');

// ============================================
// PUBLIC ROUTES (No authentication)
// ============================================

/**
 * @route   POST /api/hospitals/register
 * @desc    Register a new hospital
 * @access  Public
 */
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Hospital name is required'),
    body('registrationNumber').trim().notEmpty().withMessage('Registration number is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('address.city').trim().notEmpty().withMessage('City is required'),
    body('address.state').trim().notEmpty().withMessage('State is required'),
    body('address.country').trim().notEmpty().withMessage('Country is required'),
    body('adminFirstName').trim().notEmpty().withMessage('Admin first name is required'),
    body('adminLastName').trim().notEmpty().withMessage('Admin last name is required'),
    body('adminEmail').isEmail().withMessage('Valid admin email is required'),
    body('adminPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate,
  ],
  async (req, res) => {
    try {
      const {
        name,
        registrationNumber,
        email,
        phone,
        address,
        website,
        description,
        subscriptionPlan,
        adminFirstName,
        adminLastName,
        adminEmail,
        adminPassword,
        adminPhone,
      } = req.body;

      // Check if hospital already exists
      const existingHospital = await Hospital.findOne({
        $or: [
          { email },
          { registrationNumber },
          { name },
        ],
      });

      if (existingHospital) {
        return res.status(400).json({
          error: 'Hospital already exists',
          message: 'A hospital with this name, email, or registration number already exists',
        });
      }

      // Check if admin email already exists
      const existingUser = await User.findOne({ email: adminEmail });
      if (existingUser) {
        return res.status(400).json({
          error: 'Email already exists',
          message: 'Admin email is already registered',
        });
      }

      // Create hospital admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      const adminUser = await User.create({
        email: adminEmail,
        password: hashedPassword,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: 'hospital_admin',
        phone: adminPhone || phone,
        isActive: true,
        approvalStatus: 'approved', // Admin is auto-approved
      });

      // Create hospital
      const hospital = await Hospital.create({
        name,
        registrationNumber,
        email,
        phone,
        address,
        website,
        description,
        subscriptionPlan: subscriptionPlan || 'free',
        subscriptionStatus: 'pending',
        approvalStatus: 'pending',
        adminUserId: adminUser._id,
      });

      // Update admin user with hospital ID
      adminUser.hospitalId = hospital._id;
      await adminUser.save();

      res.status(201).json({
        message: 'Hospital registration submitted successfully',
        data: {
          hospital: {
            id: hospital._id,
            name: hospital.name,
            email: hospital.email,
            approvalStatus: hospital.approvalStatus,
          },
          admin: {
            id: adminUser._id,
            email: adminUser.email,
            name: `${adminUser.firstName} ${adminUser.lastName}`,
          },
        },
      });
    } catch (error) {
      console.error('Hospital registration error:', error);
      res.status(500).json({
        error: 'Registration failed',
        message: error.message,
      });
    }
  }
);

// ============================================
// SUPER ADMIN ROUTES
// ============================================

/**
 * @route   GET /api/hospitals/pending
 * @desc    Get all pending hospital approvals
 * @access  Super Admin
 */
router.get('/pending', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const pendingHospitals = await Hospital.find({
      approvalStatus: 'pending',
    })
      .populate('adminUserId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });

    res.json({
      count: pendingHospitals.length,
      data: pendingHospitals,
    });
  } catch (error) {
    console.error('Fetch pending hospitals error:', error);
    res.status(500).json({
      error: 'Failed to fetch pending hospitals',
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/hospitals/:hospitalId/approve
 * @desc    Approve a hospital
 * @access  Super Admin
 */
router.post(
  '/:hospitalId/approve',
  authenticate,
  requireSuperAdmin,
  [
    body('subscriptionPlan').optional().isIn(['free', 'basic', 'premium', 'enterprise']),
    body('subscriptionExpiry').optional().isISO8601(),
    validate,
  ],
  async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { subscriptionPlan, subscriptionExpiry, notes } = req.body;

      const hospital = await Hospital.findById(hospitalId);
      
      if (!hospital) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Hospital not found',
        });
      }

      if (hospital.approvalStatus === 'approved') {
        return res.status(400).json({
          error: 'Already Approved',
          message: 'Hospital is already approved',
        });
      }

      hospital.approvalStatus = 'approved';
      hospital.approvedBy = req.userId;
      hospital.approvedAt = new Date();
      hospital.subscriptionStatus = 'active';
      hospital.subscriptionStartDate = new Date();
      
      if (subscriptionPlan) {
        hospital.subscriptionPlan = subscriptionPlan;
      }
      
      if (subscriptionExpiry) {
        hospital.subscriptionExpiry = new Date(subscriptionExpiry);
      }
      
      if (notes) {
        hospital.notes = notes;
      }

      await hospital.save();

      // TODO: Send approval email to hospital admin

      res.json({
        message: 'Hospital approved successfully',
        data: hospital,
      });
    } catch (error) {
      console.error('Hospital approval error:', error);
      res.status(500).json({
        error: 'Approval failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/hospitals/:hospitalId/reject
 * @desc    Reject a hospital
 * @access  Super Admin
 */
router.post(
  '/:hospitalId/reject',
  authenticate,
  requireSuperAdmin,
  [
    body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
    validate,
  ],
  async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { reason } = req.body;

      const hospital = await Hospital.findById(hospitalId);
      
      if (!hospital) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Hospital not found',
        });
      }

      hospital.approvalStatus = 'rejected';
      hospital.approvedBy = req.userId;
      hospital.rejectionReason = reason;
      hospital.isActive = false;

      await hospital.save();

      // TODO: Send rejection email to hospital admin

      res.json({
        message: 'Hospital rejected',
        data: hospital,
      });
    } catch (error) {
      console.error('Hospital rejection error:', error);
      res.status(500).json({
        error: 'Rejection failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/hospitals
 * @desc    Get all hospitals (with filters)
 * @access  Super Admin
 */
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { status, subscription, search } = req.query;
    
    const query = {};
    
    if (status) query.approvalStatus = status;
    if (subscription) query.subscriptionStatus = subscription;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const hospitals = await Hospital.find(query)
      .populate('adminUserId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      count: hospitals.length,
      data: hospitals,
    });
  } catch (error) {
    console.error('Fetch hospitals error:', error);
    res.status(500).json({
      error: 'Failed to fetch hospitals',
      message: error.message,
    });
  }
});

/**
 * @route   PUT /api/hospitals/:hospitalId/status
 * @desc    Update hospital status
 * @access  Super Admin
 */
router.put(
  '/:hospitalId/status',
  authenticate,
  requireSuperAdmin,
  [
    body('subscriptionStatus').optional().isIn(['pending', 'active', 'suspended', 'expired']),
    body('isActive').optional().isBoolean(),
    validate,
  ],
  async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { subscriptionStatus, isActive } = req.body;

      const hospital = await Hospital.findById(hospitalId);
      
      if (!hospital) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Hospital not found',
        });
      }

      if (subscriptionStatus) hospital.subscriptionStatus = subscriptionStatus;
      if (typeof isActive === 'boolean') hospital.isActive = isActive;

      await hospital.save();

      res.json({
        message: 'Hospital status updated',
        data: hospital,
      });
    } catch (error) {
      console.error('Update hospital status error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
    }
  }
);

// ============================================
// HOSPITAL ADMIN ROUTES
// ============================================

/**
 * @route   GET /api/hospitals/my-hospital
 * @desc    Get current user's hospital details
 * @access  Hospital Admin, Healthcare Workers
 */
router.get('/my-hospital', authenticate, async (req, res) => {
  try {
    if (!req.hospitalId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'You are not associated with any hospital',
      });
    }

    const hospital = await Hospital.findById(req.hospitalId)
      .populate('adminUserId', 'firstName lastName email phone');

    if (!hospital) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Hospital not found',
      });
    }

    res.json({ data: hospital });
  } catch (error) {
    console.error('Fetch hospital error:', error);
    res.status(500).json({
      error: 'Failed to fetch hospital',
      message: error.message,
    });
  }
});

/**
 * @route   PUT /api/hospitals/my-hospital
 * @desc    Update hospital details
 * @access  Hospital Admin
 */
router.put(
  '/my-hospital',
  authenticate,
  requireHospitalAdmin,
  [
    body('name').optional().trim().notEmpty(),
    body('phone').optional().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('website').optional().isURL(),
    validate,
  ],
  async (req, res) => {
    try {
      if (!req.hospitalId) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'You are not associated with any hospital',
        });
      }

      const allowedUpdates = [
        'phone',
        'address',
        'website',
        'description',
        'logo',
      ];

      const updates = {};
      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      const hospital = await Hospital.findByIdAndUpdate(
        req.hospitalId,
        { $set: updates },
        { new: true, runValidators: true }
      );

      res.json({
        message: 'Hospital updated successfully',
        data: hospital,
      });
    } catch (error) {
      console.error('Update hospital error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/hospitals/my-hospital/stats
 * @desc    Get hospital statistics
 * @access  Hospital Admin
 */
router.get('/my-hospital/stats', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    if (!req.hospitalId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'You are not associated with any hospital',
      });
    }

    const [
      totalDoctors,
      totalNurses,
      totalStaff,
      totalPatients,
      totalDepartments,
      pendingApprovals,
    ] = await Promise.all([
      User.countDocuments({ hospitalId: req.hospitalId, role: 'doctor', isActive: true }),
      User.countDocuments({ hospitalId: req.hospitalId, role: 'nurse', isActive: true }),
      User.countDocuments({ hospitalId: req.hospitalId, role: 'department_staff', isActive: true }),
      User.countDocuments({ hospitalId: req.hospitalId, role: 'patient', isActive: true }),
      Department.countDocuments({ hospitalId: req.hospitalId, isActive: true }),
      User.countDocuments({ hospitalId: req.hospitalId, approvalStatus: 'pending' }),
    ]);

    res.json({
      data: {
        totalDoctors,
        totalNurses,
        totalStaff,
        totalPatients,
        totalDepartments,
        pendingApprovals,
        totalHealthcareWorkers: totalDoctors + totalNurses + totalStaff,
      },
    });
  } catch (error) {
    console.error('Fetch hospital stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message,
    });
  }
});

module.exports = router;