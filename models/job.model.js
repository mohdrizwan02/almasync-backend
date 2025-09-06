import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    
    // For analytics - users who liked this job
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    
    // For analytics - users who viewed this job
    views: [{ 
      user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      viewedAt: { type: Date, default: Date.now }
    }],
    
    isVerified: {
      type: Boolean,
      default: false,
    },
    
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },

    isPostedByCollege: {
      type: Boolean,
      default: false,
    },
    
    title: {
      type: String,
      required: [true, "job title is required"],
      trim: true,
    },
    
    company: {
      type: String,
      required: true,
      trim: true,
    },
    
    location: {
      type: String,
      required: true,
      trim: true,
    },

    // full-time part-time contract
    type: {
      type: String,
      enum: ["full-time", "part-time", "contract", "temporary"],
      default: "full-time",
    },

    // onsite remote hybrid
    workType: {
      type: String,
      enum: ["onsite", "remote", "hybrid"],
      default: "onsite",
    },

    description: {
      type: String,
      trim: true,
    },

    responsibilities: [
      {
        type: String,
        trim: true,
      },
    ],
    
    benefits: [
      {
        type: String,
        trim: true,
      },
    ],
    
    eligibility: [
      {
        type: String,
        trim: true,
      },
    ],
    
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    
    workingDays: {
      type: Number,
      min: 1,
      max: 7,
    },
    
    experienceRequired: {
      type: Number,
      min: 0,
    },

    salary: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, default: "INR" },
      type: { type: String, enum: ["monthly", "yearly", "hourly"], default: "yearly" },
    },
    
    deadline: {
      type: Date,
    },
    
    // For better categorization
    industry: {
      type: String,
      trim: true,
    },
    
    // Job status
    status: {
      type: String,
      enum: ["active", "closed", "paused"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
JobSchema.index({ location: 1 });
JobSchema.index({ type: 1 });
JobSchema.index({ workType: 1 });
JobSchema.index({ skills: 1 });
JobSchema.index({ isVerified: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ createdAt: -1 });

export const Job = mongoose.model("jobs", JobSchema);
