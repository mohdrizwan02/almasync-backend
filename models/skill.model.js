import mongoose from "mongoose";

const skillSchema = new mongoose.Schema({
  skills: [String],
});

export const Skill = mongoose.model("skills", skillSchema);

