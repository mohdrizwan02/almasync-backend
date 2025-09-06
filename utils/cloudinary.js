import { v2 as cloudinary } from "cloudinary";

import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (filePath) => {
  try {
    if (!filePath) {
      return null;
    }
    const response = await cloudinary.uploader.upload(filePath, {
      resource_type: "auto",
    });
    console.log("file uploaded successfully", response.url);
    fs.unlinkSync(filePath);
    return response;
  } catch (error) {
    console.log("upload failed", error);
    fs.unlinkSync(filePath);
    return null;
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    const response = await cloudinary.uploader.destroy(publicId);
    console.log("Deleted:", response);
    return response;
  } catch (err) {
    console.error("Delete Error:", err);
    throw err;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
