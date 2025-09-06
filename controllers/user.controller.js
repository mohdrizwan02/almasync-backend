import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Education } from "../models/education.model.js";
import { Experience } from "../models/experience.model.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";


const getCurrentUser = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
        throw new ApiError(500, "Server error occurred");
    }

    const userData = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(user._id),
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
                education: { $arrayElemAt: ["$education.education", 0] },
                experience: { $arrayElemAt: ["$experience.experience", 0] },
            },
        },
        {
            $project: {
                password: 0,
                verifyOtp: 0,
                __v: 0,
                ...(user.role === "student"
                    ? {
                        isEmployed: 0,
                        availableForMentorship: 0,
                        mentorshipExperience: 0,
                        mentorshipTopics: 0,
                    }
                    : {}),
            },
        },
    ]);

    if (!userData || userData.length === 0) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { user: userData[0] },
            "Current user data has been fetched successfully"
        )
    );
});


const getUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(userId),
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
                education: { $arrayElemAt: ["$education.education", 0] },
                experience: { $arrayElemAt: ["$experience.experience", 0] },
            },
        },
        {
            $project: {
                password: 0,
                verifyOtp: 0,
                __v: 0,
                ...(req.user?.role === "student"
                    ? {
                        isEmployed: 0,
                        availableForMentorship: 0,
                        mentorshipExperience: 0,
                        mentorshipTopics: 0,
                    }
                    : {}),
            },
        },
    ]);

    if (!user || user.length === 0) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, { user: user[0] }, "User data fetched successfully")
    );


})





const getStudents = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        passoutYear,
        department,
        skills,
        sortBy = "recent", // "recent" | "oldest" | "firstName"
    } = req.query;

    const matchStage = {
        role: "student",
        isProfileVerified: true,
    };

    if (passoutYear) matchStage.passoutYear = Number(passoutYear);
    if (department) matchStage.department = department;
    if (skills) matchStage.skills = { $in: skills.split(",") };

    const pipeline = [
        { $match: matchStage },

        {
            $lookup: {
                from: "educations",
                localField: "_id",
                foreignField: "user",
                as: "education"
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
                education: { $arrayElemAt: ["$education.education", 0] },
                experience: { $arrayElemAt: ["$experience.experience", 0] },
            }
        },
    ];

    // Sorting
    let sortStage = {};
    if (sortBy === "recent") sortStage = { createdAt: -1 };
    else if (sortBy === "oldest") sortStage = { createdAt: 1 };
    else if (sortBy === "firstName") sortStage = { firstName: 1 };

    pipeline.push({ $sort: sortStage });

    // Projection
    pipeline.push({
        $project: {
            uid: 1,
            email: 1,
            profileImage: 1,
            coverImage: 1,
            skills: 1,
            department: 1,
            degree: 1,
            passoutYear: 1,
            isActive: 1,
            firstName: 1,
            lastName: 1,
            education: 1,
            experience: 1,
        }
    });

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    const students = await User.aggregate(pipeline);

    if (!students || students.length === 0) {
        throw new ApiError(404, "No students found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { students },
            "Verified students have been fetched successfully"
        )
    );
})





const getAlumni = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        passoutYear,
        department,
        skills,
        company,
        location,
        isEmployed,
        sortBy = "recent", // "recent" | "oldest" | "firstName"
    } = req.query;

    const matchStage = {
        role: "alumni",
        isProfileVerified: true,
    };

    if (passoutYear) matchStage.passoutYear = Number(passoutYear);
    if (department) matchStage.department = department;
    if (skills) matchStage.skills = { $in: skills.split(",") };

    const pipeline = [
        { $match: matchStage },
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
                education: { $arrayElemAt: ["$education.education", 0] },
                experience: { $arrayElemAt: ["$experience.experience", 0] },
            },
        },
    ];

    // Experience-based filters
    const experienceFilters = [];

    if (company) {
        experienceFilters.push({
            "experience.company": { $regex: company, $options: "i" },
        });
    }

    if (location) {
        experienceFilters.push({
            "experience.location": { $regex: location, $options: "i" },
        });
    }

    if (isEmployed === "true") {
        experienceFilters.push({ experience: { $ne: null } });
    }

    if (isEmployed === "false") {
        experienceFilters.push({ experience: null });
    }

    if (experienceFilters.length > 0) {
        pipeline.push({ $match: { $and: experienceFilters } });
    }

    // Sorting
    let sortStage = {};
    if (sortBy === "recent") sortStage = { createdAt: -1 };
    else if (sortBy === "oldest") sortStage = { createdAt: 1 };
    else if (sortBy === "firstName") sortStage = { firstName: 1 };

    pipeline.push({ $sort: sortStage });

    // Projection
    pipeline.push({
        $project: {
            uid: 1,
            email: 1,
            profileImage: 1,
            coverImage: 1,
            skills: 1,
            department: 1,
            degree: 1,
            passoutYear: 1,
            isActive: 1,
            firstName: 1,
            lastName: 1,
            education: 1,
            experience: 1,
        }
    });

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    const alumni = await User.aggregate(pipeline);

    if (!alumni || alumni.length === 0) {
        throw new ApiError(404, "No alumni found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { alumni },
            "Verified alumni have been fetched successfully"
        )
    );
})


