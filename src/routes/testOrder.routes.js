// backend/src/routes/testOrder.routes.js


const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.js');
const {
  authenticate,
  requireHealthcareWorker,
  requireDepartmentStaff,
  requireRole 
} = require('../middleware/auth.js');
const { TestOrder, User, Department } = require('../models/index.js');
const multer = require('multer');
const path = require('path');


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/test-results/'); // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'test-result-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'));
    }
  }
});




/**
 * @route   POST /api/test-orders
 * @desc    Create new test order
 * @access  Healthcare Workers (doctors, nurses)
 */
router.post(
  '/',
  authenticate,
  requireHealthcareWorker,
  [
    body('patientId').notEmpty().withMessage('Patient ID is required'),
    body('testType').trim().notEmpty().withMessage('Test type is required'),
    body('departmentId').notEmpty().withMessage('Department is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    validate,
  ],
  async (req, res) => {
    try {
      const {
        patientId,
        testType,
        departmentId,
        amount,
        description,
        urgency,
      } = req.body;

      const patient = await User.findOne({ _id: patientId, role: 'patient' });
      if (!patient) {
        return res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
      }

      const department = await Department.findOne({ _id: departmentId, hospitalId: req.hospitalId });
      if (!department) {
        return res.status(404).json({ error: 'Not Found', message: 'Department not found' });
      }

      const testOrder = await TestOrder.create({
        patientId,
        orderedBy: req.userId,
        hospitalId: req.hospitalId,
        departmentId,
        testName: testType,
        testType: testType,
        testDescription: description,
        paymentAmount: amount,
        urgency: urgency || 'routine',
        paymentRequired: true,
        paymentStatus: 'pending', // ✅ Correct
        status: 'payment_pending', // ✅ Correct: waiting for payment
        orderedDate: new Date(),
      });

      const populatedOrder = await TestOrder.findById(testOrder._id)
        .populate('patientId', 'firstName lastName email phone')
        .populate('orderedBy', 'firstName lastName specialization')
        .populate('departmentId', 'name code')
        .populate('hospitalId', 'name');

      res.status(201).json({
        message: 'Test order created successfully',
        data: populatedOrder,
      });
    } catch (error) {
      console.error('Create test order error:', error);
      res.status(500).json({ error: 'Creation failed', message: error.message });
    }
  }
);

/**
 * @route   GET /api/test-orders/doctor/my-orders
 * @desc    Get all test orders created by the logged-in doctor
 * @access  Doctor
 */
router.get('/doctor/my-orders', authenticate, requireHealthcareWorker, async (req, res) => {
  try {
    const { status, paymentStatus } = req.query;
    const query = { orderedBy: req.userId, hospitalId: req.hospitalId };

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const testOrders = await TestOrder.find(query)
      .populate('patientId', 'firstName lastName email phone')
      .populate('orderedBy', 'firstName lastName specialization')
      .populate('departmentId', 'name code')
      .sort({ createdAt: -1 });

    res.json({ count: testOrders.length, data: testOrders });
  } catch (error) {
    console.error('Fetch doctor test orders error:', error);
    res.status(500).json({ error: 'Failed to fetch test orders', message: error.message });
  }
});

/**
 * @route   GET /api/test-orders/patient/:patientId
 * @desc    Get all test orders for a patient
 * @access  Healthcare Workers, Patient (own orders)
 */
router.get('/patient/:patientId', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (req.user.role === 'patient' && req.userId.toString() !== patientId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own test orders' });
    }

    const testOrders = await TestOrder.find({ patientId })
      .populate('orderedBy', 'firstName lastName specialization')
      .populate('departmentId', 'name code')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 });

    res.json({ count: testOrders.length, data: testOrders });
  } catch (error) {
    console.error('Fetch patient test orders error:', error);
    res.status(500).json({ error: 'Failed to fetch test orders', message: error.message });
  }
});

/**
 * @route   GET /api/test-orders/department/pending
 * @desc    Get pending payment test orders for department
 * @access  Department Staff
 */
