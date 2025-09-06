import mongoose from "mongoose";

const EducationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
  },

  education: [
    {
      institution: String,
      degree: String,
      field: String,
      start: Number,
      end: Number,
      grade: String,
      description: String,
      skills: [
        {
          type: String,
        },
      ],
    },
  ],
});

export const Education = mongoose.model("educations",EducationSchema);