const getStudentById = asyncHandler(async (req, res) => {
    const { studentId } = req.params;

    console.log(studentId)

    if (!studentId) {
        throw new ApiError(400, "Student ID is required");
    }

    const student = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(studentId),
                role: "student",
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
                    $ifNull: [{ $arrayElemAt: ["$experience.experience", 0] }, []],
                },
            },
        },
        {
            $project: {
                password: 0,
                verifyOtp: 0,
                isEmployed: 0,
                availableForMentorship: 0,
                mentorshipExperience: 0,
                mentorshipTopics: 0,
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
    const { alumniId } = req.params;

    if (!alumniId) {
        throw new ApiError(400, "Alumni ID is required");
    }

    const alumni = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(alumniId),
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
                password: 0,
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

const getCurrentUserProfile = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const userData = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(userId),
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
                education: { $arrayElemAt: ["$education.education", 0] },
                experience: { $arrayElemAt: ["$experience.experience", 0] },
            },
        },
        {
            $project: {
                password: 0,
                verifyOtp: 0,
                __v: 0,
                ...(user.role === "student"
                    ? {
                        isEmployed: 0,
                        availableForMentorship: 0,
                        mentorshipExperience: 0,
                        mentorshipTopics: 0,
                    }
                    : {}),
            },
        },
    ]);
    if (!userData || userData.length === 0) {
        throw new ApiError(404, "User not found");
    }
    return res.status(200).json(
        new ApiResponse(
            200,
            { user: userData[0] },
            "Current user profile data has been fetched successfully"
        )
    );

});


const checkProfileCompletionStatus = asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const userData = await User.findById(userId).select("isProfileComplete");



    return res.status(200).json(
        new ApiResponse(
            200,
            { isProfileComplete: userData.isProfileComplete },
            "Profile completion status fetched successfully"
        )
    );


})


const updatePersonalDetails = asyncHandler(async (req, res) => {
    const user = req.user



    const {
        firstName,
        lastName,
        gender,
        dateOfBirth,
        mobileNumber,
        address,
        about,
    } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
            $set: {
                firstName,
                lastName,
                gender,
                dateOfBirth,
                mobileNumber,
                address,
                about,
            },
        },
        { new: true }
    );

    if (!updatedUser) throw new ApiError(404, "User not found");

    res.status(200).json(
        new ApiResponse(200, { user: updatedUser }, "Personal info updated")
    );
})


const updatePublicDetails = asyncHandler(async (req, res) => {

    const user = req.user


    const {
        profileHeadline,
        communicationLanguages,
        hobbies,
        linkedin,
        github,
        twitter,
        portfolio
    } = req.body;




    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
            $set: {
                profileHeadline,
                communicationLanguages,
                hobbies,
                "socials.linkedin": linkedin,
                "socials.github": github,
                "socials.twitter": twitter,
                "socials.portfolio": portfolio,
            }
        },
        { new: true }
    );

    if (!updatedUser) throw new ApiError(404, "User not found");

    res.status(200).json(
        new ApiResponse(200, { user: updatedUser }, "Public media updated")
    );
});


const updateEmploymentSkillsAndMentorship = asyncHandler(async (req, res) => {

    const user = req.user

    const {
        isEmployed,
        currentJobTitle,
        currentCompany,
        currentSalary,
        workLocation,
        skills,
        availableForMentorship,
        mentorshipExperience,
        mentorshipTopics,
        mentorshipsNeeds,
    } = req.body;

    // Process current salary structure
    let salaryData = null;
    if (currentSalary && isEmployed) {
        salaryData = {
            amount: currentSalary.amount || 0,
            currency: currentSalary.currency || "INR",
            type: currentSalary.type || "yearly"
        };
    }

    const updateData = {
        isEmployed,
        skills,
        availableForMentorship,
        mentorshipExperience,
        mentorshipTopics,
        mentorshipsNeeds,
    };

    // Only add employment fields if user is employed
    if (isEmployed) {
        updateData.currentJobTitle = currentJobTitle;
        updateData.currentCompany = currentCompany;
        updateData.currentSalary = salaryData;
        updateData.workLocation = workLocation;
    } else {
        // Clear employment fields if not employed
        updateData.currentJobTitle = null;
        updateData.currentCompany = null;
        updateData.currentSalary = null;
        updateData.workLocation = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
            $set: updateData,
        },
        { new: true }
    );

    if (!updatedUser) throw new ApiError(404, "User not found");

    res.status(200).json(
        new ApiResponse(200, { user: updatedUser }, "Employment and skills updated")
    );
})


