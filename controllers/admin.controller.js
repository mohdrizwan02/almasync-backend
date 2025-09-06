import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Job } from "../models/job.model.js";
import { Internship } from "../models/internship.model.js";
import { Experience } from "../models/experience.model.js";
import { Connection } from "../models/connection.model.js";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import mongoose from "mongoose";

// ========================
// DASHBOARD & ANALYTICS
// ========================

const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalAlumni,
      verifiedUsers,
      unverifiedUsers,
      totalJobs,
      verifiedJobs,
      totalInternships,
      verifiedInternships,
      totalConnections,
      totalChats,
      totalMessages,
      recentUsers,
      topDepartments,
      monthlyUserRegistrations
    ] = await Promise.all([
      // User Statistics
      User.countDocuments({ role: { $in: ['student', 'alumni'] } }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'alumni' }),
      User.countDocuments({ role: { $in: ['student', 'alumni'] }, isProfileVerified: true }),
      User.countDocuments({ role: { $in: ['student', 'alumni'] }, isProfileVerified: false }),
      
      // Job & Internship Statistics
      Job.countDocuments(),
      Job.countDocuments({ isVerified: true }),
      Internship.countDocuments(),
      Internship.countDocuments({ isVerified: true }),
      
      // Activity Statistics
      Connection.countDocuments(),
      Chat.countDocuments(),
      Message.countDocuments(),
      
      // Recent Users (last 7 days)
      User.countDocuments({
        role: { $in: ['student', 'alumni'] },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      
      // Top Departments
      User.aggregate([
        { $match: { role: { $in: ['student', 'alumni'] } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      // Monthly User Registrations (last 12 months)
      User.aggregate([
        {
          $match: {
            role: { $in: ['student', 'alumni'] },
            createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    const dashboardData = {
      overview: {
        totalUsers,
        totalStudents,
        totalAlumni,
        verifiedUsers,
        unverifiedUsers,
        verificationRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(2) : 0
      },
      opportunities: {
        totalJobs,
        verifiedJobs,
        unverifiedJobs: totalJobs - verifiedJobs,
        totalInternships,
        verifiedInternships,
        unverifiedInternships: totalInternships - verifiedInternships,
        jobApprovalRate: totalJobs > 0 ? ((verifiedJobs / totalJobs) * 100).toFixed(2) : 0,
        internshipApprovalRate: totalInternships > 0 ? ((verifiedInternships / totalInternships) * 100).toFixed(2) : 0
      },
      activity: {
        totalConnections,
        totalChats,
        totalMessages,
        recentUsers,
        avgMessagesPerChat: totalChats > 0 ? (totalMessages / totalChats).toFixed(2) : 0
      },
      demographics: {
        topDepartments: topDepartments.slice(0, 5),
        allDepartments: topDepartments
      },
      trends: {
        monthlyRegistrations: monthlyUserRegistrations
      }
    };

    return res.status(200).json(
      new ApiResponse(200, dashboardData, "Dashboard statistics fetched successfully")
    );
  } catch (error) {
    throw new ApiError(500, "Error fetching dashboard statistics");
  }
});

const getSystemHealth = asyncHandler(async (req, res) => {
  try {
    const [
      dbStatus,
      activeUsers,
      errorLogs,
      systemMetrics
    ] = await Promise.all([
      // Database connection test
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      
      // Active users (logged in within last 24 hours)
      User.countDocuments({
        lastLoginAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      
      // Recent error count (if you have an error logging system)
      0, // Placeholder - implement if you have error logging
      
      // System metrics
      {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    ]);

    const healthData = {
      status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
      database: {
        status: dbStatus,
        connection: mongoose.connection.host
      },
      activity: {
        activeUsers,
        errorLogs
      },
      system: systemMetrics
    };

    return res.status(200).json(
      new ApiResponse(200, healthData, "System health status fetched successfully")
    );
  } catch (error) {
    throw new ApiError(500, "Error fetching system health");
  }
});

// ========================
// USER MANAGEMENT (Enhanced)
// ========================

const getAllVerifiedStudents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    department = '',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = {
    isProfileVerified: true,
    role: "student",
  };

  // Add search functionality
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { uid: { $regex: search, $options: 'i' } }
    ];
  }

  // Add department filter
  if (department) {
    query.department = department;
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const students = await User.find(query)
    .select("uid _id email firstName lastName role isProfileVerified degree department passoutYear createdAt lastLoginAt")
    .sort(sortOptions)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await User.countDocuments(query);

  const pagination = {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalStudents: total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        students,
        pagination
      },
      "Verified students fetched successfully"
    )
  );
});

const getAllVerifiedAlumni = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    department = '',
    company = '',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const pipeline = [
    {
      $match: {
        isProfileVerified: true,
        role: "alumni"
      }
    },
    {
      $lookup: {
        from: "experiences",
        localField: "_id",
        foreignField: "user",
        as: "experience"
      }
    },
    {
      $addFields: {
        currentExperience: { $arrayElemAt: ["$experience.experience", -1] }
      }
    }
  ];

  // Add search functionality
  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { uid: { $regex: search, $options: 'i' } }
        ]
      }
    });
  }

  // Add department filter
  if (department) {
    pipeline.push({
      $match: { department }
    });
  }

  // Add company filter
  if (company) {
    pipeline.push({
      $match: {
        "currentExperience.company": { $regex: company, $options: 'i' }
      }
    });
  }

  // Add sorting
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  pipeline.push({ $sort: sortOptions });

  // Add pagination
  pipeline.push({ $skip: (page - 1) * limit });
  pipeline.push({ $limit: parseInt(limit) });

  // Project required fields
  pipeline.push({
    $project: {
      uid: 1,
      email: 1,
      firstName: 1,
      lastName: 1,
      role: 1,
      isProfileVerified: 1,
      degree: 1,
      department: 1,
      passoutYear: 1,
      createdAt: 1,
      lastLoginAt: 1,
      currentCompany: "$currentExperience.company",
      currentPosition: "$currentExperience.position"
    }
  });

  const alumni = await User.aggregate(pipeline);

  // Get total count for pagination
  const totalPipeline = [
    {
      $match: {
        isProfileVerified: true,
        role: "alumni"
      }
    }
  ];

  if (search) {
    totalPipeline.push({
      $match: {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { uid: { $regex: search, $options: 'i' } }
        ]
      }
    });
  }

  if (department) {
    totalPipeline.push({
      $match: { department }
    });
  }

  totalPipeline.push({ $count: "total" });
  const totalResult = await User.aggregate(totalPipeline);
  const total = totalResult.length > 0 ? totalResult[0].total : 0;

  const pagination = {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalAlumni: total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        alumni,
        pagination
      },
      "Verified alumni fetched successfully"
    )
  );
});

