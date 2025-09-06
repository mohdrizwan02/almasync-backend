import mongoose from "mongoose";
import { Internship } from "../models/internship.model.js";
import { Job } from "../models/job.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const addInternship = asyncHandler(async (req, res) => {

    const user = req.user;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    if (user.role !== "alumni") {
        throw new ApiError(403, "Only alumni can post internships");
    }

    const {
        title,
        company,
        location,
        type,
        workType,
        description,
        responsibilities = [],
        benefits = [],
        eligibility = [],
        skills = [],
        workingDays,
        experienceRequired,
        duration,
        stipend, // Changed from salary to stipend for internships
        deadline,
        isPostedByCollege = false,
        industry
    } = req.body;

    // Process stipend structure
    let stipendData = null;
    if (stipend) {
        stipendData = {
            amount: stipend.amount || 0,
            currency: stipend.currency || "INR",
            type: stipend.type || "monthly"
        };
    }

    const internship = await Internship.create({
        postedBy: user._id,
        title,
        company,
        location,
        type,
        workType,
        description,
        responsibilities,
        benefits,
        eligibility,
        skills,
        workingDays,
        experienceRequired,
        duration,
        stipend: stipendData,
        deadline,
        isPostedByCollege,
        industry
    });

    return res.status(201).json(
        new ApiResponse(201, {
            internship: internship
        }, "Internship posted successfully")
    );

})

const addJob = asyncHandler(async (req, res) => {

    const user = req.user;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    if (user.role !== "alumni") {
        throw new ApiError(403, "Only alumni can post jobs");
    }

    const {
        title,
        company,
        location,
        type,
        workType,
        description,
        responsibilities = [],
        benefits = [],
        eligibility = [],
        skills = [],
        workingDays,
        experienceRequired,
        salary,
        deadline,
        isPostedByCollege = false,
        industry
    } = req.body;

    // Process salary structure
    let salaryData = null;
    if (salary) {
        salaryData = {
            min: salary.min || 0,
            max: salary.max || salary.min || 0,
            currency: salary.currency || "INR",
            type: salary.type || "yearly"
        };
    }

    const job = await Job.create({
        postedBy: user._id,
        title,
        company,
        location,
        type,
        workType,
        description,
        responsibilities,
        benefits,
        eligibility,
        skills,
        workingDays,
        experienceRequired,
        salary: salaryData,
        deadline,
        isPostedByCollege,
        industry
    });

    if (!job) {
        throw new ApiError(500, "Error occurred while adding the job");
    }

    return res.status(201).json(
        new ApiResponse(201, {
            job: job
        }, "Job posted successfully")
    );
});


const getInternshipById = asyncHandler(async (req, res) => {
    const internshipId = req.params.id;


    const internship = await Internship.findById(internshipId);

    if (!internship) {
        throw new ApiError(404, "Internship not found");
    }

    if (internship.isPostedByCollege) {

        return res.status(200).json(
            new ApiResponse(200, {
                internship: internship
            }, "Internship fetched successfully")
        );
    }


    const internshipData = await Internship.aggregate([
        { $match: { _id: internship._id } },
        {
            $lookup: {
                from: "users",
                localField: "postedBy",
                foreignField: "_id",
                as: "user"
            }
        },
        {
            $unwind: "$user"
        },
        {
            $project: {
                title: 1,
                company: 1,
                location: 1,
                type: 1,
                workType: 1,
                description: 1,
                responsibilities: 1,
                benefits: 1,
                eligibility: 1,
                skills: 1,
                workingDays: 1,
                experienceRequired: 1,
                duration: 1,
                stipend: 1,
                deadline: 1,
                isPostedByCollege: 1,
                likes: 1,
                views: 1,
                applicants: 1,
                industry: 1,
                status: 1,
                user: {
                    uid: "$user.uid",
                    firstName: "$user.firstName",
                    lastName: "$user.lastName",
                    email: "$user.email",
                    role: "$user.role",
                    profileImage: "$user.profileImage",
                    coverImage: "$user.coverImage",
                    passoutYear: "$user.passoutYear",
                    department: "$user.department",
                }
            }
        }
    ]);


    if (internshipData.length === 0) {
        throw new ApiError(404, "Internship not found");
    }
    return res.status(200).json(
        new ApiResponse(200, {
            internship: internshipData[0]
        }, "Internship fetched successfully")
    );


})