const updateCoverImage = asyncHandler(async (req, res) => {

    const user = req.user;

    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const coverImagePath = req.file?.path;

    if (!coverImagePath) {
        throw new ApiError(400, "Cover image is required");
    }

    const response = await uploadOnCloudinary(coverImagePath);

    if (!response) {
        throw new ApiError(500, "Cloudinary image upload is failed");
    }

    const coverImageUrl = response.url;






    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { coverImage: coverImageUrl },
        { new: true }
    );

    if (!updatedUser) throw new ApiError(404, "User not found");

    return res.status(200).json(
        new ApiResponse(200, {}, "Cover image updated successfully")
    );

});

const updateProfileImage = asyncHandler(async (req, res) => {

    const user = req.user;

    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const profileImagePath = req.file?.path;

    if (!profileImagePath) {
        throw new ApiError(400, "profile image is required");
    }

    const response = await uploadOnCloudinary(profileImagePath);

    if (!response) {
        throw new ApiError(500, "Cloudinary image upload is failed");
    }

    const profileImageUrl = response.url;






    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { profileImage: profileImageUrl },
        { new: true }
    );

    if (!updatedUser) throw new ApiError(404, "User not found");

    return res.status(200).json(
        new ApiResponse(200, {}, "Cover image updated successfully")
    );

});


const updateEducation = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const educationData = req.body;

    if (!educationData) {
        throw new ApiError(400, "Education data is required");
    }


    const currentEducation = await Education.findOne({ user: userId });

    if (!currentEducation) {
        const newEducation = await Education.create({
            user: userId,
            education: educationData,
        })

        if (!newEducation) {
            throw new ApiError(500, "Failed to update new education");
        }

        return res.status(201).json(
            new ApiResponse(201, {}, "Education Updated successfully")
        );
    }

    currentEducation.education = educationData;

    const updatedEducation = await currentEducation.save();

    if (!updatedEducation) {
        throw new ApiError(500, "Failed to update education");
    }
    return res.status(200).json(
        new ApiResponse(200, {}, "Education updated successfully")
    );



})


const updateExperience = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) {
        throw new ApiError(401, "Unauthorized access");
    }

    const userId = user._id;

    const experienceData = req.body;

    if (!experienceData) {
        throw new ApiError(400, "Experience data is required");
    }

    // Process experience data to match new model structure
    const processedExperience = experienceData.map(exp => {
        const processedExp = {
            company: exp.company,
            position: exp.position,
            location: exp.location,
            currentlyWorking: exp.currentlyWorking || false,
            type: exp.type, // internship, job, freelance, other
            workType: exp.workType || "onsite", // remote, onsite, hybrid
            start: new Date(exp.start),
            description: exp.description,
            skills: exp.skills || [],
            achievements: exp.achievements || [],
            industry: exp.industry
        };

        // Only add end date if not currently working
        if (!exp.currentlyWorking && exp.end) {
            processedExp.end = new Date(exp.end);
        }

        // Process salary if provided
        if (exp.salary && exp.salary > 0) {
            processedExp.salary = exp.salary;
            processedExp.salaryCurrency = exp.salaryCurrency || "INR";
            processedExp.salaryType = exp.salaryType || "monthly";
        }

        return processedExp;
    });

    const currentExperience = await Experience.findOne({ user: userId });

    if (!currentExperience) {
        const newExperience = await Experience.create({
            user: userId,
            experience: processedExperience,
        });

        if (!newExperience) {
            throw new ApiError(500, "Failed to create new experience");
        }

        return res.status(201).json(
            new ApiResponse(201, { experience: newExperience }, "Experience created successfully")
        );
    }

    currentExperience.experience = processedExperience;

    const updatedExperience = await currentExperience.save();

    if (!updatedExperience) {
        throw new ApiError(500, "Failed to update experience");
    }

    return res.status(200).json(
        new ApiResponse(200, { experience: updatedExperience }, "Experience updated successfully")
    );

})














export {
    getCurrentUser,
    getUser,
    getStudents,
    getAlumni,
    getStudentById,
    getAlumniById,
    getCurrentUserProfile,
    checkProfileCompletionStatus,
    updateEmploymentSkillsAndMentorship,
    updatePersonalDetails,
    updatePublicDetails,
    updateExperience,
    updateEducation,
    updateProfileImage,
    updateCoverImage,



}







