const getAllUnVerifiedStudents = asyncHandler(async (req, res) => {
  const students = await User.find({
    isProfileVerified: false,
    role: "student",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!students) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        students: students,
      },
      "Unverified Students have been fetched successfully"
    )
  );
});

const getAllUnVerifiedAlumni = asyncHandler(async (req, res) => {
  const alumni = await User.find({
    isProfileVerified: false,
    role: "alumni",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!alumni) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        alumni: alumni,
      },
      "Unverified Alumni have been fetched successfully"
    )
  );
});

const getAllProfileCompleteStudents = asyncHandler(async (req, res) => {
  const students = await User.find({
    isProfileVerified: true,
    isProfileComplete: true,
    role: "student",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!students) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        students: students,
      },
      "verified Profile Completed Students have been fetched successfully"
    )
  );
});

const getAllprofileCompleteAlumni = asyncHandler(async (req, res) => {
  const alumni = await User.find({
    isProfileVerified: true,
    isProfileComplete: true,
    role: "alumni",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!alumni) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        alumni: alumni,
      },
      "verified Profile Completed Alumni have been fetched successfully"
    )
  );
});

const getAllProfileInCompleteStudents = asyncHandler(async (req, res) => {
  const students = await User.find({
    isProfileVerified: true,
    isProfileComplete: false,

    role: "student",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!students) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        students: students,
      },
      "Verified Profile Incompleted Students have been fetched successfully"
    )
  );
});

const getAllProfileInCompleteAlumni = asyncHandler(async (req, res) => {
  const alumni = await User.find({
    isProfileVerified: true,
    isProfileComplete: false,
    role: "alumni",
  }).select(
    "uid _id email firstName lastName role isProfileVerified degree department passoutYear"
  );

  if (!alumni) {
    throw new ApiError(500, "Server error occurred");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        alumni: alumni,
      },
      "Verified Profile Incompleted Alumni have been fetched successfully"
    )
  );
});

const getAllVerifiedJobs = asyncHandler(async (req, res) => {
  const jobs = await Job.find({ isVerified: true });

  if (!jobs) {
    throw new ApiError(500, "error occurred while getting verified jobs");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { jobs: jobs }, "successfully fetched verified jobs")
    );
});

const getAllUnVerifiedJobs = asyncHandler(async (req, res) => {
  const jobs = await Job.find({ isVerified: false });

  if (!jobs) {
    throw new ApiError(500, "error occurred while getting unverified jobs");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { jobs: jobs },
        "successfully fetched Unverified jobs"
      )
    );
});

const getAllVerifiedInternships = asyncHandler(async (req, res) => {
  const internships = await Internship.find({ isVerified: true });

  if (!internships) {
    throw new ApiError(
      500,
      "error occurred while getting verified internships"
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { internship: internships },
        "successfully fetched verified internships"
      )
    );
});

const getAllUnVerifiedInternships = asyncHandler(async (req, res) => {
  const internships = await Internship.find({ isVerified: false });

  if (!internships) {
    throw new ApiError(
      500,
      "error occurred while getting unverified internships"
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { internship: internships },
        "successfully fetched unverified internships"
      )
    );
});

const verifyUser = asyncHandler(async (req, res) => {
  const uid = req.params?.uid;

  if (!uid) {
    throw new ApiError(400, "User ID is required for verification");
  }

  const user = await User.findOneAndUpdate(
    { uid: uid },
    { 
      isProfileVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    },
    {
      new: true,
    }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User verified successfully"));
});

const unverifyUser = asyncHandler(async (req, res) => {
  const uid = req.params?.uid;

  if (!uid) {
    throw new ApiError(400, "User ID is required");
  }

  const user = await User.findOneAndUpdate(
    { uid: uid },
    { 
      isProfileVerified: false,
      verifiedAt: null,
      verifiedBy: null
    },
    {
      new: true,
    }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User unverified successfully"));
});

const suspendUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason, duration } = req.body;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  if (!reason) {
    throw new ApiError(400, "Suspension reason is required");
  }

  const suspendUntil = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      isSuspended: true,
      suspensionReason: reason,
      suspendedAt: new Date(),
      suspendedBy: req.user._id,
      suspendedUntil: suspendUntil
    },
    { new: true }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { user }, "User suspended successfully")
  );
});

const unsuspendUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      isSuspended: false,
      suspensionReason: null,
      suspendedAt: null,
      suspendedBy: null,
      suspendedUntil: null
    },
    { new: true }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { user }, "User unsuspended successfully")
  );
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  if (!reason) {
    throw new ApiError(400, "Deletion reason is required");
  }

  // Instead of hard delete, soft delete for audit purposes
  const user = await User.findByIdAndUpdate(
    userId,
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
      deletionReason: reason,
      email: `deleted_${Date.now()}_${user.email}`, // Prevent email conflicts
      uid: `deleted_${Date.now()}_${user.uid}`
    },
    { new: true }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "User deleted successfully")
  );
});

const restoreUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletionReason: null,
      // Note: Email and UID need manual restoration to avoid conflicts
      restoredAt: new Date(),
      restoredBy: req.user._id
    },
    { new: true }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { user }, "User restored successfully")
  );
});

// ========================
// BULK OPERATIONS
// ========================

const bulkVerifyUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(400, "User IDs array is required");
  }

  const result = await User.updateMany(
    { _id: { $in: userIds } },
    {
      isProfileVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    }
  );

  return res.status(200).json(
    new ApiResponse(200, { 
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount 
    }, `${result.modifiedCount} users verified successfully`)
  );
});

const bulkSuspendUsers = asyncHandler(async (req, res) => {
  const { userIds, reason, duration } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(400, "User IDs array is required");
  }

  if (!reason) {
    throw new ApiError(400, "Suspension reason is required");
  }

  const suspendUntil = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

  const result = await User.updateMany(
    { _id: { $in: userIds } },
    {
      isSuspended: true,
      suspensionReason: reason,
      suspendedAt: new Date(),
      suspendedBy: req.user._id,
      suspendedUntil: suspendUntil
    }
  );

  return res.status(200).json(
    new ApiResponse(200, { 
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount 
    }, `${result.modifiedCount} users suspended successfully`)
  );
});

const verifyJob = asyncHandler(async (req, res) => {
  const id = req.params?.jobId;

  if (!id) {
    throw new ApiError(400, "Job ID is required");
  }

  const jobId = new mongoose.Types.ObjectId(id);

  const job = await Job.findByIdAndUpdate(
    jobId,
    { 
      isVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    },
    { new: true }
  );

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { job }, "Job verified successfully"));
});

const rejectJob = asyncHandler(async (req, res) => {
  const id = req.params?.jobId;
  const { reason } = req.body;

  if (!id) {
    throw new ApiError(400, "Job ID is required");
  }

  if (!reason) {
    throw new ApiError(400, "Rejection reason is required");
  }

  const jobId = new mongoose.Types.ObjectId(id);

  const job = await Job.findByIdAndUpdate(
    jobId,
    { 
      isVerified: false,
      isRejected: true,
      rejectionReason: reason,
      rejectedAt: new Date(),
      rejectedBy: req.user._id
    },
    { new: true }
  );

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { job }, "Job rejected successfully"));
});

const verifyInternship = asyncHandler(async (req, res) => {
  const id = req.params?.internshipId;

  if (!id) {
    throw new ApiError(400, "Internship ID is required");
  }

  const internshipId = new mongoose.Types.ObjectId(id);

  const internship = await Internship.findByIdAndUpdate(
    internshipId,
    { 
      isVerified: true,
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    },
    { new: true }
  );

  if (!internship) {
    throw new ApiError(404, "Internship not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { internship }, "Internship verified successfully"));
});

const rejectInternship = asyncHandler(async (req, res) => {
  const id = req.params?.internshipId;
  const { reason } = req.body;

  if (!id) {
    throw new ApiError(400, "Internship ID is required");
  }

  if (!reason) {
    throw new ApiError(400, "Rejection reason is required");
  }

  const internshipId = new mongoose.Types.ObjectId(id);

  const internship = await Internship.findByIdAndUpdate(
    internshipId,
    { 
      isVerified: false,
      isRejected: true,
      rejectionReason: reason,
      rejectedAt: new Date(),
      rejectedBy: req.user._id
    },
    { new: true }
  );

  if (!internship) {
    throw new ApiError(404, "Internship not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { internship }, "Internship rejected successfully"));
});

const deleteJob = asyncHandler(async (req, res) => {
  const id = req.params?.jobId;

  if (!id) {
    throw new ApiError(400, "Job ID is required");
  }

  const jobId = new mongoose.Types.ObjectId(id);

  const response = await Job.findByIdAndDelete(jobId);

  if (!response) {
    throw new ApiError(404, "Job not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Job deleted successfully"));
});

const deleteInternship = asyncHandler(async (req, res) => {
  const id = req.params?.internshipId;

  if (!id) {
    throw new ApiError(400, "Internship ID is required");
  }

  const internshipId = new mongoose.Types.ObjectId(id);

  const response = await Internship.findByIdAndDelete(internshipId);

  if (!response) {
    throw new ApiError(404, "Internship not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Internship deleted successfully"));
});


const getStudentById = asyncHandler(async (req, res) => {

  const userId = req.params?.userId;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }



  const student = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
        role: "student",


      },
    },
    {
      $lookup: {
        from: "educations",
        localField: "_id",
        foreignField: "user",
        as: "education",
      },
    },
    {
      $lookup: {
        from: "experiences",
        localField: "_id",
        foreignField: "user",
        as: "experience",
      },
    },
    {
      $addFields: {
        education: {
          $ifNull: [{ $arrayElemAt: ["$education.education", 0] }, []],
        },
        experience: {
          $ifNull: [{ $arrayElemAt: ["$experience.experience", 0] }, []],
        },
      },
    },
    {
      $project: {
        mentorshipTopics: 0,
        isEmployed: 0,
        availableForMentorship: 0,
        mentorshipExperience: 0,
        verifyOtp: 0,

        __v: 0,
      },
    },
  ]);


  if (!student || student.length === 0) {
    return res.status(404).json(new ApiResponse(404, {}, "Student not found"));
  }
  res.status(200).json(new ApiResponse(200, { student: student[0] }, "Student data fetched successfully"));

})


