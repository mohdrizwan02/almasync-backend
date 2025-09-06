import mongoose from "mongoose";

const CertificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
  },

  certification: [
    {
      name: String,
      organization: String,
      start: Date,
      end: Date,
      id: String,
      url: String,
      skills: [
        {
          type: String,
        },
      ],
    },
  ],
});

export const Certification = mongoose.model("certifications", CertificationSchema);
