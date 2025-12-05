
const { AuditLog } = require('../models');

/**
 * LOG AUDIT FUNCTION
 * Saves a record of who did what, when, and where
 * 
 * @param {ObjectId} userId - MongoDB ID of the user
 * @param {string} action - What they did (CREATE, READ, UPDATE, DELETE, UPLOAD)
 * @param {string} resourceType - Type of data
 * @param {string} resourceId - ID of the specific item
 * @param {object} req - Express request object
 * @param {string} details - Optional extra information
 * @param {ObjectId} affectedPatientId - Patient affected by this action
 */
async function logAudit(userId, action, resourceType, resourceId, req, details = null, affectedPatientId = null) {
  try {
    // Get user's IP address
    const ipAddress = 
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      req.ip;

    // Get user's browser info
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Get user role from request
    const userRole = req.user ? req.user.role : 'unknown';

    // Save the audit log to database
    await AuditLog.create({
      userId,
      userRole,
      action,
      resourceType,
      resourceId,
      affectedPatientId,
      ipAddress,
      userAgent,
      details,
      timestamp: new Date(),
    });

    // Also log to console for monitoring
    console.log(`[AUDIT] ${userRole.toUpperCase()} (${userId}) ${action} ${resourceType}:${resourceId}`);
  } catch (error) {
    // If audit logging fails, just log error but don't break the request
    console.error('Failed to create audit log:', error);
  }
}

/**
 * AUTOMATIC AUDIT MIDDLEWARE FOR READ OPERATIONS
 * This automatically logs when someone views data
 */
function auditRead(resourceType) {
  return async function(req, res, next) {
    // Save the original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to log after sending response
    res.json = function(data) {
      // Only log if request was successful and user is authenticated
      if (req.user && res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || req.params.patientId || 'multiple';
        const affectedPatientId = req.params.patientId || null;
        
        // Log asynchronously (don't wait for it)
        logAudit(
          req.user._id,
          'READ',
          resourceType,
          resourceId,
          req,
          null,
          affectedPatientId
        ).catch(err => console.error('Audit logging error:', err));
      }

      // Call the original json function to send response
      return originalJson(data);
    };

    next();
  };
}

/**
 * Get audit statistics for a user
 */
async function getUserAuditStats(userId) {
  try {
    const stats = await AuditLog.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    stats.forEach(item => {
      result[item._id] = item.count;
    });

    return result;
  } catch (error) {
    console.error('Failed to get audit stats:', error);
    return {};
  }
}

/**
 * Get audit trail for a specific patient
 * Shows all actions performed on a patient's data
 */
async function getPatientAuditTrail(patientId, limit = 50) {
  try {
    const logs = await AuditLog.find({
      affectedPatientId: patientId,
    })
      .populate('userId', 'firstName lastName role')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return logs;
  } catch (error) {
    console.error('Failed to get patient audit trail:', error);
    return [];
  }
}

/**
 * Get audit trail for a specific resource
 */
async function getResourceAuditTrail(resourceType, resourceId, limit = 50) {
  try {
    const logs = await AuditLog.find({
      resourceType,
      resourceId,
    })
      .populate('userId', 'firstName lastName role')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return logs;
  } catch (error) {
    console.error('Failed to get resource audit trail:', error);
    return [];
  }
}

module.exports = {
  logAudit,
  auditRead,
  getUserAuditStats,
  getPatientAuditTrail,
  getResourceAuditTrail,
};
