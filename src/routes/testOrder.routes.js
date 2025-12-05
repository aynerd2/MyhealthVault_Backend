// backend/src/routes/testOrder.routes.js

// backend/src/routes/testOrder.routes.js - COMPLETE CORRECTED VERSION

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.js');
const {
  authenticate,
  requireHealthcareWorker,
  requireDepartmentStaff,
} = require('../middleware/auth.js');
const { TestOrder, User, Department } = require('../models/index.js');

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

module.exports = router;
















// const express = require('express');
// const router = express.Router();
// const { body } = require('express-validator');
// const { validate } = require('../middleware/validate.js');
// const {
//   authenticate,
//   requireHealthcareWorker,
//   requireDepartmentStaff,
//   canAccessPatient,
// } = require('../middleware/auth.js');
// const { TestOrder, User, Department } = require('../models/index.js');
// const multer = require('multer');
// const path = require('path');

// // Configure multer for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/test-results/');
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     cb(null, 'test-' + uniqueSuffix + path.extname(file.originalname));
//   },
// });

// const upload = multer({
//   storage,
//   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (extname && mimetype) {
//       return cb(null, true);
//     }
//     cb(new Error('Invalid file type. Only JPEG, PNG, PDF, and DOC files are allowed.'));
//   },
// });

// // ============================================
// // DOCTOR ROUTES (Order Tests)
// // ============================================

// /**
//  * @route   POST /api/test-orders
//  * @desc    Create a new test order
//  * @access  Doctor
//  */

// router.post(
//   '/',
//   authenticate,
//   requireHealthcareWorker,
//   [
//     body('patientId').notEmpty().withMessage('Patient ID is required'),
//     body('testType').trim().notEmpty().withMessage('Test type is required'),
//     body('departmentId').notEmpty().withMessage('Department is required'),
//     body('amount').isNumeric().withMessage('Amount must be a number'),
//     validate,
//   ],
//   async (req, res) => {
//     try {
//       const {
//         patientId,
//         testType,
//         departmentId,
//         amount,
//         description,
//         urgency,
//       } = req.body;

//       // Verify patient exists
//       const patient = await User.findOne({
//         _id: patientId,
//         role: 'patient',
//       });

//       if (!patient) {
//         return res.status(404).json({
//           error: 'Not Found',
//           message: 'Patient not found',
//         });
//       }

//       // Verify department exists and belongs to hospital
//       const department = await Department.findOne({
//         _id: departmentId,
//         hospitalId: req.hospitalId,
//       });

//       if (!department) {
//         return res.status(404).json({
//           error: 'Not Found',
//           message: 'Department not found',
//         });
//       }

//       // Create test order with correct field names
//       const testOrder = await TestOrder.create({
//         patientId,
//         orderedBy: req.userId, // ✅ orderedBy instead of doctorId
//         hospitalId: req.hospitalId,
//         departmentId,
//         testName: testType, // ✅ testName
//         testType: testType, // ✅ testType
//         testDescription: description, // ✅ testDescription
//         paymentAmount: amount, // ✅ paymentAmount
//         urgency: urgency || 'routine',
//         paymentRequired: true,
//         paymentStatus: 'pending',
//         status: 'pending_payment',
//         orderedDate: new Date(),
//       });

//       const populatedOrder = await TestOrder.findById(testOrder._id)
//         .populate('patientId', 'firstName lastName email phone')
//         .populate('orderedBy', 'firstName lastName specialization') // ✅ orderedBy
//         .populate('departmentId', 'name code')
//         .populate('hospitalId', 'name');

//       res.status(201).json({
//         message: 'Test order created successfully',
//         data: populatedOrder,
//       });
//     } catch (error) {
//       console.error('Create test order error:', error);
//       res.status(500).json({
//         error: 'Creation failed',
//         message: error.message,
//       });
//     }
//   }
// );




// /**
//  * @route   GET /api/test-orders/patient/:patientId
//  * @desc    Get all test orders for a patient
//  * @access  Doctor, Nurse, Patient (own data)
//  */
// router.get('/patient/:patientId', authenticate, canAccessPatient, async (req, res) => {
//   try {
//     const { patientId } = req.params;