router.get('/department/pending', authenticate, requireDepartmentStaff, async (req, res) => {
  try {
    const testOrders = await TestOrder.find({
      departmentId: req.departmentId,
      paymentStatus: 'pending', // ✅ Waiting for payment
      status: 'payment_pending', // ✅ Correct status
    })
      .populate('patientId', 'firstName lastName email phone')
      .populate('orderedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ count: testOrders.length, data: testOrders });
  } catch (error) {
    console.error('Fetch pending tests error:', error);
    res.status(500).json({ error: 'Failed to fetch pending tests', message: error.message });
  }
});

/**
 * @route   GET /api/test-orders/department/ready
 * @desc    Get paid test orders ready for upload
 * @access  Department Staff
 */
router.get('/department/ready', authenticate, requireDepartmentStaff, async (req, res) => {
  try {
    const testOrders = await TestOrder.find({
      departmentId: req.departmentId,
      paymentStatus: 'paid', // ✅ Payment confirmed
      status: 'ready_for_test', // ✅ Correct: ready for testing/upload
    })
      .populate('patientId', 'firstName lastName email phone')
      .populate('orderedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ count: testOrders.length, data: testOrders });
  } catch (error) {
    console.error('Fetch ready tests error:', error);
    res.status(500).json({ error: 'Failed to fetch ready tests', message: error.message });
  }
});

/**
 * @route   GET /api/test-orders/department/completed
 * @desc    Get completed test orders
 * @access  Department Staff
 */
router.get('/department/completed', authenticate, requireDepartmentStaff, async (req, res) => {
  try {
    const testOrders = await TestOrder.find({
      departmentId: req.departmentId,
      status: 'completed', // ✅ Correct
    })
      .populate('patientId', 'firstName lastName email phone')
      .populate('orderedBy', 'firstName lastName')
      .sort({ completedDate: -1 })
      .limit(50);

    res.json({ count: testOrders.length, data: testOrders });
  } catch (error) {
    console.error('Fetch completed tests error:', error);
    res.status(500).json({ error: 'Failed to fetch completed tests', message: error.message });
  }
});

/**
 * @route   POST /api/test-orders/:orderId/payment
 * @desc    Confirm payment for test order (simulate payment)
 * @access  Patient or Department Staff
 */
router.post(
  '/:orderId/payment',
  authenticate,
  [
    body('paymentMethod').optional().trim(),
    body('transactionId').optional().trim(),
    validate,
  ],
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { paymentMethod, transactionId } = req.body;

      const testOrder = await TestOrder.findById(orderId);
      if (!testOrder) {
        return res.status(404).json({ error: 'Not Found', message: 'Test order not found' });
      }

      if (testOrder.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Already Paid', message: 'This test order has already been paid' });
      }

      testOrder.paymentStatus = 'paid'; // ✅ Correct
      testOrder.status = 'ready_for_test'; // ✅ Correct: payment done, ready for testing
      testOrder.paymentDate = new Date();
      testOrder.paymentMethod = paymentMethod || 'cash';
      testOrder.paymentReference = transactionId || `TXN-${Date.now()}`;
      testOrder.paidBy = req.userId;

      await testOrder.save();

      const updatedOrder = await TestOrder.findById(orderId)
        .populate('patientId', 'firstName lastName email')
        .populate('departmentId', 'name code');

      res.json({ message: 'Payment confirmed successfully', data: updatedOrder });
    } catch (error) {
      console.error('Payment confirmation error:', error);
      res.status(500).json({ error: 'Payment confirmation failed', message: error.message });
    }
  }
);

/**
 * @route   GET /api/test-orders/:orderId
 * @desc    Get single test order details
 * @access  Doctor, Patient, Department Staff
 */
router.get('/:orderId', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;

    const testOrder = await TestOrder.findById(orderId)
      .populate('patientId', 'firstName lastName email phone')
      .populate('orderedBy', 'firstName lastName specialization')
      .populate('departmentId', 'name code')
      .populate('hospitalId', 'name')
      .populate('resultUploadedBy', 'firstName lastName');

    if (!testOrder) {
      return res.status(404).json({ error: 'Not Found', message: 'Test order not found' });
    }

    const isDoctor = testOrder.orderedBy._id.toString() === req.userId.toString();
    const isPatient = testOrder.patientId._id.toString() === req.userId.toString();
    const isDepartmentStaff = testOrder.departmentId._id.toString() === req.departmentId?.toString();
    const isSameHospital = testOrder.hospitalId._id.toString() === req.hospitalId?.toString();

    if (!isDoctor && !isPatient && !isDepartmentStaff && !isSameHospital && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to view this test order' });
    }

    res.json({ data: testOrder });
  } catch (error) {
    console.error('Fetch test order error:', error);
    res.status(500).json({ error: 'Failed to fetch test order', message: error.message });
  }
});



// Upload test result and mark as completed
router.post('/:orderId/upload-result', 
  authenticate, 
  requireRole(['department_staff']),
  upload.single('file'),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { notes } = req.body;

      // Find the test order
      const testOrder = await TestOrder.findById(orderId);
      if (!testOrder) {
        return res.status(404).json({ message: 'Test order not found' });
      }

      // Verify user has access (same department)
      if (testOrder.departmentId.toString() !== req.user.departmentId.toString()) {
        return res.status(403).json({ message: 'Access denied. Different department.' });
      }

      // Check if payment is confirmed using the model's virtual
      if (!testOrder.canUploadResult) {
        return res.status(400).json({ 
          message: 'Cannot upload result. Payment must be confirmed first.' 
        });
      }

      // Get file extension
      const fileExt = path.extname(req.file.originalname).toLowerCase();

      // Use the model's instance method ✅
      const resultData = {
        fileUrl: `/uploads/test-results/${req.file.filename}`,
        fileType: fileExt.replace('.', ''),
        notes: notes || '',
      };

      await testOrder.uploadResult(resultData, req.user._id);

      // Populate fields for response
      await testOrder.populate([
        { path: 'patientId', select: 'firstName lastName email phone' },
        { path: 'orderedBy', select: 'firstName lastName specialization' },
        { path: 'departmentId', select: 'name code' },
        { path: 'hospitalId', select: 'name' },
      ]);

      res.json({
        message: 'Test result uploaded successfully',
        data: testOrder,
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to upload test result'
      });
    }
  }
);







module.exports = router;


