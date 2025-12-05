const mongoose = require('mongoose');
const User = require('./User.model.js');
const Hospital = require('./Hospital.js'); 
const Department = require('./Department.js'); 
const TestOrder = require('./TestOrder.js'); 
const HospitalSharing = require('./HospitalSharing.js'); 




// ==================== MEDICAL RECORD MODEL (UPDATED) ====================

const MedicalRecordSchema = new mongoose.Schema(
  {
    // Link to patient (now references User model)
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Link to doctor who created this
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Visit information
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    visitDate: {
      type: Date,
      required: true,
      index: true,
    },
    visitType: {
      type: String,
      enum: ['checkup', 'emergency', 'followup', 'consultation', 'surgery', 'other'],
      default: 'checkup',
    },
    
    // Medical details
    diagnosis: {
      type: String,
      required: true,
      trim: true,
    },
    symptoms: String,
    treatment: String,
    notes: String,
    
    // Vital signs (optional but useful)
    vitalSigns: {
      bloodPressure: String,
      heartRate: Number,
      temperature: Number,
      weight: Number,
      height: Number,
    },
    
    // Status tracking
    status: {
      type: String,
      enum: ['active', 'completed', 'followup_needed'],
      default: 'completed',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
MedicalRecordSchema.index({ patientId: 1, visitDate: -1 });
MedicalRecordSchema.index({ doctorId: 1, visitDate: -1 });
MedicalRecordSchema.index({ status: 1, visitDate: -1 });

// ==================== PRESCRIPTION MODEL (UPDATED) ====================

const PrescriptionSchema = new mongoose.Schema(
  {
    // Links
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Medication details
    medicationName: {
      type: String,
      required: true,
      trim: true,
    },
    dosage: {
      type: String,
      required: true,
      trim: true,
    },
    frequency: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: String,
      required: true,
      trim: true,
    },
    route: {
      type: String,
      enum: ['oral', 'injection', 'topical', 'inhalation', 'other'],
      default: 'oral',
    },
    
    // Hospital info
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    prescribedDate: {
      type: Date,
      required: true,
      index: true,
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    
    // Additional info
    refillsAllowed: {
      type: Number,
      default: 0,
    },
    instructions: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
PrescriptionSchema.index({ patientId: 1, isActive: 1, prescribedDate: -1 });
PrescriptionSchema.index({ doctorId: 1, prescribedDate: -1 });

// ==================== TEST RESULT MODEL (UPDATED) ====================

const TestResultSchema = new mongoose.Schema(
  {
    // Links
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // Test information
    testName: {
      type: String,
      required: true,
      trim: true,
    },
    testType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    testDate: {
      type: Date,
      required: true,
      index: true,
    },
    
    // Results
    result: {
      type: String,
      required: true,
      trim: true,
    },
    normalRange: String,
    status: {
      type: String,
      enum: ['normal', 'abnormal', 'critical', 'pending'],
      default: 'normal',
    },
    
    // Hospital info
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    labName: String,
    
    // File attachment
    fileUrl: String,
    
    // Review status
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    reviewNotes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
TestResultSchema.index({ patientId: 1, testDate: -1 });
TestResultSchema.index({ orderedBy: 1, testDate: -1 });
TestResultSchema.index({ status: 1, testDate: -1 });

// ==================== AUDIT LOG MODEL (UPDATED) ====================

const AuditLogSchema = new mongoose.Schema({
  // Who did the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  userRole: {
    type: String,
    required: true,
    index: true,
  },
  
  // What action
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'UPLOAD', 'LOGIN', 'LOGOUT'],
    index: true,
  },
  
  // What resource
  resourceType: {
    type: String,
    required: true,
    index: true,
  },
  resourceId: {
    type: String,
    required: true,
  },
  
  // Affected patient (if applicable)
  affectedPatientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  
  // Security information
  ipAddress: String,
  userAgent: String,
  
  // Additional details
  details: String,
  
  // When
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound indexes
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ affectedPatientId: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, action: 1, timestamp: -1 });

// TTL index - delete logs older than 2 years
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

// ==================== EXPORT ALL MODELS ====================


const MedicalRecord = mongoose.model('MedicalRecord', MedicalRecordSchema);
const Prescription = mongoose.model('Prescription', PrescriptionSchema);
const TestResult = mongoose.model('TestResult', TestResultSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);



module.exports = {
  User,
  MedicalRecord,
  Prescription,
  TestResult,
  AuditLog,
  Hospital,        
  Department,      
  TestOrder,      
  HospitalSharing,
};
