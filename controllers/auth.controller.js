import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import {
  generateTokenPair,
  verifyRefreshToken,
  createUserPayload,
  getCookieOptions,
  extractToken,
  validateTokenPayload,
  generateAccessToken,
  verifyAccessToken,
} from "../utils/jwt.js";

import { v4 as uuidv4 } from "uuid";

const registerUser = asyncHandler(async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    password,
    college,
    uid,
    admissionYear,
    passoutYear,
    degree,
    department,
    role,
  } = req.body;

  if (
    !email ||
    !firstName ||
    !lastName ||
    !password ||
    !college ||
    !uid ||
    !admissionYear ||
    !passoutYear ||
    !degree ||
    !department ||
    !role
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const userExists = await User.findOne({
    $or: [
      {
        email,
      },
      {
        uid,
      },
    ],
  });
  if (userExists) {
    throw new ApiError(409, "user already existed please login");
  }

  const user = await User.create({
    email,
    firstName,
    lastName,
    password,
    college,
    uid,
    admissionYear,
    passoutYear,
    degree,
    department,
    role,
    isActive: true, // Ensure user is active upon registration
  });

  if (!user) {
    throw new ApiError(500, "Error occurred while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, {}, "user has been registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, uid, password, rememberMe = false } = req.body;

  console.log("Login attempt:", { email, uid, rememberMe });

  const user = await User.findOne({
    $or: [
      {
        email,
      },
      {
        uid,
      },
    ],
  });

  console.log(
    "Found user:",
    user ? { id: user._id, email: user.email, uid: user.uid } : null
  );

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Check if account is locked
  if (user.isAccountLocked()) {
    throw new ApiError(
      429,
      "Account temporarily locked due to too many failed login attempts. Please try again later."
    );
  }

  // Verify password
  const passwordCorrect = await user.isPasswordCorrect(password);
  if (!passwordCorrect) {
    // Increment login attempts
    await user.incrementLoginAttempts();
    throw new ApiError(401, "Invalid password");
  }

  // Reset login attempts on successful login
  if (user.loginAttempts.count > 0) {
    await user.resetLoginAttempts();
  }

  // Create user payload for JWT
  const userPayload = createUserPayload(user);

  // Create session ID first
  const sessionId = uuidv4();

  // Generate token pair with session ID
  const tokenData = await generateTokenPair(userPayload, rememberMe, sessionId);

  // Store refresh token in database with session link
  const refreshTokenData = {
    token: tokenData.refreshToken,
    tokenId: tokenData.refreshTokenId,
    expiresAt: new Date(
      Date.now() +
        (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
    ),
    userAgent: req.get("User-Agent") || "",
    ipAddress: req.ip || req.connection.remoteAddress || "",
    rememberMe: rememberMe,
  };
  await user.addRefreshToken(refreshTokenData);

  // Add session tracking
  await user.addSession({
    sessionId,
    deviceInfo: req.get("User-Agent") || "Unknown Device",
    ipAddress: req.ip || req.connection.remoteAddress || "",
  }); // Get user data without sensitive fields
  const userData = await User.findById(user._id).select(
    "_id uid email firstName lastName role isProfileVerified isProfileComplete"
  );

  return res
    .status(200)
    .cookie("accessToken", tokenData.accessToken, getCookieOptions("access"))
    .cookie(
      "refreshToken",
      tokenData.refreshToken,
      getCookieOptions("refresh", rememberMe)
    )
    .json(
      new ApiResponse(
        200,
        {
          user: userData,
          tokens: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            tokenType: tokenData.tokenType,
            expiresIn: tokenData.expiresIn,
          },
          sessionId,
        },
        "User has been successfully logged in"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const refreshToken =
    extractToken(req, "refresh") || req.cookies?.refreshToken;

  if (refreshToken) {
    try {
      const decoded = await verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.userId);

      if (user) {
        // Use tokenId from decoded payload (now returned by our updated JWT utils)
        const tokenIdToRevoke = decoded.tokenId || decoded.jti; // Fallback to jti for backwards compatibility

        if (tokenIdToRevoke) {
          // Revoke the specific refresh token
          await user.revokeRefreshToken(tokenIdToRevoke);
        }

        // Remove session if sessionId is available in token payload
        if (decoded.sessionId) {
          await user.removeSession(decoded.sessionId);
        } else if (req.body.sessionId) {
          // Fallback to sessionId from request body
          await user.removeSession(req.body.sessionId);
        }

        // Save user changes
        await user.save({ validateBeforeSave: false });
      }
    } catch (error) {
      // Token verification failed, but we still want to clear cookies
      console.log(
        "Error verifying refresh token during logout:",
        error.message
      );
    }
  }

  return res
    .status(200)
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
    })
    .json(new ApiResponse(200, {}, "User successfully logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken =
    extractToken(req, "refresh") || req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token not found");
  }

  try {
    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);
    validateTokenPayload(decoded, "refresh");

    // Find user and validate refresh token
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token - user not found");
    }

    // Use tokenId from decoded payload, fallback to jti for backwards compatibility
    const tokenIdToCheck = decoded.tokenId || decoded.jti;

    // Check if refresh token is valid in database
    if (!user.isRefreshTokenValid(tokenIdToCheck)) {
      throw new ApiError(401, "Refresh token has been revoked or expired");
    }

    // Remove expired tokens
    await user.removeExpiredRefreshTokens();

    // Generate new token pair with session continuity
    const userPayload = createUserPayload(user);
    const tokenData = await generateTokenPair(
      userPayload,
      false,
      decoded.sessionId
    );

    // Revoke old refresh token and add new one
    await user.revokeRefreshToken(tokenIdToCheck);

    const newRefreshTokenData = {
      token: tokenData.refreshToken,
      tokenId: tokenData.refreshTokenId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent: req.get("User-Agent") || "",
      ipAddress: req.ip || req.connection.remoteAddress || "",
    };

    await user.addRefreshToken(newRefreshTokenData);

    // Update session access if session exists
    if (decoded.sessionId) {
      await user.updateSessionAccess(decoded.sessionId);
    } else if (req.body.sessionId) {
      await user.updateSessionAccess(req.body.sessionId);
    }

    return res
      .status(200)
      .cookie("accessToken", tokenData.accessToken, getCookieOptions("access"))
      .cookie(
        "refreshToken",
        tokenData.refreshToken,
        getCookieOptions("refresh")
      )
      .json(
        new ApiResponse(
          200,
          {
            tokens: {
              accessToken: tokenData.accessToken,
              refreshToken: tokenData.refreshToken,
              tokenType: tokenData.tokenType,
              expiresIn: tokenData.expiresIn,
            },
          },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    // Clear invalid cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    if (error.message.includes("expired")) {
      throw new ApiError(401, "Refresh token expired. Please login again.");
    }
    throw new ApiError(401, `Invalid refresh token: ${error.message}`);
  }
});

