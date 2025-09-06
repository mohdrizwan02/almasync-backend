import mongoose from "mongoose";

const MentorshipCategoriesSchema = new mongoose.Schema({
  mentorshipCategories: [String],
});

export const MentorshipCategory = mongoose.model(
  "mentorshipcategories",
  MentorshipCategoriesSchema
);