const getAlumniById = asyncHandler(async (req, res) => {
  const userId = req.params?.userId;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const alumni = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
        role: "alumni",
        isProfileVerified: true,
      },
    },
    {
      $lookup: {
        from: "educations",
        localField: "_id",
        foreignField: "user",
        as: "education",
      },
    },
    {
      $lookup: {
        from: "experiences",
        localField: "_id",
        foreignField: "user",
        as: "experience",
      },
    },
    {
      $addFields: {
        education: {
          $ifNull: [{ $arrayElemAt: ["$education.education", 0] }, []],
        },
        experience: {
          $ifNull: [{
            $arrayElemAt: ["$experience.experience", 0
            ]
          }, []],
        },
      },
    },
    {
      $project: {

        verifyOtp: 0,
        mentorshipNeeds: 0,
        __v: 0,
      },
    },
  ]);

  if (!alumni || alumni.length === 0) {
    return res.status(404).json(new ApiResponse(404, {}, "Alumni not found"));
  }

  res.status(200).json(new ApiResponse(200, { alumni: alumni[0] }, "Alumni data fetched successfully"));



})
















// Content Moderation Functions
const getReportedContent = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, type = 'all', status = 'all' } = req.query;

  const filter = {};
  if (type !== 'all') filter.contentType = type;
  if (status !== 'all') filter.status = status;

  // This assumes you have a Report model - you may need to create this
  const reports = await Report?.find(filter)
    .populate('reportedBy', 'firstName lastName profileImage')
    .populate('reportedUser', 'firstName lastName profileImage')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit) || [];

  const totalReports = await Report?.countDocuments(filter) || 0;

  return res.status(200).json(new ApiResponse(200, {
    reports,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalReports / limit),
      totalReports,
      hasNextPage: page < Math.ceil(totalReports / limit),
      hasPrevPage: page > 1
    }
  }, "Reported content retrieved successfully"));
});

const moderateContent = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { action, reason } = req.body; // action: 'approve', 'reject', 'remove_content'

  if (!['approve', 'reject', 'remove_content'].includes(action)) {
    throw new ApiError(400, "Invalid action. Must be 'approve', 'reject', or 'remove_content'");
  }

  const report = await Report?.findById(reportId);
  if (!report) {
    throw new ApiError(404, "Report not found");
  }

  // Update report status
  report.status = action === 'approve' ? 'resolved' : 'rejected';
  report.moderatedBy = req.user._id;
  report.moderatedAt = new Date();
  report.moderationReason = reason;

  if (action === 'remove_content') {
    // Logic to remove the reported content based on content type
    if (report.contentType === 'job') {
      await Job.findByIdAndDelete(report.contentId);
    } else if (report.contentType === 'internship') {
      await Internship.findByIdAndDelete(report.contentId);
    } else if (report.contentType === 'user') {
      await User.findByIdAndUpdate(report.contentId, { isActive: false });
    }
  }

  await report.save();

  return res.status(200).json(new ApiResponse(200, { report }, "Content moderated successfully"));
});

const getContentAnalytics = asyncHandler(async (req, res) => {
  const { period = '30' } = req.query; // days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  const analytics = {
    totalJobs: await Job.countDocuments(),
    totalInternships: await Internship.countDocuments(),
    totalReports: await Report?.countDocuments() || 0,
    
    recentActivity: {
      newJobs: await Job.countDocuments({ createdAt: { $gte: startDate } }),
      newInternships: await Internship.countDocuments({ createdAt: { $gte: startDate } }),
      newReports: await Report?.countDocuments({ createdAt: { $gte: startDate } }) || 0,
    },

    contentStatus: {
      verifiedJobs: await Job.countDocuments({ isVerified: true }),
      unverifiedJobs: await Job.countDocuments({ isVerified: false }),
      verifiedInternships: await Internship.countDocuments({ isVerified: true }),
      unverifiedInternships: await Internship.countDocuments({ isVerified: false }),
    },

    topReportReasons: await Report?.aggregate([
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]) || []
  };

  return res.status(200).json(new ApiResponse(200, analytics, "Content analytics retrieved successfully"));
});

// Audit and Logging Functions
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, action = 'all', adminId = 'all' } = req.query;

  const filter = {};
  if (action !== 'all') filter.action = action;
  if (adminId !== 'all') filter.adminId = adminId;

  // This assumes you have an AuditLog model - you may need to create this
  const logs = await AuditLog?.find(filter)
    .populate('adminId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit) || [];

  const totalLogs = await AuditLog?.countDocuments(filter) || 0;

  return res.status(200).json(new ApiResponse(200, {
    logs,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
      totalLogs,
      hasNextPage: page < Math.ceil(totalLogs / limit),
      hasPrevPage: page > 1
    }
  }, "Audit logs retrieved successfully"));
});

