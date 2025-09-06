import mongoose from "mongoose";

const InternshipSchema = new mongoose.Schema(
  {
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    
    // For analytics - users who liked this internship
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    
    // For analytics - users who viewed this internship
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
      required: [true, "internship title is required"],
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

    // full-time part-time
    type: {
      type: String,
      enum: ["full-time", "part-time"],
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
      default: 0,
    },

    duration: {
      type: String,
      trim: true,
    },

    stipend: {
      amount: { type: Number, min: 0 },
      currency: { type: String, default: "INR" },
      type: { type: String, enum: ["monthly", "lump-sum", "per-hour"], default: "monthly" },
    },
    
    deadline: {
      type: Date,
    },
    
    // For better categorization
    industry: {
      type: String,
      trim: true,
    },
    
    // Internship status
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
InternshipSchema.index({ location: 1 });
InternshipSchema.index({ type: 1 });
InternshipSchema.index({ workType: 1 });
InternshipSchema.index({ skills: 1 });
InternshipSchema.index({ isVerified: 1 });
InternshipSchema.index({ status: 1 });
InternshipSchema.index({ createdAt: -1 });

export const Internship = mongoose.model("internships", InternshipSchema);
