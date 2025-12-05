// backend/src/routes/hospitalSharing.routes.js

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.js');
const {
  authenticate,
  requireSuperAdmin,
  requireHospitalAdmin,
} = require('../middleware/auth.js');
const { HospitalSharing, Hospital } = require('../models/index.js');

// ============================================
// HOSPITAL ADMIN ROUTES (Request Sharing)
// ============================================

/**
 * @route   POST /api/hospital-sharing/request
 * @desc    Request access to another hospital's records
 * @access  Hospital Admin
 */
router.post(
  '/request',
  authenticate,
  requireHospitalAdmin,
  [
    body('targetHospitalId').notEmpty().withMessage('Target hospital ID is required'),
    body('requestReason').trim().notEmpty().withMessage('Reason for request is required'),
    validate,
  ],
  async (req, res) => {
    try {
      const { targetHospitalId, requestReason, scope, specificPatients } = req.body;

      // Can't request sharing with own hospital
      if (targetHospitalId === req.hospitalId.toString()) {
        return res.status(400).json({
          error: 'Invalid Request',
          message: 'Cannot request sharing with your own hospital',
        });
      }

      // Check if target hospital exists
      const targetHospital = await Hospital.findById(targetHospitalId);
      
      if (!targetHospital) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Target hospital not found',
        });
      }

      if (targetHospital.approvalStatus !== 'approved') {
        return res.status(400).json({
          error: 'Invalid Hospital',
          message: 'Target hospital is not approved',
        });
      }

      // Check if request already exists
      const existingRequest = await HospitalSharing.findOne({
        requestingHospitalId: req.hospitalId,
        targetHospitalId,
      });

      if (existingRequest) {
        return res.status(400).json({
          error: 'Request Exists',
          message: `A sharing request already exists with status: ${existingRequest.status}`,
          data: existingRequest,
        });
      }

      // Create sharing request
      const sharingRequest = await HospitalSharing.create({
        requestingHospitalId: req.hospitalId,
        targetHospitalId,
        requestReason,
        requestedBy: req.userId,
        scope: scope || 'full',
        specificPatients: specificPatients || [],
      });

      const populatedRequest = await HospitalSharing.findById(sharingRequest._id)
        .populate('requestingHospitalId', 'name email')
        .populate('targetHospitalId', 'name email')
        .populate('requestedBy', 'firstName lastName email');

      // TODO: Send notification to super admin

      res.status(201).json({
        message: 'Sharing request submitted successfully',
        data: populatedRequest,
      });
    } catch (error) {
      console.error('Create sharing request error:', error);
      res.status(500).json({
        error: 'Request failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/hospital-sharing/my-requests
 * @desc    Get all sharing requests made by current hospital
 * @access  Hospital Admin
 */
router.get('/my-requests', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const requests = await HospitalSharing.find({
      requestingHospitalId: req.hospitalId,
    })
      .populate('targetHospitalId', 'name email')
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });

    res.json({
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({
      error: 'Failed to fetch requests',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/hospital-sharing/requests-for-my-hospital
 * @desc    Get all sharing requests targeting current hospital
 * @access  Hospital Admin
 */
router.get('/requests-for-my-hospital', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const requests = await HospitalSharing.find({
      targetHospitalId: req.hospitalId,
    })
      .populate('requestingHospitalId', 'name email')
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });

    res.json({
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({
      error: 'Failed to fetch requests',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/hospital-sharing/accessible-hospitals
 * @desc    Get list of hospitals that current hospital can access
 * @access  Hospital Admin, Doctors
 */
router.get('/accessible-hospitals', authenticate, async (req, res) => {
  try {
    if (!req.hospitalId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Hospital ID not found',
      });
    }

    const approvedSharing = await HospitalSharing.find({
      requestingHospitalId: req.hospitalId,
      status: 'approved',
      isActive: true,
    }).populate('targetHospitalId', 'name email address');

    const accessibleHospitals = approvedSharing
      .filter((sharing) => !sharing.isExpired)
      .map((sharing) => sharing.targetHospitalId);

    res.json({
      count: accessibleHospitals.length,
      data: accessibleHospitals,
    });
  } catch (error) {
    console.error('Fetch accessible hospitals error:', error);
    res.status(500).json({
      error: 'Failed to fetch accessible hospitals',
      message: error.message,
    });
  }
});

/**
 * @route   DELETE /api/hospital-sharing/:sharingId
 * @desc    Cancel a sharing request (only if pending)
 * @access  Hospital Admin
 */
router.delete('/:sharingId', authenticate, requireHospitalAdmin, async (req, res) => {
  try {
    const { sharingId } = req.params;

    const sharing = await HospitalSharing.findById(sharingId);

    if (!sharing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Sharing request not found',
      });
    }

    // Only requesting hospital can cancel
    if (sharing.requestingHospitalId.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only cancel your own requests',
      });
    }

    // Can only cancel pending requests
    if (sharing.status !== 'pending') {
      return res.status(400).json({
        error: 'Invalid Status',
        message: 'Can only cancel pending requests',
      });
    }

    await sharing.deleteOne();

    res.json({
      message: 'Sharing request cancelled',
    });
  } catch (error) {
    console.error('Cancel sharing request error:', error);
    res.status(500).json({
      error: 'Cancellation failed',
      message: error.message,
    });
  }
});

// ============================================
// SUPER ADMIN ROUTES (Approve/Reject)
// ============================================

/**
 * @route   GET /api/hospital-sharing/pending
 * @desc    Get all pending sharing requests
 * @access  Super Admin
 */
router.get('/pending', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const pendingRequests = await HospitalSharing.findPendingRequests();

    res.json({
      count: pendingRequests.length,
      data: pendingRequests,
    });
  } catch (error) {
    console.error('Fetch pending requests error:', error);
    res.status(500).json({
      error: 'Failed to fetch pending requests',
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/hospital-sharing/:sharingId/approve
 * @desc    Approve a sharing request
 * @access  Super Admin
 */
router.post(
  '/:sharingId/approve',
  authenticate,
  requireSuperAdmin,
  [
    body('expiresAt').optional().isISO8601().withMessage('Invalid expiration date'),
    body('notes').optional().trim(),
    validate,
  ],
  async (req, res) => {
    try {
      const { sharingId } = req.params;
      const { expiresAt, notes } = req.body;

      const sharing = await HospitalSharing.findById(sharingId)
        .populate('requestingHospitalId', 'name email')
        .populate('targetHospitalId', 'name email');

      if (!sharing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Sharing request not found',
        });
      }

      if (sharing.status !== 'pending') {
        return res.status(400).json({
          error: 'Invalid Status',
          message: 'Only pending requests can be approved',
        });
      }

      // Check if both hospitals are approved and have active subscriptions
      const requestingHospital = await Hospital.findById(sharing.requestingHospitalId);
      const targetHospital = await Hospital.findById(sharing.targetHospitalId);

      if (!requestingHospital.canShareRecords() || !targetHospital.canShareRecords()) {
        return res.status(400).json({
          error: 'Invalid Hospitals',
          message: 'Both hospitals must be approved and have active subscriptions',
        });
      }

      await sharing.approve(req.userId, notes);

      if (expiresAt) {
        sharing.expiresAt = new Date(expiresAt);
        await sharing.save();
      }

      // TODO: Send approval notification to both hospitals

      res.json({
        message: 'Sharing request approved',
        data: sharing,
      });
    } catch (error) {
      console.error('Approve sharing error:', error);
      res.status(500).json({
        error: 'Approval failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/hospital-sharing/:sharingId/reject
 * @desc    Reject a sharing request
 * @access  Super Admin
 */
router.post(
  '/:sharingId/reject',
  authenticate,
  requireSuperAdmin,
  [
    body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
    validate,
  ],
  async (req, res) => {
    try {
      const { sharingId } = req.params;
      const { reason } = req.body;

      const sharing = await HospitalSharing.findById(sharingId);

      if (!sharing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Sharing request not found',
        });
      }

      if (sharing.status !== 'pending') {
        return res.status(400).json({
          error: 'Invalid Status',
          message: 'Only pending requests can be rejected',
        });
      }

      await sharing.reject(req.userId, reason);

      // TODO: Send rejection notification

      res.json({
        message: 'Sharing request rejected',
        data: sharing,
      });
    } catch (error) {
      console.error('Reject sharing error:', error);
      res.status(500).json({
        error: 'Rejection failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/hospital-sharing/:sharingId/revoke
 * @desc    Revoke an approved sharing
 * @access  Super Admin
 */
router.post(
  '/:sharingId/revoke',
  authenticate,
  requireSuperAdmin,
  [
    body('reason').trim().notEmpty().withMessage('Revocation reason is required'),
    validate,
  ],
  async (req, res) => {
    try {
      const { sharingId } = req.params;
      const { reason } = req.body;

      const sharing = await HospitalSharing.findById(sharingId);

      if (!sharing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Sharing not found',
        });
      }

      if (sharing.status !== 'approved') {
        return res.status(400).json({
          error: 'Invalid Status',
          message: 'Only approved sharing can be revoked',
        });
      }

      await sharing.revoke(req.userId, reason);

      // TODO: Send revocation notification

      res.json({
        message: 'Sharing revoked successfully',
        data: sharing,
      });
    } catch (error) {
      console.error('Revoke sharing error:', error);
      res.status(500).json({
        error: 'Revocation failed',
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/hospital-sharing
 * @desc    Get all sharing relationships (with filters)
 * @access  Super Admin
 */
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { status, requestingHospitalId, targetHospitalId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (requestingHospitalId) query.requestingHospitalId = requestingHospitalId;
    if (targetHospitalId) query.targetHospitalId = targetHospitalId;

    const sharings = await HospitalSharing.find(query)
      .populate('requestingHospitalId', 'name email')
      .populate('targetHospitalId', 'name email')
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });

    res.json({
      count: sharings.length,
      data: sharings,
    });
  } catch (error) {
    console.error('Fetch sharings error:', error);
    res.status(500).json({
      error: 'Failed to fetch sharing relationships',
      message: error.message,
    });
  }
});

module.exports = router;