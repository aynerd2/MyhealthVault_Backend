
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false 
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  role: {
    type: String,
    enum: [
      'super_admin',      // Platform level (approves hospitals)
      'hospital_admin',   // Hospital level (approves workers)
      'doctor',
      'nurse',
      'department_staff', // NEW: Lab techs, radiologists, etc.
      'patient',
      'pending_approval'
    ],
    default: 'patient',
    required: true,
    index: true,
  },


 hospitalId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Hospital',
    index: true
  },

 departmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department',
    index: true
  },
  
  // NEW: Department Role (for department staff)
  departmentRole: {
    type: String,
    enum: ['lab_technician', 'radiologist', 'pharmacist', 'receptionist', 'other']
  },
  





  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  appliedRole: {
    type: String,
    enum: ['doctor', 'nurse']
  },
  appliedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,

  // Patient-specific fields
  dateOfBirth: {
    type: Date,
    required: function() {
      return this.role === 'patient';
    }
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: function() {
      return this.role === 'patient';
    }
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  phone: String,
  address: String,
  emergencyContact: String,



  // Healthcare worker fields
  licenseNumber: {
    type: String,
    required: function() {
      return ['doctor', 'nurse', 'pending_approval'].includes(this.role);
    }
  },
  specialization: {
    type: String,
    required: function() {
      return ['doctor', 'nurse', 'pending_approval'].includes(this.role);
    }
  },


  // hospitalAffiliation: {
  //   type: String,
  //   required: function() {
  //     return ['doctor', 'nurse', 'pending_approval'].includes(this.role);
  //   }
  // },
  
  licenseVerificationDoc: String,
  verificationNotes: String,

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,

  // Password reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  // Security
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,

  // MFA
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  mfaSecret: String,

}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ approvalStatus: 1 });
userSchema.index({ hospitalId: 1, role: 1 });
userSchema.index({ departmentId: 1, role: 1 });
userSchema.index({ hospitalId: 1, departmentId: 1 });

// Virtual for account locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified
  if (!this.isModified('password')) return next();

  try {
    // Check if password is already hashed (bcrypt hashes start with $2)
    if (this.password && this.password.startsWith('$2')) {
      // Already hashed, skip
      return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Increment login attempts
userSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }



  // Otherwise increment
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Generate email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const crypto = require('crypto');
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return verificationToken;
};

// Transform output (remove sensitive data)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpires;
  delete user.emailVerificationToken;
  delete user.emailVerificationExpires;
  delete user.mfaSecret;
  delete user.loginAttempts;
  delete user.lockUntil;
  return user;
};







// NEW: Instance method to check if user belongs to hospital
userSchema.methods.belongsToHospital = function (hospitalId) {
  return this.hospitalId && this.hospitalId.toString() === hospitalId.toString();
};

// NEW: Instance method to check if user can access patient records
userSchema.methods.canAccessPatientRecords = function (patientHospitalId) {
  // Super admin can access all
  if (this.role === 'super_admin') return true;
  
  // Hospital admin, doctors, nurses can access their hospital's patients
  if (['hospital_admin', 'doctor', 'nurse'].includes(this.role)) {
    return this.belongsToHospital(patientHospitalId);
  }
  
  // Department staff can only access via test orders
  return false;
};

// NEW: Static method to find by hospital
userSchema.statics.findByHospital = function (hospitalId, role) {
  const query = { hospitalId, isActive: true };
  if (role) query.role = role;
  return this.find(query);
};







const User = mongoose.model('User', userSchema);

module.exports = User;