// backend/src/models/Hospital.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const HospitalSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      unique: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: [true, 'Registration number is required'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },

    // Address
    address: {
      street: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, required: true, trim: true },
    },

    // Subscription & Billing
    subscriptionPlan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free',
    },
    subscriptionStatus: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'expired'],
      default: 'pending',
      index: true,
    },
    subscriptionStartDate: Date,
    subscriptionExpiry: Date,
    billingEmail: String,

    // Approval Status
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    rejectionReason: String,

    // Hospital Admin
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Settings & Customization
    logo: String,
    website: String,
    description: String,
    
    // Features & Permissions
    features: {
      allowCrossHospitalSharing: { type: Boolean, default: false },
      allowTelemedicine: { type: Boolean, default: false },
      allowOnlinePayments: { type: Boolean, default: true },
      allowPatientPortal: { type: Boolean, default: true },
    },

    // Statistics (for quick access)
    stats: {
      totalDoctors: { type: Number, default: 0 },
      totalNurses: { type: Number, default: 0 },
      totalPatients: { type: Number, default: 0 },
      totalDepartments: { type: Number, default: 0 },
    },

    // Operational Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    
    // Metadata
    notes: String,
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for performance
HospitalSchema.index({ approvalStatus: 1, isActive: 1 });
HospitalSchema.index({ subscriptionStatus: 1 });

// Virtual for full address
HospitalSchema.virtual('fullAddress').get(function () {
  const addr = this.address;
  return `${addr.street || ''}, ${addr.city}, ${addr.state} ${addr.zipCode || ''}, ${addr.country}`.trim();
});

// Instance method to check if hospital can share records
HospitalSchema.methods.canShareRecords = function () {
  return (
    this.approvalStatus === 'approved' &&
    this.subscriptionStatus === 'active' &&
    this.features.allowCrossHospitalSharing
  );
};

// Instance method to check if subscription is valid
HospitalSchema.methods.hasActiveSubscription = function () {
  if (this.subscriptionStatus !== 'active') return false;
  if (!this.subscriptionExpiry) return true; // Lifetime subscription
  return new Date() < this.subscriptionExpiry;
};

// Static method to find approved hospitals
HospitalSchema.statics.findApproved = function () {
  return this.find({ 
    approvalStatus: 'approved', 
    isActive: true 
  });
};

// Pre-save middleware
HospitalSchema.pre('save', function (next) {
  // Auto-update subscription status based on expiry
  if (this.subscriptionExpiry && new Date() > this.subscriptionExpiry) {
    this.subscriptionStatus = 'expired';
  }
  next();
});

const Hospital = mongoose.model('Hospital', HospitalSchema);

module.exports = Hospital;