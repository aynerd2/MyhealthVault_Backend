// backend/src/routes/department.routes.js

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.js');
const {
  authenticate,
  requireHospitalAdmin,
  requireDepartmentStaff,
} = require('../middleware/auth.js');
const { Department, User, Hospital } = require('../models/index.js');
const bcrypt = require('bcryptjs');

// ============================================
// HOSPITAL ADMIN ROUTES
// ============================================

/**
 * @route   POST /api/departments
 * @desc    Create a new department
 * @access  Hospital Admin
 */
router.post(
  '/',
  authenticate,
  requireHospitalAdmin,
  [
    body('name').trim().notEmpty().withMessage('Department name is required'),
    body('code').trim().notEmpty().withMessage('Department code is required').isLength({ min: 2, max: 10 }),
    body('type').isIn(['radiology', 'laboratory', 'cardiology', 'neurology', 'orthopedics', 'pediatrics', 'emergency', 'surgery', 'pharmacy', 'other']),
    body('departmentEmail').optional().isEmail(),
    body('departmentPassword').optional().isLength({ min: 8 }),
    validate,
  ],
  async (req, res) => {
    try {
      const {
        name,
        code,
        type,
        description,
        phone,
        email,
        location,
        departmentEmail,
        departmentPassword,
        services,
      } = req.body;

      // Check if department code already exists in this hospital
      const existingDept = await Department.findOne({
        hospitalId: req.hospitalId,
        code: code.toUpperCase(),
      });

      if (existingDept) {
        return res.status(400).json({
          error: 'Department exists',
          message: 'A department with this code already exists in your hospital',
        });
      }

      // Check if department email is unique
      if (departmentEmail) {
        const emailExists = await Department.findOne({ departmentEmail });
        if (emailExists) {
          return res.status(400).json({
            error: 'Email exists',
            message: 'This department email is already in use',
          });
        }
      }

      const department = await Department.create({
        name,
        code: code.toUpperCase(),
        type,
        description,
        phone,
        email,
        location,
        hospitalId: req.hospitalId,
        departmentEmail,
        departmentPassword: departmentPassword || 'department123',
        services: services || [],
        departmentLoginEnabled: !!departmentEmail,
      });

      // Update hospital stats
      await Hospital.findByIdAndUpdate(req.hospitalId, {
        $inc: { 'stats.totalDepartments': 1 },
      });

      res.status(201).json({
        message: 'Department created successfully',
        data: department,
      });
    } catch (error) {
      console.error('Create department error:', error);
      res.status(500).json({
        error: 'Creation failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/departments
 * @desc    Get all departments in hospital
 * @access  Hospital Admin, Healthcare Workers
 */
router.get('/', authenticate, async (req, res) => {
  try {
    if (!req.hospitalId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Hospital ID not found',
      });
    }

    const departments = await Department.find({
      hospitalId: req.hospitalId,
      isActive: true,
    })
      .populate('head', 'firstName lastName email specialization')
      .sort({ name: 1 });

    res.json({
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    console.error('Fetch departments error:', error);
    res.status(500).json({
      error: 'Failed to fetch departments',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/departments/:departmentId
 * @desc    Get department details
 * @access  Hospital Admin, Healthcare Workers, Department Staff
 */
router.get('/:departmentId', authenticate, async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId)
      .populate('head', 'firstName lastName email specialization')
      .populate('hospitalId', 'name email phone address');

    if (!department) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Department not found',
      });
    }

    // Check access - users can only view departments in their hospital
    if (req.user.role !== 'super_admin' && 
        department.hospitalId._id.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view departments in your hospital',
      });
    }

    res.json({ data: department });
  } catch (error) {
    console.error('Fetch department error:', error);
    res.status(500).json({
      error: 'Failed to fetch department',
      message: error.message,
    });
  }
});

/**
 * @route   PUT /api/departments/:departmentId
 * @desc    Update department
 * @access  Hospital Admin
 */
router.put(
  '/:departmentId',
  authenticate,
  requireHospitalAdmin,
  [
    body('name').optional().trim().notEmpty(),
    body('code').optional().trim().isLength({ min: 2, max: 10 }),
    body('departmentEmail').optional().isEmail(),
    validate,
  ],
  async (req, res) => {
    try {
      const { departmentId } = req.params;

      const department = await Department.findById(departmentId);

      if (!department) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Department not found',
        });
      }

      // Check if department belongs to user's hospital
      if (department.hospitalId.toString() !== req.hospitalId.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only update departments in your hospital',
        });
      }

      const allowedUpdates = [
        'name',
        'description',
        'phone',
        'email',
        'location',
        'services',
        'operatingHours',
        'head',
        'isActive',
      ];

      const updates = {};
      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      Object.assign(department, updates);
      await department.save();

      res.json({
        message: 'Department updated successfully',
        data: department,
      });
    } catch (error) {
      console.error('Update department error:', error);
      res.status(500).json({
        error: 'Update failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   DELETE /api/departments/:departmentId
 * @desc    Delete (deactivate) department
 * @access  Hospital Admin
 */
router.delete('/:departmentId', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId);

    if (!department) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Department not found',
      });
    }

    // Check if department belongs to user's hospital
    if (department.hospitalId.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete departments in your hospital',
      });
    }

    // Soft delete
    department.isActive = false;
    await department.save();

    // Update hospital stats
    await Hospital.findByIdAndUpdate(req.hospitalId, {
      $inc: { 'stats.totalDepartments': -1 },
    });

    res.json({
      message: 'Department deleted successfully',
    });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({
      error: 'Deletion failed',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/departments/:departmentId/staff
 * @desc    Get all staff in department
 * @access  Hospital Admin
 */
router.get('/:departmentId/staff', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const { departmentId } = req.params;

    const department = await Department.findById(departmentId);

    if (!department) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Department not found',
      });
    }

    if (department.hospitalId.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied',
      });
    }

    const staff = await User.find({
      departmentId,
      isActive: true,
      role: { $in: ['doctor', 'nurse', 'department_staff'] },
    }).select('-password');

    res.json({
      count: staff.length,
      data: staff,
    });
  } catch (error) {
    console.error('Fetch department staff error:', error);
    res.status(500).json({
      error: 'Failed to fetch staff',
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/departments/:departmentId/assign-head
 * @desc    Assign department head
 * @access  Hospital Admin
 */
router.post(
  '/:departmentId/assign-head',
  authenticate,
  requireHospitalAdmin,
  [
    body('userId').notEmpty().withMessage('User ID is required'),
    validate,
  ],
  async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { userId } = req.body;

      const department = await Department.findById(departmentId);

      if (!department) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Department not found',
        });
      }

      if (department.hospitalId.toString() !== req.hospitalId.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      // Check if user belongs to this hospital and department
      if (user.hospitalId.toString() !== req.hospitalId.toString() ||
          user.departmentId.toString() !== departmentId.toString()) {
        return res.status(400).json({
          error: 'Invalid User',
          message: 'User must belong to this department',
        });
      }

      // Check if user is a doctor
      if (user.role !== 'doctor') {
        return res.status(400).json({
          error: 'Invalid User',
          message: 'Department head must be a doctor',
        });
      }

      department.head = userId;
      await department.save();

      res.json({
        message: 'Department head assigned successfully',
        data: department,
      });
    } catch (error) {
      console.error('Assign department head error:', error);
      res.status(500).json({
        error: 'Assignment failed',
        message: error.message,
      });
    }
  }
);

module.exports = router;