const verifyUserAccountForPasswordChange = asyncHandler(async (req, res) => {
  const email = req.params?.email;

  if (!email) {
    throw new ApiError(400, "Email parameter is required");
  }

  const user = await User.findOne({
    email,
  });

  if (!user) {
    throw new ApiError(404, "User not found with these credentials");
  }

  const userData = await User.findById(user._id).select(
    "uid email firstName lastName role"
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, userData, "User exists and successfully checked")
    );
});

const sendOtpForPasswordChange = asyncHandler(async (req, res) => {
  const email = req.params?.email;

  const otp = Math.floor(100000 + Math.random() * 900000);

  const user = await User.findOneAndUpdate(
    { email },
    { verifyOtp: otp },
    {
      new: true,
    }
  );

  if (!user) {
    throw new ApiError(
      500,
      "error occurred while getting the user and sending otp"
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, {}, "Otp has been successfully sent to the user")
    );
});

const verifyOtpForPasswordChange = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const email = req.params?.email;

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isOtpCorrect = otp == user.verifyOtp;
  if (!isOtpCorrect) {
    throw new ApiError(400, "Invalid OTP. Please provide the correct OTP");
  }

  user.verifyOtp = undefined;
  await user.save();

  // Create a temporary password reset payload
  const resetPayload = {
    _id: user._id.toString(),
    uid: user.uid,
    email: user.email,
    purpose: "password-reset",
  };

  // Generate a short-lived access token for password reset (5 minutes)
  const resetToken = await generateAccessToken(resetPayload);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { resetToken },
        "OTP has been successfully verified. Use the reset token to change password."
      )
    );
});

const changePasswordUsingOldPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const email = req.params?.email;

  const userData = await User.findOne({ email });
  if (!userData) {
    throw new ApiError(401, "Unauthorized request :: No user found");
  }

  const isCorrectPassword = await userData.isPasswordCorrect(oldPassword);

  if (!isCorrectPassword) {
    throw new ApiError(
      401,
      "your password is incorrect please provide your old password"
    );
  }

  const user = await User.findById(userData._id);

  user.password = newPassword;

  const response = await user.save();

  if (!response) {
    throw new ApiError(500, "error occured while updating the password");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password has been updated successfully"));
});

const changePasswordUsingOtp = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const resetToken = req.params?.token;

  if (!resetToken) {
    throw new ApiError(401, "Reset token not found");
  }

  try {
    // Verify the reset token
    const decoded = await verifyAccessToken(resetToken);

    // Check if token is for password reset purpose
    if (decoded.purpose !== "password-reset") {
      throw new ApiError(400, "Invalid reset token purpose");
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new ApiError(401, "User not found");
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Revoke all refresh tokens for security
    await user.revokeAllRefreshTokens();

    // Clear all sessions
    await user.clearAllSessions();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "Password has been updated successfully. Please login with your new password."
        )
      );
  } catch (error) {
    if (error.message.includes("expired")) {
      throw new ApiError(
        400,
        "Reset token has expired. Please request a new OTP."
      );
    }
    throw new ApiError(400, `Invalid reset token: ${error.message}`);
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  verifyUserAccountForPasswordChange,
  changePasswordUsingOldPassword,
  changePasswordUsingOtp,
  sendOtpForPasswordChange,
  verifyOtpForPasswordChange,
};