//     const testOrders = await TestOrder.find({ patientId })
//       .populate('orderedBy', 'firstName lastName specialization')
//       .populate('departmentId', 'name code')
//       .populate('hospitalId', 'name')
//       .populate('resultUploadedBy', 'firstName lastName')
//       .sort({ orderedDate: -1 });

//     res.json({
//       count: testOrders.length,
//       data: testOrders,
//     });
//   } catch (error) {
//     console.error('Fetch test orders error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch test orders',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   GET /api/test-orders/doctor/my-orders
//  * @desc    Get all test orders created by current doctor
//  * @access  Doctor
//  */
// router.get('/doctor/my-orders', authenticate, requireHealthcareWorker, async (req, res) => {
//   try {
//     const { status, departmentId } = req.query;
    
//     const query = {
//       orderedBy: req.userId,
//       hospitalId: req.hospitalId,
//     };

//     if (status) query.status = status;
//     if (departmentId) query.departmentId = departmentId;

//     const testOrders = await TestOrder.find(query)
//       .populate('patientId', 'firstName lastName email phone')
//       .populate('departmentId', 'name code')
//       .populate('resultUploadedBy', 'firstName lastName')
//       .sort({ orderedDate: -1 });

//     res.json({
//       count: testOrders.length,
//       data: testOrders,
//     });
//   } catch (error) {
//     console.error('Fetch doctor orders error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch orders',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   PUT /api/test-orders/:orderId/cancel
//  * @desc    Cancel a test order
//  * @access  Doctor (who created it)
//  */
// router.put(
//   '/:orderId/cancel',
//   authenticate,
//   requireHealthcareWorker,
//   [
//     body('reason').trim().notEmpty().withMessage('Cancellation reason is required'),
//     validate,
//   ],
//   async (req, res) => {
//     try {
//       const { orderId } = req.params;
//       const { reason } = req.body;

//       const testOrder = await TestOrder.findById(orderId);

//       if (!testOrder) {
//         return res.status(404).json({
//           error: 'Not Found',
//           message: 'Test order not found',
//         });
//       }

//       // Only the doctor who ordered can cancel (or hospital admin)
//       if (testOrder.orderedBy.toString() !== req.userId.toString() &&
//           req.user.role !== 'hospital_admin') {
//         return res.status(403).json({
//           error: 'Forbidden',
//           message: 'You can only cancel your own orders',
//         });
//       }

//       // Can't cancel completed tests
//       if (testOrder.status === 'completed') {
//         return res.status(400).json({
//           error: 'Invalid Status',
//           message: 'Cannot cancel completed test',
//         });
//       }

//       await testOrder.cancelOrder(req.userId, reason);

//       res.json({
//         message: 'Test order cancelled',
//         data: testOrder,
//       });
//     } catch (error) {
//       console.error('Cancel test order error:', error);
//       res.status(500).json({
//         error: 'Cancellation failed',
//         message: error.message,
//       });
//     }
//   }
// );

// // ============================================
// // DEPARTMENT STAFF ROUTES
// // ============================================

// /**
//  * @route   GET /api/test-orders/department/pending
//  * @desc    Get pending test orders for department (payment pending)
//  * @access  Department Staff
//  */
// router.get('/department/pending', authenticate, requireDepartmentStaff, async (req, res) => {
//   try {
//     if (!req.departmentId) {
//       return res.status(400).json({
//         error: 'Bad Request',
//         message: 'Department ID not found',
//       });
//     }

//     const testOrders = await TestOrder.findPendingForDepartment(req.departmentId);

//     res.json({
//       count: testOrders.length,
//       data: testOrders,
//     });
//   } catch (error) {
//     console.error('Fetch pending tests error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch pending tests',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   GET /api/test-orders/department/ready
//  * @desc    Get test orders ready for upload (payment confirmed)
//  * @access  Department Staff
//  */
// router.get('/department/ready', authenticate, requireDepartmentStaff, async (req, res) => {
//   try {
//     if (!req.departmentId) {
//       return res.status(400).json({
//         error: 'Bad Request',
//         message: 'Department ID not found',
//       });
//     }

//     const testOrders = await TestOrder.findReadyForUpload(req.departmentId);

