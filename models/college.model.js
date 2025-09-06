import mongoose from "mongoose";

const CollegeSchema = new mongoose.Schema(
  {
    collegeCode: String,
    collegeName: String,
    collegeLogo: String,
    collegeDegrees: [
      {
        degreeName: String,
        degreeDepartments: [
          {
            departmentName: String,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const College = mongoose.model("colleges", CollegeSchema);
