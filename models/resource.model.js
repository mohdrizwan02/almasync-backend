import mongoose from "mongoose";

const ResourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["pdf", "video", "link", "post"] },
    title: String,
    content: String,
    tags: [String],

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedByRole: { type: String, enum: ["alumni", "college"] },
  },
  { timestamps: true }
);

export const Resource = mongoose.model("resourses", ResourceSchema);