const getJobById = asyncHandler(async (req, res) => {
    const jobId = req.params.id;

    const job = await Job.findById(jobId);
    if (!job) {
        throw new ApiError(404, "Job not found");
    }

    if (job.isPostedByCollege) {
        return res.status(200).json(
            new ApiResponse(200, {
                job: job
            }, "Job fetched successfully")
        );
    }

    const jobData = await Job.aggregate([
        { $match: { _id: job._id } },
        {
            $lookup: {
                from: "users",
                localField: "postedBy",
                foreignField: "_id",
                as: "user"
            }
        },
        {
            $unwind: "$user"
        },
        {
            $project: {
                title: 1,
                company: 1,
                location: 1,
                type: 1,
                workType: 1,
                description: 1,
                responsibilities: 1,
                benefits: 1,
                eligibility: 1,
                skills: 1,
                workingDays: 1,
                experienceRequired: 1,
                salary: 1,
                deadline: 1,
                isPostedByCollege: 1,
                likes: 1,
                views: 1,
                applicants: 1,
                industry: 1,
                status: 1,
                user: {
                    uid: "$user.uid",
                    firstName: "$user.firstName",
                    lastName: "$user.lastName",
                    email: "$user.email",
                    role: "$user.role",
                    profileImage: "$user.profileImage",
                    coverImage: "$user.coverImage",
                    passoutYear: "$user.passoutYear",
                    department: "$user.department",
                }
            }
        }
    ]);

    if (jobData.length === 0) {
        throw new ApiError(404, "Job not found");
    }
    return res.status(200).json(
        new ApiResponse(200, {
            job: jobData[0]
        }, "Job fetched successfully")
    );

})


const getAllJobs = asyncHandler(async (req, res) => {

    const jobs = await Job.find({ isVerified: true })

    if (!jobs) {
        throw new ApiError(404, "No jobs found")
    }

    return res.status(200).json(new ApiResponse(200, { jobs: jobs }, "Jobs have been fetched successfully"))

})


const getAllInternships = asyncHandler(async (req, res) => {

    const internships = await Internship.find({ isVerified: true })

    if (!internships) {
        throw new ApiError(404, "No Internships found")
    }

    return res.status(200).json(new ApiResponse(200, { internships: internships }, "Internships have been fetched successfully"))

})


const applyJob = asyncHandler(async (req, res) => {

    const user = req.user

    const jobId = req.params?.jobId

    if (!jobId) {
        throw new ApiError(400, "Job ID is required");
    }

    const job = await Job.findById(new mongoose.Types.ObjectId(jobId));

    if (!job) {
        throw new ApiError(404, "Job not found");
    }

    if (job.applicants.includes(user._id)) {
        throw new ApiError(409, "User already applied for this job");
    }

    job.applicants.push(user._id);
    await job.save();

    return res.status(200).json(new ApiResponse(200, {}, "User applied for this job successfully"));


})


const applyInternship = asyncHandler(async (req, res) => {

    const user = req.user

    const internshipId = req.params?.internshipId




    if (!internshipId) {
        throw new ApiError(400, "Internship ID is required");
    }

    const internship = await Internship.findById(new mongoose.Types.ObjectId(internshipId));

    if (!internship) {
        throw new ApiError(404, "Internship not found");
    }

    if (internship.applicants.includes(user._id)) {
        throw new ApiError(409, "User already applied for this internship");
    }

    internship.applicants.push(user._id);
    await internship.save();

    return res.status(200).json(new ApiResponse(200, {}, "User applied for this internship successfully"));

})


