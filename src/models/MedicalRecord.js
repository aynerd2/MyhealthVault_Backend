// models/MedicalRecord.js - MODIFIED

const MedicalRecordSchema = new mongoose.Schema({
  // Patient & Doctor
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // NEW: Hospital & Department tracking
  hospitalId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Hospital', 
    required: true,
    index: true 
  },
  departmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department',
    index: true 
  },
  
  // Visit information
  visitDate: { type: Date, required: true },
  visitType: String,
  
  // Medical details
  diagnosis: { type: String, required: true },
  symptoms: String,
  treatment: String,
  notes: String,
  
  // Vital signs
  vitalSigns: {
    bloodPressure: String,
    heartRate: Number,
    temperature: Number,
    weight: Number,
    height: Number,
  },
  
  // Associated test orders
  testOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestOrder' }],
  
  // Visibility (NEW - for cross-hospital sharing)
  isSharedCrossHospital: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes
MedicalRecordSchema.index({ patientId: 1, hospitalId: 1, visitDate: -1 });
MedicalRecordSchema.index({ doctorId: 1, departmentId: 1 });