const createAuditLog = async (adminId, action, details, targetType, targetId, req = null) => {
  try {
    if (AuditLog) {
      await AuditLog.create({
        adminId,
        action,
        details,
        targetType,
        targetId,
        timestamp: new Date(),
        ipAddress: req?.ip || 'unknown'
      });
    }
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
};

// Comprehensive Alumni Analytics
const getAlumniAnalytics = asyncHandler(async (req, res) => {
  const { period = '365' } = req.query; // days for trend analysis
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  // Basic Alumni Count
  const totalAlumni = await User.countDocuments({ role: "alumni" });

  // Profile Completion Distribution Across Departments
  const profileCompletionByDepartment = await User.aggregate([
    { $match: { role: "alumni" } },
    {
      $group: {
        _id: {
          department: "$department",
          isProfileComplete: "$isProfileComplete"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.department",
        profileComplete: {
          $sum: {
            $cond: [{ $eq: ["$_id.isProfileComplete", true] }, "$count", 0]
          }
        },
        profileIncomplete: {
          $sum: {
            $cond: [{ $eq: ["$_id.isProfileComplete", false] }, "$count", 0]
          }
        },
        total: { $sum: "$count" }
      }
    },
    {
      $addFields: {
        completionRate: {
          $round: [{ $multiply: [{ $divide: ["$profileComplete", "$total"] }, 100] }, 2]
        }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Employment Statistics
  const employmentStats = await User.aggregate([
    { $match: { role: "alumni" } },
    {
      $group: {
        _id: null,
        totalAlumni: { $sum: 1 },
        employedAlumni: {
          $sum: { $cond: [{ $eq: ["$isEmployed", true] }, 1, 0] }
        },
        unemployedAlumni: {
          $sum: { $cond: [{ $eq: ["$isEmployed", false] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        employmentRate: {
          $round: [{ $multiply: [{ $divide: ["$employedAlumni", "$totalAlumni"] }, 100] }, 2]
        }
      }
    }
  ]);

  // Companies Where Alumni Work
  const companiesDistribution = await User.aggregate([
    { 
      $match: { 
        role: "alumni", 
        isEmployed: true, 
        currentCompany: { $exists: true, $ne: null, $ne: "" } 
      } 
    },
    {
      $group: {
        _id: "$currentCompany",
        count: { $sum: 1 },
        alumni: {
          $push: {
            name: { $concat: ["$firstName", " ", "$lastName"] },
            department: "$department",
            jobTitle: "$currentJobTitle"
          }
        }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  // Work Locations Distribution
  const workLocationsDistribution = await User.aggregate([
    { 
      $match: { 
        role: "alumni", 
        isEmployed: true, 
        workLocation: { $exists: true, $ne: null, $ne: "" } 
      } 
    },
    {
      $group: {
        _id: "$workLocation",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 15 }
  ]);

  // Skills Distribution Among Alumni
  const skillsDistribution = await User.aggregate([
    { $match: { role: "alumni", skills: { $exists: true, $not: { $size: 0 } } } },
    { $unwind: "$skills" },
    {
      $group: {
        _id: "$skills",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  // Average Salary Analysis
  const salaryAnalytics = await User.aggregate([
    { 
      $match: { 
        role: "alumni", 
        isEmployed: true,
        "currentSalary.amount": { $exists: true, $gt: 0 }
      } 
    },
    {
      $group: {
        _id: "$department",
        avgSalary: { $avg: "$currentSalary.amount" },
        minSalary: { $min: "$currentSalary.amount" },
        maxSalary: { $max: "$currentSalary.amount" },
        count: { $sum: 1 }
      }
    },
    {
      $addFields: {
        avgSalary: { $round: ["$avgSalary", 0] }
      }
    },
    { $sort: { avgSalary: -1 } }
  ]);

  // Department Distribution
  const departmentDistribution = await User.aggregate([
    { $match: { role: "alumni" } },
    {
      $group: {
        _id: "$department",
        count: { $sum: 1 },
        employed: {
          $sum: { $cond: [{ $eq: ["$isEmployed", true] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        employmentRate: {
          $round: [{ $multiply: [{ $divide: ["$employed", "$count"] }, 100] }, 2]
        }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Employment Distribution Across Departments
  const employmentByDepartment = await User.aggregate([
    { $match: { role: "alumni" } },
    {
      $group: {
        _id: {
          department: "$department",
          isEmployed: "$isEmployed"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.department",
        employed: {
          $sum: {
            $cond: [{ $eq: ["$_id.isEmployed", true] }, "$count", 0]
          }
        },
        unemployed: {
          $sum: {
            $cond: [{ $eq: ["$_id.isEmployed", false] }, "$count", 0]
          }
        },
        total: { $sum: "$count" }
      }
    },
    {
      $addFields: {
        employmentRate: {
          $round: [{ $multiply: [{ $divide: ["$employed", "$total"] }, 100] }, 2]
        }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Graduation Batches Analysis
  const graduationBatches = await User.aggregate([
    { 
      $match: { 
        role: "alumni", 
        passoutYear: { $exists: true, $ne: null } 
      } 
    },
    {
      $group: {
        _id: "$passoutYear",
        count: { $sum: 1 },
        employed: {
          $sum: { $cond: [{ $eq: ["$isEmployed", true] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        employmentRate: {
          $round: [{ $multiply: [{ $divide: ["$employed", "$count"] }, 100] }, 2]
        }
      }
    },
    { $sort: { _id: -1 } }
  ]);

  // Recent Alumni Registration Trends
  const registrationTrends = await User.aggregate([
    { 
      $match: { 
        role: "alumni", 
        createdAt: { $gte: startDate } 
      } 
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const analytics = {
    overview: {
      totalAlumni,
      employmentStats: employmentStats[0] || { totalAlumni, employedAlumni: 0, unemployedAlumni: 0, employmentRate: 0 }
    },
    profileCompletion: {
      byDepartment: profileCompletionByDepartment
    },
    employment: {
      companies: companiesDistribution,
      locations: workLocationsDistribution,
      byDepartment: employmentByDepartment,
      salaryAnalytics
    },
    demographics: {
      departments: departmentDistribution,
      graduationBatches,
      skills: skillsDistribution
    },
    trends: {
      registration: registrationTrends
    }
  };

  return res.status(200).json(new ApiResponse(200, analytics, "Alumni analytics retrieved successfully"));
});

// Comprehensive Student Analytics
const getStudentAnalytics = asyncHandler(async (req, res) => {
  const { period = '365' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  // Basic Student Count
  const totalStudents = await User.countDocuments({ role: "student" });

  // Department Distribution
  const departmentDistribution = await User.aggregate([
    { $match: { role: "student" } },
    {
      $group: {
        _id: "$department",
        count: { $sum: 1 },
        profileComplete: {
          $sum: { $cond: [{ $eq: ["$isProfileComplete", true] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        completionRate: {
          $round: [{ $multiply: [{ $divide: ["$profileComplete", "$count"] }, 100] }, 2]
        }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Profile Completion Distribution Across Departments
  const profileCompletionByDepartment = await User.aggregate([
    { $match: { role: "student" } },
    {
      $group: {
        _id: {
          department: "$department",
          isProfileComplete: "$isProfileComplete"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.department",
        profileComplete: {
          $sum: {
            $cond: [{ $eq: ["$_id.isProfileComplete", true] }, "$count", 0]
          }
        },
        profileIncomplete: {
          $sum: {
            $cond: [{ $eq: ["$_id.isProfileComplete", false] }, "$count", 0]
          }
        },
        total: { $sum: "$count" }
      }
    },
    {
      $addFields: {
        completionRate: {
          $round: [{ $multiply: [{ $divide: ["$profileComplete", "$total"] }, 100] }, 2]
        }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Skills Distribution Among Students
  const skillsDistribution = await User.aggregate([
    { $match: { role: "student", skills: { $exists: true, $not: { $size: 0 } } } },
    { $unwind: "$skills" },
    {
      $group: {
        _id: "$skills",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 25 }
  ]);

  // Experience Distribution (Students with Internships/Jobs)
  const experienceDistribution = await Experience.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userInfo"
      }
    },
    { $unwind: "$userInfo" },
    { $match: { "userInfo.role": "student" } },
    { $unwind: "$experience" },
    {
      $group: {
        _id: "$experience.type",
        count: { $sum: 1 },
        students: { $addToSet: "$user" }
      }
    },
    {
      $addFields: {
        uniqueStudents: { $size: "$students" }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Students with Experience vs Without Experience
  const studentsWithExperience = await Experience.distinct("user", {});
  const experienceStats = {
    withExperience: studentsWithExperience.length,
    withoutExperience: totalStudents - studentsWithExperience.length,
    experienceRate: Math.round((studentsWithExperience.length / totalStudents) * 100)
  };

  // Academic Year Distribution
  const academicYearDistribution = await User.aggregate([
    { 
      $match: { 
        role: "student", 
        admissionYear: { $exists: true, $ne: null },
        passoutYear: { $exists: true, $ne: null }
      } 
    },
    {
      $addFields: {
        currentYear: {
          $subtract: [
            { $year: new Date() },
            "$admissionYear"
          ]
        }
      }
    },
    {
      $group: {
        _id: "$currentYear",
        count: { $sum: 1 },
        profileComplete: {
          $sum: { $cond: [{ $eq: ["$isProfileComplete", true] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        completionRate: {
          $round: [{ $multiply: [{ $divide: ["$profileComplete", "$count"] }, 100] }, 2]
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Recent Student Registration Trends
  const registrationTrends = await User.aggregate([
    { 
      $match: { 
        role: "student", 
        createdAt: { $gte: startDate } 
      } 
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Top Companies Students Are Interested In (from job applications)
  const topCompaniesInterest = await Job.aggregate([
    { $unwind: "$applicants" },
    {
      $lookup: {
        from: "users",
        localField: "applicants",
        foreignField: "_id",
        as: "applicantInfo"
      }
    },
    { $unwind: "$applicantInfo" },
    { $match: { "applicantInfo.role": "student" } },
    {
      $group: {
        _id: "$company",
        applicationCount: { $sum: 1 },
        uniqueStudents: { $addToSet: "$applicants" }
      }
    },
    {
      $addFields: {
        uniqueStudentCount: { $size: "$uniqueStudents" }
      }
    },
    { $sort: { applicationCount: -1 } },
    { $limit: 15 }
  ]);

  const analytics = {
    overview: {
      totalStudents,
      experienceStats
    },
    demographics: {
      departments: departmentDistribution,
      academicYears: academicYearDistribution,
      skills: skillsDistribution
    },
    profileCompletion: {
      byDepartment: profileCompletionByDepartment
    },
    experience: {
      distribution: experienceDistribution,
      stats: experienceStats
    },
    interests: {
      topCompanies: topCompaniesInterest
    },
    trends: {
      registration: registrationTrends
    }
  };

  return res.status(200).json(new ApiResponse(200, analytics, "Student analytics retrieved successfully"));
});

// Comprehensive Jobs and Internships Analytics
const getJobsInternshipsAnalytics = asyncHandler(async (req, res) => {
  const { period = '365' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));

  // Basic Counts
  const totalJobs = await Job.countDocuments();
  const totalInternships = await Internship.countDocuments();
  const verifiedJobs = await Job.countDocuments({ isVerified: true });
  const verifiedInternships = await Internship.countDocuments({ isVerified: true });

  // Required Skills Analysis (Combined Jobs + Internships)
  const jobSkills = await Job.aggregate([
    { $unwind: "$skills" },
    { $group: { _id: "$skills", jobCount: { $sum: 1 } } }
  ]);

  const internshipSkills = await Internship.aggregate([
    { $unwind: "$skills" },
    { $group: { _id: "$skills", internshipCount: { $sum: 1 } } }
  ]);

  // Combine and sort skills
  const skillsMap = new Map();
  jobSkills.forEach(skill => {
    skillsMap.set(skill._id, { 
      skill: skill._id, 
      jobCount: skill.jobCount, 
      internshipCount: 0,
      totalCount: skill.jobCount 
    });
  });

  internshipSkills.forEach(skill => {
    if (skillsMap.has(skill._id)) {
      const existing = skillsMap.get(skill._id);
      existing.internshipCount = skill.internshipCount;
      existing.totalCount += skill.internshipCount;
    } else {
      skillsMap.set(skill._id, {
        skill: skill._id,
        jobCount: 0,
        internshipCount: skill.internshipCount,
        totalCount: skill.internshipCount
      });
    }
  });

  const requiredSkills = Array.from(skillsMap.values())
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 25);

  // Location Distribution (Combined)
  const jobLocations = await Job.aggregate([
    { $group: { _id: "$location", jobCount: { $sum: 1 } } }
  ]);

  const internshipLocations = await Internship.aggregate([
    { $group: { _id: "$location", internshipCount: { $sum: 1 } } }
  ]);

  const locationsMap = new Map();
  jobLocations.forEach(loc => {
    locationsMap.set(loc._id, {
      location: loc._id,
      jobCount: loc.jobCount,
      internshipCount: 0,
      totalCount: loc.jobCount
    });
  });

  internshipLocations.forEach(loc => {
    if (locationsMap.has(loc._id)) {
      const existing = locationsMap.get(loc._id);
      existing.internshipCount = loc.internshipCount;
      existing.totalCount += loc.internshipCount;
    } else {
      locationsMap.set(loc._id, {
        location: loc._id,
        jobCount: 0,
        internshipCount: loc.internshipCount,
        totalCount: loc.internshipCount
      });
    }
  });

  const locationDistribution = Array.from(locationsMap.values())
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 20);

  // Work Type Distribution (Combined)
  const jobWorkTypes = await Job.aggregate([
    { $group: { _id: "$workType", jobCount: { $sum: 1 } } }
  ]);

  const internshipWorkTypes = await Internship.aggregate([
    { $group: { _id: "$workType", internshipCount: { $sum: 1 } } }
  ]);

  const workTypesMap = new Map();
  jobWorkTypes.forEach(type => {
    workTypesMap.set(type._id, {
      workType: type._id,
      jobCount: type.jobCount,
      internshipCount: 0,
      totalCount: type.jobCount
    });
  });

  internshipWorkTypes.forEach(type => {
    if (workTypesMap.has(type._id)) {
      const existing = workTypesMap.get(type._id);
      existing.internshipCount = type.internshipCount;
      existing.totalCount += type.internshipCount;
    } else {
      workTypesMap.set(type._id, {
        workType: type._id,
        jobCount: 0,
        internshipCount: type.internshipCount,
        totalCount: type.internshipCount
      });
    }
  });

  const workTypeDistribution = Array.from(workTypesMap.values())
    .sort((a, b) => b.totalCount - a.totalCount);

  // Application Analytics
  const jobApplications = await Job.aggregate([
    {
      $project: {
        _id: 1,
        title: 1,
        company: 1,
        applicantCount: { $size: "$applicants" },
        likeCount: { $size: "$likes" },
        viewCount: { $size: "$views" }
      }
    },
    { $sort: { applicantCount: -1 } },
    { $limit: 10 }
  ]);

  const internshipApplications = await Internship.aggregate([
    {
      $project: {
        _id: 1,
        title: 1,
        company: 1,
        applicantCount: { $size: "$applicants" },
        likeCount: { $size: "$likes" },
        viewCount: { $size: "$views" }
      }
    },
    { $sort: { applicantCount: -1 } },
    { $limit: 10 }
  ]);

  // Total Applications by User Role
  const jobApplicationsByRole = await Job.aggregate([
    { $unwind: "$applicants" },
    {
      $lookup: {
        from: "users",
        localField: "applicants",
        foreignField: "_id",
        as: "applicantInfo"
      }
    },
    { $unwind: "$applicantInfo" },
    {
      $group: {
        _id: "$applicantInfo.role",
        count: { $sum: 1 }
      }
    }
  ]);

  const internshipApplicationsByRole = await Internship.aggregate([
    { $unwind: "$applicants" },
    {
      $lookup: {
        from: "users",
        localField: "applicants",
        foreignField: "_id",
        as: "applicantInfo"
      }
    },
    { $unwind: "$applicantInfo" },
    {
      $group: {
        _id: "$applicantInfo.role",
        count: { $sum: 1 }
      }
    }
  ]);

  // Likes Analytics by User Role
  const jobLikesByRole = await Job.aggregate([
    { $unwind: "$likes" },
    {
      $lookup: {
        from: "users",
        localField: "likes",
        foreignField: "_id",
        as: "likerInfo"
      }
    },
    { $unwind: "$likerInfo" },
    {
      $group: {
        _id: "$likerInfo.role",
        count: { $sum: 1 }
      }
    }
  ]);

  const internshipLikesByRole = await Internship.aggregate([
    { $unwind: "$likes" },
    {
      $lookup: {
        from: "users",
        localField: "likes",
        foreignField: "_id",
        as: "likerInfo"
      }
    },
    { $unwind: "$likerInfo" },
    {
      $group: {
        _id: "$likerInfo.role",
        count: { $sum: 1 }
      }
    }
  ]);

  // Company Analysis
  const topCompaniesByJobs = await Job.aggregate([
    {
      $group: {
        _id: "$company",
        jobCount: { $sum: 1 },
        totalApplications: { $sum: { $size: "$applicants" } },
        totalLikes: { $sum: { $size: "$likes" } }
      }
    },
    { $sort: { jobCount: -1 } },
    { $limit: 15 }
  ]);

  const topCompaniesByInternships = await Internship.aggregate([
    {
      $group: {
        _id: "$company",
        internshipCount: { $sum: 1 },
        totalApplications: { $sum: { $size: "$applicants" } },
        totalLikes: { $sum: { $size: "$likes" } }
      }
    },
    { $sort: { internshipCount: -1 } },
    { $limit: 15 }
  ]);

  // Posting Trends
  const jobPostingTrends = await Job.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const internshipPostingTrends = await Internship.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Salary/Stipend Analysis
  const salaryRanges = await Job.aggregate([
    { $match: { "salary.min": { $exists: true, $gt: 0 } } },
    {
      $bucket: {
        groupBy: "$salary.min",
        boundaries: [0, 300000, 500000, 800000, 1200000, 2000000, 5000000],
        default: "5000000+",
        output: {
          count: { $sum: 1 },
          avgSalary: { $avg: "$salary.min" }
        }
      }
    }
  ]);

  const stipendRanges = await Internship.aggregate([
    { $match: { "stipend.amount": { $exists: true, $gt: 0 } } },
    {
      $bucket: {
        groupBy: "$stipend.amount",
        boundaries: [0, 5000, 10000, 20000, 30000, 50000],
        default: "50000+",
        output: {
          count: { $sum: 1 },
          avgStipend: { $avg: "$stipend.amount" }
        }
      }
    }
  ]);

  const analytics = {
    overview: {
      totalJobs,
      totalInternships,
      verifiedJobs,
      verifiedInternships,
      verificationRate: {
        jobs: Math.round((verifiedJobs / totalJobs) * 100),
        internships: Math.round((verifiedInternships / totalInternships) * 100)
      }
    },
    skills: {
      required: requiredSkills
    },
    locations: {
      distribution: locationDistribution
    },
    workTypes: {
      distribution: workTypeDistribution
    },
    applications: {
      topJobs: jobApplications,
      topInternships: internshipApplications,
      byRole: {
        jobs: jobApplicationsByRole,
        internships: internshipApplicationsByRole
      }
    },
    engagement: {
      likes: {
        byRole: {
          jobs: jobLikesByRole,
          internships: internshipLikesByRole
        }
      }
    },
    companies: {
      topByJobs: topCompaniesByJobs,
      topByInternships: topCompaniesByInternships
    },
    trends: {
      jobPostings: jobPostingTrends,
      internshipPostings: internshipPostingTrends
    },
    compensation: {
      salaryRanges,
      stipendRanges
    }
  };

  return res.status(200).json(new ApiResponse(200, analytics, "Jobs and internships analytics retrieved successfully"));
});

export {
  getAllVerifiedAlumni,
  getAllVerifiedStudents,
  getAllUnVerifiedAlumni,
  getAllUnVerifiedStudents,
  getAllProfileCompleteStudents,
  getAllProfileInCompleteStudents,
  getAllprofileCompleteAlumni,
  getAllProfileInCompleteAlumni,
  verifyUser,
  getAllVerifiedJobs,
  getAllUnVerifiedJobs,
  getAllVerifiedInternships,
  getAllUnVerifiedInternships,
  verifyJob,
  rejectJob,
  verifyInternship,
  rejectInternship,
  deleteJob,
  deleteInternship,
  getStudentById,
  getAlumniById,
  getDashboardStats,
  getSystemHealth,
  suspendUser,
  unsuspendUser,
  deleteUser,
  restoreUser,
  bulkVerifyUsers,
  bulkSuspendUsers,
  getReportedContent,
  moderateContent,
  getContentAnalytics,
  getAuditLogs,
  createAuditLog,
  getAlumniAnalytics,
  getStudentAnalytics,
  getJobsInternshipsAnalytics
};
