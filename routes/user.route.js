import { Router } from "express";
import { upload } from '../middlewares/multer.middleware.js';
import { userAuthentication } from "../middlewares/auth.middleware.js";
import { 
    checkProfileCompletionStatus, 
    getAlumni, 
    getAlumniById, 
    getCurrentUser, 
    getStudentById, 
    getStudents, 
    getUser,
    getCurrentUserProfile,
    updateEmploymentSkillsAndMentorship,
    updatePersonalDetails,
    updatePublicDetails,
    updateExperience,
    updateEducation,
    updateProfileImage,
    updateCoverImage
} from "../controllers/user.controller.js";

const router = Router();

// User Info Routes
router.route("/get-current-user").get(userAuthentication, getCurrentUser);
router.route("/get-current-user-profile").get(userAuthentication, getCurrentUserProfile);
router.route("/get-user/:userId").get(userAuthentication, getUser);

// Students Routes
router.route("/get-students").get(userAuthentication, getStudents);
router.route("/get-student-by-id/:studentId").get(userAuthentication, getStudentById);

// Alumni Routes
router.route("/get-alumni").get(userAuthentication, getAlumni);
router.route("/get-alumni-by-id/:alumniId").get(userAuthentication, getAlumniById);

// Profile Status
router.route("/profile-completion-status").get(userAuthentication, checkProfileCompletionStatus);

// Update Routes
router.route("/update-employment-skills").put(userAuthentication, updateEmploymentSkillsAndMentorship);
router.route("/update-personal-details").put(userAuthentication, updatePersonalDetails);
router.route("/update-public-details").put(userAuthentication, updatePublicDetails);
router.route("/update-experience").put(userAuthentication, updateExperience);
router.route("/update-education").put(userAuthentication, updateEducation);

// Image Upload Routes
router.route("/update-profile-image").put(userAuthentication, upload.single("profileImage"), updateProfileImage);
router.route("/update-cover-image").put(userAuthentication, upload.single("coverImage"), updateCoverImage);

export default router;