import { Router } from "express";
import { userAuthentication } from "../middlewares/auth.middleware.js";
import {
    addInternship,
    addJob,
    getInternshipById,
    getJobById,
    getAllJobs,
    getAllInternships,
    applyJob,
    applyInternship,
    checkJobApplication,
    checkInternshipApplication,
    likeJob,
    likeInternship,
    trackJobView,
    trackInternshipView
} from "../controllers/opportunity.controller.js";

const router = Router();



// Job Routes
router.route("/jobs").post(userAuthentication, addJob);
router.route("/jobs").get(userAuthentication, getAllJobs);
router.route("/jobs/:id").get(userAuthentication, getJobById);
router.route("/jobs/:jobId/apply").post(userAuthentication, applyJob);
router.route("/jobs/:jobId/check-application").get(userAuthentication, checkJobApplication);
router.route("/jobs/:id/like").post(userAuthentication, likeJob);
router.route("/jobs/:id/view").post(userAuthentication, trackJobView);



// Internship Routes
router.route("/internships").post(userAuthentication, addInternship);
router.route("/internships").get(userAuthentication, getAllInternships);
router.route("/internships/:id").get(userAuthentication, getInternshipById);
router.route("/internships/:internshipId/apply").post(userAuthentication, applyInternship);
router.route("/internships/:internshipId/check-application").get(userAuthentication, checkInternshipApplication);
router.route("/internships/:id/like").post(userAuthentication, likeInternship);
router.route("/internships/:id/view").post(userAuthentication, trackInternshipView);

export default router;
