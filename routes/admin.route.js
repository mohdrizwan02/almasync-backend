import {
  getAllVerifiedStudents,
  getAllVerifiedAlumni,
  getAllUnVerifiedStudents,
  getAllUnVerifiedAlumni,
  getAllProfileCompleteStudents,
  getAllProfileInCompleteStudents,
  getAllProfileInCompleteAlumni,
  getAllprofileCompleteAlumni,
  verifyUser,
  getAllVerifiedJobs,
  getAllUnVerifiedJobs,
  getAllUnVerifiedInternships,
  getAllVerifiedInternships,
  verifyJob,
  rejectJob,
  verifyInternship,
  rejectInternship,
  deleteJob,
  deleteInternship,
  getAlumniById,
  getStudentById,
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
  getAlumniAnalytics,
  getStudentAnalytics,
  getJobsInternshipsAnalytics,
} from "../controllers/admin.controller.js";

import { Router } from "express";
import { adminAuthentication } from "../middlewares/admin.auth.middlerware.js";
import {
  getInternshipById,
  getJobById,
} from "../controllers/opportunity.controller.js";

const router = Router();

// === USER MANAGEMENT ROUTES ===

// Verified Users
router
  .route("/get-verified-students")
  .get(adminAuthentication, getAllVerifiedStudents);
router
  .route("/get-verified-alumni")
  .get(adminAuthentication, getAllVerifiedAlumni);

// Unverified Users
router
  .route("/get-unverified-students")
  .get(adminAuthentication, getAllUnVerifiedStudents);
router
  .route("/get-unverified-alumni")
  .get(adminAuthentication, getAllUnVerifiedAlumni);

// Profile Completion
router
  .route("/get-profilecomplete-students")
  .get(adminAuthentication, getAllProfileCompleteStudents);
router
  .route("/get-profileincomplete-students")
  .get(adminAuthentication, getAllProfileInCompleteStudents);
router
  .route("/get-profilecomplete-alumni")
  .get(adminAuthentication, getAllprofileCompleteAlumni);
router
  .route("/get-profileincomplete-alumni")
  .get(adminAuthentication, getAllProfileInCompleteAlumni);

// User Actions
router.route("/verify-user/:uid").post(adminAuthentication, verifyUser);
router.route("/users/:userId/suspend").post(adminAuthentication, suspendUser);
router
  .route("/users/:userId/unsuspend")
  .post(adminAuthentication, unsuspendUser);
router.route("/users/:userId/delete").delete(adminAuthentication, deleteUser);
router.route("/users/:userId/restore").post(adminAuthentication, restoreUser);

// Bulk Operations
router.route("/users/bulk-verify").post(adminAuthentication, bulkVerifyUsers);
router.route("/users/bulk-suspend").post(adminAuthentication, bulkSuspendUsers);

// Individual User Details
router.route("/get-student/:userId").get(adminAuthentication, getStudentById);
router.route("/get-alumni/:userId").get(adminAuthentication, getAlumniById);

// === JOB/INTERNSHIP MANAGEMENT ROUTES ===

// Job Management
router.route("/get-verified-jobs").get(adminAuthentication, getAllVerifiedJobs);
router
  .route("/get-unverified-jobs")
  .get(adminAuthentication, getAllUnVerifiedJobs);
router.route("/verify-job/:jobId").post(adminAuthentication, verifyJob);
router.route("/reject-job/:jobId").post(adminAuthentication, rejectJob);
router.route("/delete-job/:jobId").delete(adminAuthentication, deleteJob);
router.route("/get-job/:jobId").get(adminAuthentication, getJobById);

// Internship Management
router
  .route("/get-verified-internships")
  .get(adminAuthentication, getAllVerifiedInternships);
router
  .route("/get-unverified-internships")
  .get(adminAuthentication, getAllUnVerifiedInternships);
router
  .route("/verify-internship/:internshipId")
  .post(adminAuthentication, verifyInternship);
router
  .route("/reject-internship/:internshipId")
  .post(adminAuthentication, rejectInternship);
router
  .route("/delete-internship/:internshipId")
  .delete(adminAuthentication, deleteInternship);
router
  .route("/get-internship/:internshipId")
  .get(adminAuthentication, getInternshipById);

// === DASHBOARD & ANALYTICS ROUTES ===

// Dashboard
router.route("/dashboard/stats").get(adminAuthentication, getDashboardStats);
router
  .route("/dashboard/system-health")
  .get(adminAuthentication, getSystemHealth);

// Comprehensive Analytics
router.route("/analytics/alumni").get(adminAuthentication, getAlumniAnalytics);
router
  .route("/analytics/students")
  .get(adminAuthentication, getStudentAnalytics);
router
  .route("/analytics/jobs-internships")
  .get(adminAuthentication, getJobsInternshipsAnalytics);

// === CONTENT MODERATION ROUTES ===

// Reports Management
router.route("/reports").get(adminAuthentication, getReportedContent);
router
  .route("/reports/:reportId/moderate")
  .post(adminAuthentication, moderateContent);
router
  .route("/content/analytics")
  .get(adminAuthentication, getContentAnalytics);

// === AUDIT & LOGGING ROUTES ===

// Audit Logs
router.route("/audit-logs").get(adminAuthentication, getAuditLogs);

export default router;
