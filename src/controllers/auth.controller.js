// backend/src/controllers/auth.controller.js
const User = require('../models/User.model.js');
const { generateTokens, generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
/**
 * Register new user
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      dateOfBirth,
      gender,
      bloodType,
      phone,
      address,
      emergencyContact,
      licenseNumber,
      specialization,
      hospitalAffiliation
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: 'User exists',
        message: 'An account with this email already exists'
      });
    }

    // Determine approval status
    let approvalStatus = 'approved';
    let finalRole = role || 'patient';
    let appliedRole = null;

    if (['doctor', 'nurse'].includes(role)) {
      approvalStatus = 'pending';
      finalRole = 'pending_approval';
      appliedRole = role;
    }

    // Create user
    const userData = {
      email,
      password,
      firstName,
      lastName,
      role: finalRole,
      approvalStatus,
      appliedRole
    };

    // Add patient-specific fields
    if (role === 'patient') {
      userData.dateOfBirth = dateOfBirth;
      userData.gender = gender;
      userData.bloodType = bloodType;
      userData.phone = phone;
      userData.address = address;
      userData.emergencyContact = emergencyContact;
    }

    // Add healthcare worker fields
    if (['doctor', 'nurse'].includes(role)) {
      userData.dateOfBirth = dateOfBirth || new Date('1990-01-01');
      userData.gender = gender || 'Other';
      userData.licenseNumber = licenseNumber;
      userData.specialization = specialization;
      userData.hospitalAffiliation = hospitalAffiliation;
      userData.phone = phone;
      userData.appliedAt = new Date();
    }

    const user = await User.create(userData);

    // If patient, generate tokens and login
    if (role === 'patient') {
      const { accessToken, refreshToken } = generateTokens(user._id, user.role);

      return res.status(201).json({
        message: 'Account created successfully',
        status: 'approved',
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        accessToken,
        refreshToken
      });
    }

    // If healthcare worker, return pending status
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
        approvalStatus: user.approvalStatus
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        message: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }

    return res.status(500).json({
      error: 'Server error',
      message: 'Registration failed'
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // Validate input
//     if (!email || !password) {
//       return res.status(400).json({
//         error: 'Validation error',
//         message: 'Email and password are required'
//       });
//     }

//     // Find user (include password field)
//     const user = await User.findOne({ email }).select('+password');
    
//     if (!user) {
//       return res.status(401).json({
//         error: 'Invalid credentials',
//         message: 'Email or password is incorrect'
//       });
//     }

//     // Check if account is locked
//     if (user.isLocked) {
//       return res.status(403).json({
//         error: 'Account locked',
//         message: 'Too many failed login attempts. Try again later.'
//       });
//     }

//     // Check if account is active
//     if (!user.isActive) {
//       return res.status(403).json({
//         error: 'Account disabled',
//         message: 'Your account has been disabled. Contact support.'
//       });
//     }

//     // Verify password
//     const isPasswordValid = await user.comparePassword(password);
    
//     if (!isPasswordValid) {
//       // Increment login attempts
//       await user.incLoginAttempts();
      
//       return res.status(401).json({
//         error: 'Invalid credentials',
//         message: 'Email or password is incorrect'
//       });
//     }

//     // Reset login attempts on successful login
//     await user.resetLoginAttempts();

//     // Check if pending approval
//     if (user.role === 'pending_approval') {
//       return res.status(403).json({
//         error: 'Account pending approval',
//         message: 'Your account is awaiting admin verification',
//         status: 'pending_approval',
//         user: {
//           id: user._id,
//           email: user.email,
//           firstName: user.firstName,
//           lastName: user.lastName,
//           role: user.role,
//           appliedRole: user.appliedRole
//         }
//       });
//     }

//     // Generate tokens
//     const { accessToken, refreshToken } = generateTokens(user._id, user.role);

//     return res.status(200).json({
//       message: 'Login successful',
//       user: {
//         id: user._id,
//         email: user.email,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         role: user.role,
//         isEmailVerified: user.isEmailVerified
//       },
//       accessToken,
//       refreshToken
//     });

//   } catch (error) {
//     console.error('Login error:', error);
//     return res.status(500).json({
//       error: 'Server error',
//       message: 'Login failed'
//     });
//   }
// };


// backend/src/controllers/auth.controller.js - LOGIN FUNCTION

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password field (it's excluded by default)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated',
      });
    }

    // ✅ POPULATE hospital and department info
    await user.populate([
      { path: 'hospitalId', select: 'name email approvalStatus subscriptionStatus' },
      { path: 'departmentId', select: 'name code' },
    ]);

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      user: userResponse,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message,
    });
  }
};



/**
 * Refresh access token
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid token',
        message: error.message
      });
    }

    // Get user
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found or inactive'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id, user.role);

    return res.status(200).json({
      message: 'Token refreshed',
      ...tokens
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Token refresh failed'
    });
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Please login again'
      });
    }

    return res.status(200).json({
      user
    });

  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch user'
    });
  }
};

/**
 * Logout (client-side token deletion)
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    // In a JWT system, logout is primarily client-side
    // But we can log the event for security audit
    
    return res.status(200).json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Logout failed'
    });
  }
};

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });

    // Don't reveal if user exists (security)
    if (!user) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // TODO: Send email with reset link
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    // await sendEmail({ to: user.email, subject: 'Password Reset', html: ... });

    console.log('Password reset token:', resetToken);
    console.log('Reset link:', `http://localhost:3000/reset-password/${resetToken}`);

    return res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent',
      // TODO: Remove this in production
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Password reset request failed'
    });
  }
};

/**
 * Reset password
 * POST /api/auth/reset-password/:token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password is required'
      });
    }

    // Hash token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'Password reset link is invalid or has expired'
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    return res.status(200).json({
      message: 'Password reset successful',
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Password reset failed'
    });
  }
};

/**
 * Change password (for logged in users)
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Current password and new password are required'
      });
    }

    // Get user with password
    const user = await User.findById(req.userId).select('+password');

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'Password change failed'
    });
  }
};

module.exports = exports;