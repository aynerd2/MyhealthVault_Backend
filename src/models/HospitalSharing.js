// backend/src/models/HospitalSharing.js

const mongoose = require('mongoose');

const HospitalSharingSchema = new mongoose.Schema(
  {
    // Requesting Hospital (wants to view records)
    requestingHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Requesting hospital ID is required'],
      index: true,
    },

    // Target Hospital (whose records will be viewed)
    targetHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Target hospital ID is required'],
      index: true,
    },

    // Approval Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revoked'],
      default: 'pending',
      index: true,
    },
    
    // Super Admin Actions
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Super Admin
    },
    approvedAt: Date,
    rejectedAt: Date,
    revokedAt: Date,
    rejectionReason: String,
    revocationReason: String,

    // Permissions (what can be shared)
    permissions: {
      canViewMedicalRecords: { type: Boolean, default: true },
      canViewTestResults: { type: Boolean, default: true },
      canViewPrescriptions: { type: Boolean, default: true },
      canViewDiagnosis: { type: Boolean, default: true },
    },

    // Sharing Scope
    scope: {
      type: String,
      enum: ['full', 'limited'], // full = all patients, limited = specific patients only
      default: 'full',
    },
    specificPatients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Expiration
    expiresAt: Date, // Optional: sharing can expire
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Request Details
    requestReason: {
      type: String,
      required: [true, 'Reason for sharing request is required'],
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Hospital Admin who requested
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },

    // Usage Tracking
    lastAccessedAt: Date,
    accessCount: {
      type: Number,
      default: 0,
    },

    // Notes
    adminNotes: String,
  },
  {
    timestamps: true,
  }
);

// Compound unique index: One request per hospital pair
HospitalSharingSchema.index(
  { requestingHospitalId: 1, targetHospitalId: 1 },
  { unique: true }
);

// Additional indexes
HospitalSharingSchema.index({ status: 1, isActive: 1 });

// Virtual for is expired
HospitalSharingSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Virtual for can access
HospitalSharingSchema.virtual('canAccess').get(function () {
  return (
    this.status === 'approved' &&
    this.isActive &&
    !this.isExpired
  );
});

// Instance method to approve sharing
HospitalSharingSchema.methods.approve = function (superAdminId, notes) {
  this.status = 'approved';
  this.approvedBy = superAdminId;
  this.approvedAt = new Date();
  this.adminNotes = notes;
  return this.save();
};

// Instance method to reject sharing
HospitalSharingSchema.methods.reject = function (superAdminId, reason) {
  this.status = 'rejected';
  this.approvedBy = superAdminId;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

// Instance method to revoke sharing
HospitalSharingSchema.methods.revoke = function (superAdminId, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revocationReason = reason;
  this.isActive = false;
  return this.save();
};

// Instance method to track access
HospitalSharingSchema.methods.recordAccess = function () {
  this.lastAccessedAt = new Date();
  this.accessCount += 1;
  return this.save();
};

// Static method to check if hospital A can access hospital B's records
HospitalSharingSchema.statics.canAccess = async function (
  requestingHospitalId,
  targetHospitalId
) {
  const sharing = await this.findOne({
    requestingHospitalId,
    targetHospitalId,
    status: 'approved',
    isActive: true,
  });

  if (!sharing) return false;
  if (sharing.isExpired) return false;

  return true;
};

// Static method to find pending requests for super admin
HospitalSharingSchema.statics.findPendingRequests = function () {
  return this.find({ status: 'pending' })
    .populate('requestingHospitalId', 'name email')
    .populate('targetHospitalId', 'name email')
    .populate('requestedBy', 'firstName lastName email')
    .sort({ requestedAt: -1 });
};

// Pre-save middleware to auto-deactivate if expired
HospitalSharingSchema.pre('save', function (next) {
  if (this.expiresAt && new Date() > this.expiresAt) {
    this.isActive = false;
  }
  next();
});

const HospitalSharing = mongoose.model('HospitalSharing', HospitalSharingSchema);

module.exports = HospitalSharing;