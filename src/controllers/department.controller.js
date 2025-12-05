// backend/src/controllers/department.controller.js

const { Department, User, Hospital } = require('../models/index.js');

/**
 * Get all departments for the hospital
 */
exports.getDepartments = async (req, res) => {
  try {
    const { hospitalId } = req;

    const departments = await Department.find({ hospitalId })
      .sort({ createdAt: -1 });

    // Get staff count for each department
    const departmentsWithCounts = await Promise.all(
      departments.map(async (dept) => {
        const staffCount = await User.countDocuments({
          departmentId: dept._id,
          isActive: true,
        });

        return {
          ...dept.toObject(),
          staffCount,
        };
      })
    );

    res.json({
      count: departmentsWithCounts.length,
      data: departmentsWithCounts,
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch departments',
    });
  }
};

/**
 * Get single department
 */
exports.getDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { hospitalId } = req;

    const department = await Department.findOne({
      _id: id,
      hospitalId,
    });

    if (!department) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Department not found',
      });
    }

    // Get staff count
    const staffCount = await User.countDocuments({
      departmentId: department._id,
      isActive: true,
    });

    res.json({
      data: {
        ...department.toObject(),
        staffCount,
      },
    });
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch department',
    });
  }
};

/**
 * Create department
 */
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description, type } = req.body;
    const { hospitalId } = req;

    // Validation
    if (!name || !code) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Department name and code are required',
      });
    }

    // Check for duplicate code in the same hospital
    const existingDept = await Department.findOne({
      hospitalId,
      code: code.toUpperCase(),
    });

    if (existingDept) {
      return res.status(400).json({
        error: 'Duplicate department',
        message: 'A department with this code already exists in your hospital',
      });
    }

    // Create department
    const department = await Department.create({
      name,
      code: code.toUpperCase(),
      description,
      type: type || 'other',
      hospitalId,
    });

    res.status(201).json({
      message: 'Department created successfully',
      data: department,
    });
  } catch (error) {
    console.error('Create department error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
      }));
      
      return res.status(400).json({
        error: 'Validation error',
        message: 'Please check your input',
        details,
      });
    }

    res.status(500).json({
      error: 'Server error',
      message: 'Failed to create department',
    });
  }
};

/**
 * Update department
 */
exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, type } = req.body;
    const { hospitalId } = req;

    const department = await Department.findOne({
      _id: id,
      hospitalId,
    });

    if (!department) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Department not found',
      });
    }

    // Check for duplicate code if code is being changed
    if (code && code.toUpperCase() !== department.code) {
      const existingDept = await Department.findOne({
        hospitalId,
        code: code.toUpperCase(),
        _id: { $ne: id },
      });

      if (existingDept) {
        return res.status(400).json({
          error: 'Duplicate department',
          message: 'A department with this code already exists',
        });
      }
    }

    // Update fields
    if (name) department.name = name;
    if (code) department.code = code.toUpperCase();
    if (description !== undefined) department.description = description;
    if (type) department.type = type;

    await department.save();

    res.json({
      message: 'Department updated successfully',
      data: department,
    });
  } catch (error) {
    console.error('Update department error:', error);
    
    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
      }));
      
      return res.status(400).json({
        error: 'Validation error',
        message: 'Please check your input',
        details,
      });
    }

    res.status(500).json({
      error: 'Server error',
      message: 'Failed to update department',
    });
  }
};

/**
 * Delete department
 */
exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { hospitalId } = req;

    const department = await Department.findOne({
      _id: id,
      hospitalId,
    });

    if (!department) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Department not found',
      });
    }

    // Check if department has staff
    const staffCount = await User.countDocuments({
      departmentId: department._id,
    });

    if (staffCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete',
        message: `Cannot delete department with ${staffCount} staff member(s). Please reassign or remove staff first.`,
      });
    }

    await department.deleteOne();

    res.json({
      message: 'Department deleted successfully',
    });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to delete department',
    });
  }
};

/**
 * Get department staff
 */
exports.getDepartmentStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { hospitalId } = req;

    const department = await Department.findOne({
      _id: id,
      hospitalId,
    });

    if (!department) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Department not found',
      });
    }

    const staff = await User.find({
      departmentId: id,
      isActive: true,
    }).select('-password');

    res.json({
      count: staff.length,
      data: staff,
    });
  } catch (error) {
    console.error('Get department staff error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch department staff',
    });
  }
};