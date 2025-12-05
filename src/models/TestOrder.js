// backend/src/models/TestOrder.js

const mongoose = require('mongoose');

const TestOrderSchema = new mongoose.Schema(
  {
    // Patient & Doctor
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor ID is required'],
      index: true,
    },

    // Hospital & Department
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department ID is required'],
      index: true,
    },

    // Test Details
    testName: {
      type: String,
      required: [true, 'Test name is required'],
      trim: true,
    },
    testType: {
      type: String,
      required: [true, 'Test type is required'],
      trim: true,
    },
    testDescription: String,
    testInstructions: String, // Instructions for patient
    
    // Urgency
    urgency: {
      type: String,
      enum: ['routine', 'urgent', 'emergency'],
      default: 'routine',
      index: true,
    },

    // Payment Information (CRITICAL FOR WORKFLOW)
    paymentRequired: {
      type: Boolean,
      default: true,
    },
    paymentAmount: {
      type: Number,
      required: function () {
        return this.paymentRequired;
      },
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'waived'],
      default: 'pending',
      index: true,
    },
    paymentDate: Date,
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'insurance', 'bank_transfer', 'mobile_money'],
    },
    paymentReference: String,
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Test Execution Status
    status: {
      type: String,
      enum: [
        'ordered',          // Doctor just ordered
        'payment_pending',  // Waiting for payment
        'payment_failed',   // Payment failed
        'ready_for_test',   // Payment confirmed, ready to perform
        'in_progress',      // Test being performed
        'completed',        // Test done, results uploaded
        'cancelled',        // Cancelled by doctor/patient
      ],
      default: 'payment_pending',
      index: true,
    },

    // Results (filled by department staff)
    result: String,
    resultNotes: String,
    resultFileUrl: String,
    resultFileType: String, // pdf, jpg, png, etc.
    normalRange: String,
    abnormalFlag: Boolean,
    
    // Department Staff Actions
    resultUploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resultUploadedAt: Date,
    
    // Dates
    orderedDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    scheduledDate: Date,
    completedDate: Date,
    cancelledDate: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    cancellationReason: String,

    // Additional Info
    notes: String, // Doctor's notes
    internalNotes: String, // Department internal notes (not visible to patient)
    
    // Notifications
    notificationsSent: {
      orderCreated: { type: Boolean, default: false },
      paymentReceived: { type: Boolean, default: false },
      resultUploaded: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
TestOrderSchema.index({ departmentId: 1, status: 1, paymentStatus: 1 });
TestOrderSchema.index({ patientId: 1, hospitalId: 1, orderedDate: -1 });
TestOrderSchema.index({ orderedBy: 1, hospitalId: 1, orderedDate: -1 });
TestOrderSchema.index({ hospitalId: 1, status: 1 });

// Virtual for payment status indicator (for department staff UI)
TestOrderSchema.virtual('paymentStatusIndicator').get(function () {
  if (this.paymentStatus === 'paid') return 'green';
  if (this.paymentStatus === 'failed') return 'red';
  return 'yellow';
});

// Virtual for can upload result (department staff permission)
TestOrderSchema.virtual('canUploadResult').get(function () {
  return (
    (this.paymentStatus === 'paid' || this.paymentStatus === 'waived') &&
    (this.status === 'ready_for_test' || this.status === 'in_progress')
  );
});

// Instance method to mark as paid
TestOrderSchema.methods.markAsPaid = function (paymentDetails) {
  this.paymentStatus = 'paid';
  this.paymentDate = new Date();
  this.paymentMethod = paymentDetails.method;
  this.paymentReference = paymentDetails.reference;
  this.paidBy = paymentDetails.paidBy;
  this.status = 'ready_for_test';
  return this.save();
};

// Instance method to upload result
TestOrderSchema.methods.uploadResult = function (resultData, uploadedBy) {
  if (!this.canUploadResult) {
    throw new Error('Cannot upload result: Payment not confirmed');
  }
  
  this.result = resultData.result;
  this.resultNotes = resultData.notes;
  this.resultFileUrl = resultData.fileUrl;
  this.resultFileType = resultData.fileType;
  this.normalRange = resultData.normalRange;
  this.abnormalFlag = resultData.abnormalFlag;
  this.resultUploadedBy = uploadedBy;
  this.resultUploadedAt = new Date();
  this.status = 'completed';
  this.completedDate = new Date();
  
  return this.save();
};

// Instance method to cancel order
TestOrderSchema.methods.cancelOrder = function (userId, reason) {
  this.status = 'cancelled';
  this.cancelledDate = new Date();
  this.cancelledBy = userId;
  this.cancellationReason = reason;
  return this.save();
};

// Static method to find pending payment tests for department
TestOrderSchema.statics.findPendingForDepartment = function (departmentId) {
  return this.find({
    departmentId,
    status: 'payment_pending',
    paymentStatus: 'pending',
  })
    .populate('patientId', 'firstName lastName email phone')
    .populate('orderedBy', 'firstName lastName specialization')
    .sort({ orderedDate: -1 });
};

// Static method to find tests ready for upload
TestOrderSchema.statics.findReadyForUpload = function (departmentId) {
  return this.find({
    departmentId,
    paymentStatus: 'paid',
    status: { $in: ['ready_for_test', 'in_progress'] },
  })
    .populate('patientId', 'firstName lastName email phone')
    .populate('orderedBy', 'firstName lastName specialization')
    .sort({ orderedDate: -1 });
};

// Pre-save middleware to auto-update status based on payment
TestOrderSchema.pre('save', function (next) {
  // If payment just became paid, update status
  if (this.isModified('paymentStatus') && this.paymentStatus === 'paid') {
    if (this.status === 'payment_pending' || this.status === 'ordered') {
      this.status = 'ready_for_test';
    }
  }
  
  // If payment required but not set, default to payment_pending
  if (this.paymentRequired && !this.paymentStatus) {
    this.paymentStatus = 'pending';
    this.status = 'payment_pending';
  }
  
  next();
});

const TestOrder = mongoose.model('TestOrder', TestOrderSchema);

module.exports = TestOrder;