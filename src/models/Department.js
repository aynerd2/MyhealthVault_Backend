// backend/src/models/Department.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DepartmentSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      uppercase: true,
      trim: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },

    // Department Details
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'radiology',
        'laboratory',
        'cardiology',
        'neurology',
        'orthopedics',
        'pediatrics',
        'emergency',
        'surgery',
        'pharmacy',
        'other',
      ],
      default: 'other',
    },

    // Contact Information
    phone: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    location: String, // Building/Floor info

    // Department Head
    head: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Services Offered
    services: [
      {
        name: String,
        description: String,
        price: Number,
        duration: Number, // in minutes
        isActive: { type: Boolean, default: true },
      },
    ],

    // Department Login (for unit access)
    departmentLoginEnabled: {
      type: Boolean,
      default: true,
    },
    departmentEmail: {
      type: String,
      unique: true,
      sparse: true, // Allows null values while maintaining uniqueness
      lowercase: true,
      trim: true,
    },
    departmentPassword: {
      type: String,
      select: false, // Don't return password by default
    },

    // Operating Hours
    operatingHours: {
      monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
      tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
      wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
      thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
      friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
      saturday: { open: String, close: String, isOpen: { type: Boolean, default: false } },
      sunday: { open: String, close: String, isOpen: { type: Boolean, default: false } },
    },

    // Statistics
    stats: {
      totalStaff: { type: Number, default: 0 },
      totalTestsCompleted: { type: Number, default: 0 },
      totalTestsPending: { type: Number, default: 0 },
    },

    // Settings
    settings: {
      requirePaymentBeforeUpload: { type: Boolean, default: true },
      autoNotifyDoctor: { type: Boolean, default: true },
      allowUrgentTests: { type: Boolean, default: true },
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: Unique department code per hospital
DepartmentSchema.index({ hospitalId: 1, code: 1 }, { unique: true });
DepartmentSchema.index({ hospitalId: 1, name: 1 });

// Virtual for full name (Hospital + Department)
DepartmentSchema.virtual('fullName').get(function () {
  return `${this.name} Department`;
});

// Instance method to check if currently open
DepartmentSchema.methods.isCurrentlyOpen = function () {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
  const hours = this.operatingHours[dayName];
  
  if (!hours || !hours.isOpen) return false;
  
  // Simple check - could be enhanced with actual time comparison
  return true;
};

// Instance method to hash department password
DepartmentSchema.methods.hashDepartmentPassword = async function (password) {
  this.departmentPassword = await bcrypt.hash(password, 10);
};

// Instance method to compare department password
DepartmentSchema.methods.compareDepartmentPassword = async function (password) {
  return await bcrypt.compare(password, this.departmentPassword);
};

// Pre-save middleware to hash password
DepartmentSchema.pre('save', async function (next) {
  // Only hash if password is modified and not already hashed
  if (this.isModified('departmentPassword') && this.departmentPassword) {
    // Check if already hashed (bcrypt hashes start with $2)
    if (!this.departmentPassword.startsWith('$2')) {
      this.departmentPassword = await bcrypt.hash(this.departmentPassword, 10);
    }
  }
  next();
});

// Static method to find by hospital
DepartmentSchema.statics.findByHospital = function (hospitalId) {
  return this.find({ hospitalId, isActive: true });
};

const Department = mongoose.model('Department', DepartmentSchema);

module.exports = Department;