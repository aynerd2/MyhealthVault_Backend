
// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { verifyAccessToken } = require('../utils/jwt.js');
const {User, Hospital, Department, HospitalSharing } = require('../models/index.js');





/**
 * Main authentication middleware
 * Verifies JWT token and attaches user to request
 */

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No auth header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token decoded:', decoded.userId);
    } catch (err) {
      console.error('❌ Token verification failed:', err.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    const user = await User.findById(decoded.userId)
      .populate('hospitalId', 'name approvalStatus subscriptionStatus')
      .populate('departmentId', 'name code');
    
    console.log('👤 User found:', user?.email);
    console.log('🏥 Hospital:', user?.hospitalId?.name || 'none');
    
    if (!user || !user.isActive) {
      console.log('❌ User not found or inactive');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found or inactive'
      });
    }

    // Check hospital status for non-super admins
    if (user.role !== 'super_admin' && user.hospitalId) {
      console.log('🔍 Checking hospital status...');
      console.log('   Approval:', user.hospitalId.approvalStatus);
      console.log('   Subscription:', user.hospitalId.subscriptionStatus);
      
      if (user.hospitalId.approvalStatus !== 'approved') {
        console.log('❌ Hospital not approved');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your hospital is not approved yet'
        });
      }
      
      if (user.hospitalId.subscriptionStatus !== 'active') {
        console.log('❌ Subscription not active');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Hospital subscription is not active'
        });
      }
      
      console.log('✅ Hospital checks passed');
    }

    req.user = user;
    req.userId = decoded.userId;
    req.hospitalId = user.hospitalId?._id;
    req.departmentId = user.departmentId?._id;
    
    console.log('✅ Auth middleware passed\n');
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};






// NEW: Require Super Admin
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Super admin access required'
    });
  }
  next();
};


// NEW: Require Hospital Admin
const requireHospitalAdmin = (req, res, next) => {
  if (!['super_admin', 'hospital_admin'].includes(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Hospital admin access required'
    });
  }
  next();
};

// NEW: Require Healthcare Worker (Doctor or Nurse)
const requireHealthcareWorker = (req, res, next) => {
  if (!['super_admin', 'hospital_admin', 'doctor', 'nurse'].includes(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Healthcare worker access required'
    });
  }
  next();
};

// NEW: Require Department Staff
const requireDepartmentStaff = (req, res, next) => {
  if (!['super_admin', 'hospital_admin', 'department_staff'].includes(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Department staff access required'
    });
  }
  next();
};

// NEW: Require Same Hospital
const requireSameHospital = (hospitalIdParam) => {
  return (req, res, next) => {
    // Super admin can access all
    if (req.user.role === 'super_admin') {
      return next();
    }

    const requestedHospitalId = req.params[hospitalIdParam] || req.body[hospitalIdParam];
    
    if (!requestedHospitalId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Hospital ID is required'
      });
    }

    if (req.hospitalId.toString() !== requestedHospitalId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own hospital data'
      });
    }

    next();
  };
};

// NEW: Require Same Department
const requireSameDepartment = (departmentIdParam) => {
  return (req, res, next) => {
    // Super admin and hospital admin can access all departments
    if (['super_admin', 'hospital_admin'].includes(req.user.role)) {
      return next();
    }

    const requestedDepartmentId = req.params[departmentIdParam] || req.body[departmentIdParam];
    
    if (!requestedDepartmentId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Department ID is required'
      });
    }

    if (!req.departmentId || req.departmentId.toString() !== requestedDepartmentId.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own department data'
      });
    }

    next();
  };
};

// NEW: Can Access Patient (checks if user can access patient's data)
const canAccessPatient = async (req, res, next) => {
  try {
    const patientId = req.params.patientId || req.body.patientId;
    
    if (!patientId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Patient ID is required'
      });
    }

    const patient = await User.findById(patientId);
    
    if (!patient || patient.role !== 'patient') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found'
      });
    }

    // Super admin can access all
    if (req.user.role === 'super_admin') {
      req.patient = patient;
      return next();
    }

    // Patients can access their own data
    if (req.user.role === 'patient' && req.userId.toString() === patientId.toString()) {
      req.patient = patient;
      return next();
    }

    // Healthcare workers can access patients in their hospital
    if (['hospital_admin', 'doctor', 'nurse'].includes(req.user.role)) {
      if (req.hospitalId.toString() === patient.hospitalId.toString()) {
        req.patient = patient;
        return next();
      }
      
      // Check if cross-hospital sharing is enabled
      const HospitalSharing = require('../models/HospitalSharing');
      const canAccess = await HospitalSharing.canAccess(req.hospitalId, patient.hospitalId);
      
      if (canAccess) {
        req.patient = patient;
        return next();
      }
    }

    // Department staff can only access via test orders
    if (req.user.role === 'department_staff') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Department staff cannot directly access patient records'
      });
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this patient data'
    });
  } catch (error) {
    console.error('Patient access check error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check patient access'
    });
  }
};


/**
 * Optional authentication
 * Attaches user if token is valid, but doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive) {
      req.user = user;
      req.userId = user._id;
      req.userRole = user.role;
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Require specific role(s)
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};


/**
 * Require patient role
 */
const requirePatient = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'patient') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied. Patient access required.'
    });
  }

  next();
};


/**
 * Check if user can modify patient data
 */
const canModifyPatientData = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Only doctors and admins can modify patient data
  if (!['doctor', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only doctors can modify patient data'
    });
  }

  next();
};

/**
 * Require email verification
 */
const requireEmailVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      error: 'Email not verified',
      message: 'Please verify your email address to continue'
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requireHealthcareWorker,
  requirePatient,
  canAccessPatient,
  canModifyPatientData,
  requireEmailVerified,
  requireSuperAdmin,
  requireHospitalAdmin,
  requireHealthcareWorker,
  requireDepartmentStaff,
  requireSameHospital,
  requireSameDepartment,

};