const checkJobApplication = asyncHandler(async (req, res) => {

    const user = req.user

    const jobId = req.params?.jobId

    if (!jobId) {
        throw new ApiError(400, "Job ID is required");
    }

    const job = await Job.findById(new mongoose.Types.ObjectId(jobId));

    if (!job) {
        throw new ApiError(404, "Job not found");
    }

    if (job.applicants.includes(user._id)) {
        return res.status(200).json(new ApiResponse(200, { applied: true }, "User has applied for this job"));
    } else {
        return res.status(200).json(new ApiResponse(200, { applied: false }, "User has not applied for this job"));
    }

})


const checkInternshipApplication = asyncHandler(async (req, res) => {

    const user = req.user

    const internshipId = req.params?.internshipId

    if (!internshipId) {
        throw new ApiError(400, "Internship ID is required");
    }

    const internship = await Internship.findById(new mongoose.Types.ObjectId(internshipId));

    if (!internship) {
        throw new ApiError(404, "Internship not found");
    }

    if (internship.applicants.includes(user._id)) {
        return res.status(200).json(new ApiResponse(200, { applied: true }, "User has applied for this internship"));
    } else {
        return res.status(200).json(new ApiResponse(200, { applied: false }, "User has not applied for this internship"));
    }

})

// Like/Unlike Job
const likeJob = asyncHandler(async (req, res) => {
    const user = req.user;
    const jobId = req.params.id;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    const job = await Job.findById(jobId);
    if (!job) {
        throw new ApiError(404, "Job not found");
    }

    const isLiked = job.likes.includes(user._id);
    
    if (isLiked) {
        // Unlike
        job.likes = job.likes.filter(id => !id.equals(user._id));
    } else {
        // Like
        job.likes.push(user._id);
    }

    await job.save();

    return res.status(200).json(
        new ApiResponse(200, {
            liked: !isLiked,
            likesCount: job.likes.length
        }, isLiked ? "Job unliked successfully" : "Job liked successfully")
    );
});

// Like/Unlike Internship
const likeInternship = asyncHandler(async (req, res) => {
    const user = req.user;
    const internshipId = req.params.id;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    const internship = await Internship.findById(internshipId);
    if (!internship) {
        throw new ApiError(404, "Internship not found");
    }

    const isLiked = internship.likes.includes(user._id);
    
    if (isLiked) {
        // Unlike
        internship.likes = internship.likes.filter(id => !id.equals(user._id));
    } else {
        // Like
        internship.likes.push(user._id);
    }

    await internship.save();

    return res.status(200).json(
        new ApiResponse(200, {
            liked: !isLiked,
            likesCount: internship.likes.length
        }, isLiked ? "Internship unliked successfully" : "Internship liked successfully")
    );
});

// Track Job View
const trackJobView = asyncHandler(async (req, res) => {
    const user = req.user;
    const jobId = req.params.id;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    const job = await Job.findById(jobId);
    if (!job) {
        throw new ApiError(404, "Job not found");
    }

    // Check if user already viewed this job recently (within last hour)
    const existingView = job.views.find(view => 
        view.user.equals(user._id) && 
        (new Date() - view.viewedAt) < 60 * 60 * 1000 // 1 hour
    );

    if (!existingView) {
        job.views.push({
            user: user._id,
            viewedAt: new Date()
        });
        await job.save();
    }

    return res.status(200).json(
        new ApiResponse(200, {
            viewsCount: job.views.length
        }, "Job view tracked successfully")
    );
});

// Track Internship View
const trackInternshipView = asyncHandler(async (req, res) => {
    const user = req.user;
    const internshipId = req.params.id;

    if (!user) {
        throw new ApiError(400, "User not found");
    }

    const internship = await Internship.findById(internshipId);
    if (!internship) {
        throw new ApiError(404, "Internship not found");
    }

    // Check if user already viewed this internship recently (within last hour)
    const existingView = internship.views.find(view => 
        view.user.equals(user._id) && 
        (new Date() - view.viewedAt) < 60 * 60 * 1000 // 1 hour
    );

    if (!existingView) {
        internship.views.push({
            user: user._id,
            viewedAt: new Date()
        });
        await internship.save();
    }

    return res.status(200).json(
        new ApiResponse(200, {
            viewsCount: internship.views.length
        }, "Internship view tracked successfully")
    );
});

export {
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
};