//     res.json({
//       count: testOrders.length,
//       data: testOrders,
//     });
//   } catch (error) {
//     console.error('Fetch ready tests error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch ready tests',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   GET /api/test-orders/department/completed
//  * @desc    Get completed test orders for department
//  * @access  Department Staff
//  */
// router.get('/department/completed', authenticate, requireDepartmentStaff, async (req, res) => {
//   try {
//     if (!req.departmentId) {
//       return res.status(400).json({
//         error: 'Bad Request',
//         message: 'Department ID not found',
//       });
//     }

//     const testOrders = await TestOrder.find({
//       departmentId: req.departmentId,
//       status: 'completed',
//     })
//       .populate('patientId', 'firstName lastName')
//       .populate('orderedBy', 'firstName lastName')
//       .populate('resultUploadedBy', 'firstName lastName')
//       .sort({ completedDate: -1 })
//       .limit(50);

//     res.json({
//       count: testOrders.length,
//       data: testOrders,
//     });
//   } catch (error) {
//     console.error('Fetch completed tests error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch completed tests',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   PUT /api/test-orders/:orderId/start
//  * @desc    Mark test as in progress
//  * @access  Department Staff
//  */
// router.put('/:orderId/start', authenticate, requireDepartmentStaff, async (req, res) => {
//   try {
//     const { orderId } = req.params;

//     const testOrder = await TestOrder.findById(orderId);

//     if (!testOrder) {
//       return res.status(404).json({
//         error: 'Not Found',
//         message: 'Test order not found',
//       });
//     }

//     // Check department access
//     if (testOrder.departmentId.toString() !== req.departmentId.toString()) {
//       return res.status(403).json({
//         error: 'Forbidden',
//         message: 'You can only access tests for your department',
//       });
//     }

//     // Check payment status
//     if (testOrder.paymentStatus !== 'paid' && testOrder.paymentStatus !== 'waived') {
//       return res.status(400).json({
//         error: 'Payment Required',
//         message: 'Test cannot be started until payment is confirmed',
//       });
//     }

//     testOrder.status = 'in_progress';
//     await testOrder.save();

//     res.json({
//       message: 'Test marked as in progress',
//       data: testOrder,
//     });
//   } catch (error) {
//     console.error('Start test error:', error);
//     res.status(500).json({
//       error: 'Failed to start test',
//       message: error.message,
//     });
//   }
// });

// /**
//  * @route   PUT /api/test-orders/:orderId/upload-result
//  * @desc    Upload test result
//  * @access  Department Staff
//  */
// router.put(
//   '/:orderId/upload-result',
//   authenticate,
//   requireDepartmentStaff,
//   upload.single('resultFile'),
//   [
//     body('result').optional().trim(),
//     body('resultNotes').optional().trim(),
//     body('normalRange').optional().trim(),
//     body('abnormalFlag').optional().isBoolean(),
//     validate,
//   ],
//   async (req, res) => {
//     try {
//       const { orderId } = req.params;
//       const { result, resultNotes, normalRange, abnormalFlag } = req.body;

//       const testOrder = await TestOrder.findById(orderId);

//       if (!testOrder) {
//         return res.status(404).json({
//           error: 'Not Found',
//           message: 'Test order not found',
//         });
//       }

//       // Check department access
//       if (testOrder.departmentId.toString() !== req.departmentId.toString()) {
//         return res.status(403).json({
//           error: 'Forbidden',
//           message: 'You can only upload results for your department',
//         });
//       }

//       // Check if can upload
//       if (!testOrder.canUploadResult) {
//         return res.status(400).json({
//           error: 'Cannot Upload',
//           message: 'Payment must be confirmed before uploading results',
//           paymentStatus: testOrder.paymentStatus,
//         });
//       }

//       const resultData = {
//         result: result || 'See attached file',
//         notes: resultNotes,
//         fileUrl: req.file ? `/uploads/test-results/${req.file.filename}` : null,
//         fileType: req.file ? path.extname(req.file.filename).substring(1) : null,
//         normalRange,
//         abnormalFlag: abnormalFlag === 'true' || abnormalFlag === true,
//       };

//       await testOrder.uploadResult(resultData, req.userId);

//       const populatedOrder = await TestOrder.findById(orderId)
//         .populate('patientId', 'firstName lastName email')
//         .populate('orderedBy', 'firstName lastName email')
//         .populate('resultUploadedBy', 'firstName lastName');

