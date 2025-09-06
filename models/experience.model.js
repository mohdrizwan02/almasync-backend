import mongoose from "mongoose";

const ExperienceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },

  experience: [
    {
      company: {
        type: String,
        required: true,
        trim: true,
      },
      position: {
        type: String,
        required: true,
        trim: true,
      },
      location: {
        type: String,
        trim: true,
      },
      currentlyWorking: {
        type: Boolean,
        default: false,
      },
      // internship or job or freelance
      type: {
        type: String,
        enum: ["internship", "job", "freelance", "other"],
        required: true,
      },
      // remote or onsite or hybrid
      workType: {
        type: String,
        enum: ["remote", "onsite", "hybrid"],
        default: "onsite",
      },
      start: {
        type: Date,
        required: true,
      },
      end: {
        type: Date,
        validate: {
          validator: function() {
            return this.currentlyWorking || this.end;
          },
          message: 'End date is required when not currently working'
        }
      },
      description: {
        type: String,
        trim: true,
      },
      skills: [
        {
          type: String,
          trim: true,
        },
      ],
      // For better analytics
      salary: {
        type: Number,
        min: 0,
      },
      salaryCurrency: {
        type: String,
        default: "INR",
      },
      salaryType: {
        type: String,
        enum: ["monthly", "yearly", "hourly", "project"],
        default: "monthly",
      },
      achievements: [
        {
          type: String,
          trim: true,
        },
      ],
      // Industry for better categorization
      industry: {
        type: String,
        trim: true,
      },
    },
  ],
}, {
  timestamps: true,
});

// Index for better query performance
ExperienceSchema.index({ user: 1 });
ExperienceSchema.index({ "experience.company": 1 });
ExperienceSchema.index({ "experience.type": 1 });
ExperienceSchema.index({ "experience.currentlyWorking": 1 });

export const Experience = mongoose.model("experiences", ExperienceSchema);
