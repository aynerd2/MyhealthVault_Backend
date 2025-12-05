// backend/src/routes/patient.routes.js

const express = require('express');
const router = express.Router();
const { authenticate, requireHealthcareWorker } = require('../middleware/auth.js');
const { User, HospitalSharing } = require('../models/index.js');

/**
 * @route   GET /api/patients/search
 * @desc    Search patients by name, email, or phone
 * @access  Healthcare Workers (doctors, nurses)
 */
// backend/src/routes/patient.routes.js - FIND THE SEARCH ROUTE AND UPDATE

router.get('/search', authenticate, requireHealthcareWorker, async (req, res) => {
  try {
    const { q } = req.query;

    console.log('🔍 Patient Search:');
    console.log('   Query:', q);
    console.log('   User Hospital ID:', req.hospitalId);

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Invalid Query',
        message: 'Search query must be at least 2 characters',
      });
    }

    // Simple search - only in doctor's hospital
    const searchQuery = {
      role: 'patient',
      hospitalId: req.hospitalId,
      isActive: true,
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ],
    };

    console.log('   Search Query:', JSON.stringify(searchQuery, null, 2));

    const patients = await User.find(searchQuery)
      .select('-password')
      .limit(20)
      .sort({ firstName: 1, lastName: 1 });

    console.log(`   Found: ${patients.length} patients\n`);

    res.json({
      count: patients.length,
      data: patients,
    });
  } catch (error) {
    console.error('Patient search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
    });
  }
});
/**
 * @route   GET /api/patients/:patientId
 * @desc    Get patient details
 * @access  Healthcare Workers
 */
router.get('/:patientId', authenticate, requireHealthcareWorker, async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await User.findOne({
      _id: patientId,
      role: 'patient',
      isActive: true,
    }).select('-password');

    if (!patient) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Patient not found',
      });
    }

    // Check if healthcare worker can access this patient
    if (req.user.role !== 'super_admin' && 
        patient.hospitalId.toString() !== req.hospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access patients in your hospital',
      });
    }

    res.json({
      data: patient,
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({
      error: 'Failed to fetch patient',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/patients
 * @desc    Get all patients in hospital
 * @access  Healthcare Workers
 */
router.get('/', authenticate, requireHealthcareWorker, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    const patients = await User.find({
      role: 'patient',
      isActive: true,
      hospitalId: req.hospitalId,
    })
      .select('-password')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({
      role: 'patient',
      isActive: true,
      hospitalId: req.hospitalId,
    });

    res.json({
      count: patients.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: patients,
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      error: 'Failed to fetch patients',
      message: error.message,
    });
  }
});

module.exports = router;