//       // TODO: Send notification to doctor
//       // TODO: Send notification to patient

//       res.json({
//         message: 'Test result uploaded successfully',
//         data: populatedOrder,
//       });
//     } catch (error) {
//       console.error('Upload result error:', error);
//       res.status(500).json({
//         error: 'Upload failed',
//         message: error.message,
//       });
//     }
//   }
// );

// // ============================================
// // PAYMENT ROUTES (Patient/Admin)
// // ============================================

// /**
//  * @route   POST /api/test-orders/:orderId/mark-paid
//  * @desc    Mark test order as paid (for testing - replace with real payment gateway)
//  * @access  Patient (own orders), Hospital Admin
//  */
// router.post(
//   '/:orderId/mark-paid',
//   authenticate,
//   [
//     body('paymentMethod').isIn(['cash', 'card', 'insurance', 'bank_transfer', 'mobile_money']),
//     body('paymentReference').optional().trim(),
//     validate,
//   ],
//   async (req, res) => {
//     try {
//       const { orderId } = req.params;
//       const { paymentMethod, paymentReference } = req.body;

//       const testOrder = await TestOrder.findById(orderId);

//       if (!testOrder) {
//         return res.status(404).json({
//           error: 'Not Found',
//           message: 'Test order not found',
//         });
//       }

//       // Check access - patient can pay own orders, hospital admin can mark any
//       if (req.user.role === 'patient' && 
//           testOrder.patientId.toString() !== req.userId.toString()) {
//         return res.status(403).json({
//           error: 'Forbidden',
//           message: 'You can only pay for your own tests',
//         });
//       }

//       if (req.user.role !== 'hospital_admin' && 
//           req.user.role !== 'patient') {
//         return res.status(403).json({
//           error: 'Forbidden',
//           message: 'Insufficient permissions',
//         });
//       }

//       if (testOrder.paymentStatus === 'paid') {
//         return res.status(400).json({
//           error: 'Already Paid',
//           message: 'This test has already been paid for',
//         });
//       }

//       await testOrder.markAsPaid({
//         method: paymentMethod,
//         reference: paymentReference || `PAY-${Date.now()}`,
//         paidBy: req.userId,
//       });

//       // TODO: Send payment confirmation email
//       // TODO: Notify department staff

//       res.json({
//         message: 'Payment confirmed successfully',
//         data: testOrder,
//       });
//     } catch (error) {
//       console.error('Mark paid error:', error);
//       res.status(500).json({
//         error: 'Payment confirmation failed',
//         message: error.message,
//       });
//     }
//   }
// );

// /**
//  * @route   GET /api/test-orders/:orderId
//  * @desc    Get single test order details
//  * @access  Doctor (who ordered), Patient (own), Department Staff (own dept), Hospital Admin
//  */
// router.get('/:orderId', authenticate, async (req, res) => {
//   try {
//     const { orderId } = req.params;

//     const testOrder = await TestOrder.findById(orderId)
//       .populate('patientId', 'firstName lastName email phone')
//       .populate('orderedBy', 'firstName lastName specialization email')
//       .populate('departmentId', 'name code phone')
//       .populate('hospitalId', 'name')
//       .populate('resultUploadedBy', 'firstName lastName')
//       .populate('paidBy', 'firstName lastName');

//     if (!testOrder) {
//       return res.status(404).json({
//         error: 'Not Found',
//         message: 'Test order not found',
//       });
//     }

//     // Check access
//     const canAccess = 
//       req.user.role === 'super_admin' ||
//       req.user.role === 'hospital_admin' ||
//       testOrder.orderedBy._id.toString() === req.userId.toString() ||
//       testOrder.patientId._id.toString() === req.userId.toString() ||
//       (req.user.role === 'department_staff' && 
//        testOrder.departmentId._id.toString() === req.departmentId.toString());

//     if (!canAccess) {
//       return res.status(403).json({
//         error: 'Forbidden',
//         message: 'You do not have permission to view this test order',
//       });
//     }

//     res.json({ data: testOrder });
//   } catch (error) {
//     console.error('Fetch test order error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch test order',
//       message: error.message,
//     });
//   }
// });

// module.exports = router;