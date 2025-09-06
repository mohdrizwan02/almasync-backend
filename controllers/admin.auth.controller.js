import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  generateTokenPair,
  verifyRefreshToken,
  createAdminPayload,
  getCookieOptions,
  extractToken,
  validateTokenPayload,
} from "../utils/jwt.js";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import { v4 as uuidv4 } from 'uuid';

const registerAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "All fields are required");
  }

  const admin = await User.findOne({ email: email });
  if (admin) {
    throw new ApiError(409, "Admin with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newAdmin = await User.create({
    uid: email.split("@")[0],
    email,
    password,

    role: "admin",
  });

  if (!newAdmin) {
    throw new ApiError(500, "error creating the admin");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, {}, "Admin has been successfully created"));
});

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "All fields are required");
  }

  const admin = await User.findOne({ email: email, role: "admin" });
  if (!admin) {
    throw new ApiError(404, "Admin details invalid");
  }

  // Check if account is locked
  if (admin.isAccountLocked()) {
    throw new ApiError(429, "Account temporarily locked due to too many failed login attempts. Please try again later.");
  }

  // Verify password
  const passwordCorrect = await admin.isPasswordCorrect(password);
  if (!passwordCorrect) {
    // Increment login attempts
    await admin.incrementLoginAttempts();
    throw new ApiError(401, "Invalid password and credentials");
  }

  // Reset login attempts on successful login
  if (admin.loginAttempts.count > 0) {
    await admin.resetLoginAttempts();
  }

  // Create admin payload for JWT
  const adminPayload = createAdminPayload(admin);

  // Generate token pair
  const { accessToken, refreshToken, tokenType, expiresIn } = await generateTokenPair(adminPayload);

  // Store refresh token in database
  const refreshTokenData = {
    token: refreshToken,
    tokenId: uuidv4(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    userAgent: req.get('User-Agent') || '',
    ipAddress: req.ip || req.connection.remoteAddress || '',
  };

  await admin.addRefreshToken(refreshTokenData);

  // Add session tracking
  const sessionId = uuidv4();
  await admin.addSession({
    sessionId,
    deviceInfo: req.get('User-Agent') || 'Unknown Device',
    ipAddress: req.ip || req.connection.remoteAddress || '',
  });

  return res
    .status(200)
    .cookie("adminAccessToken", accessToken, getCookieOptions('access'))
    .cookie("adminRefreshToken", refreshToken, getCookieOptions('refresh'))
    .json(
      new ApiResponse(
        200,
        {
          admin: {
            email: admin.email,
            role: admin.role,
          },
          tokens: {
            accessToken,
            refreshToken,
            tokenType,
            expiresIn,
          },
          sessionId,
        },
        "Admin has been successfully logged in"
      )
    );
});

const logoutAdmin = asyncHandler(async (req, res) => {
  try {
    const refreshToken = req.cookies?.adminRefreshToken || extractToken(req, 'refresh');
    
    if (refreshToken) {
      try {
        const decoded = await verifyRefreshToken(refreshToken);
        const admin = await User.findById(decoded._id);
        
        if (admin && decoded.jti) {
          // Revoke the specific refresh token
          await admin.revokeRefreshToken(decoded.jti);
          
          // Remove session if sessionId is provided
          if (req.body.sessionId) {
            await admin.removeSession(req.body.sessionId);
          }
        }
      } catch (error) {
        // Token verification failed, but we still want to clear cookies
        console.log('Error verifying admin refresh token during logout:', error.message);
      }
    }

    return res
      .status(200)
      .clearCookie("adminAccessToken", { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/' 
      })
      .clearCookie("adminRefreshToken", { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/' 
      })
      .json(new ApiResponse(200, {}, "Admin successfully logged out"));
  } catch (error) {
    throw new ApiError(500, "Error occurred during admin logout");
  }
});

const refreshAdminToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.adminRefreshToken || extractToken(req, 'refresh');

  if (!refreshToken) {
    throw new ApiError(401, "Admin refresh token not found");
  }

  try {
    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);
    validateTokenPayload(decoded, 'refresh');

    // Find admin and validate refresh token
    const admin = await User.findById(decoded._id);
    if (!admin || admin.role !== 'admin') {
      throw new ApiError(401, "Invalid admin refresh token - admin not found");
    }

    // Check if refresh token is valid in database
    if (!admin.isRefreshTokenValid(decoded.jti)) {
      throw new ApiError(401, "Admin refresh token has been revoked or expired");
    }

    // Remove expired tokens
    await admin.removeExpiredRefreshTokens();

    // Generate new token pair
    const adminPayload = createAdminPayload(admin);
    const { accessToken, refreshToken: newRefreshToken, tokenType, expiresIn } = await generateTokenPair(adminPayload);

    // Revoke old refresh token and add new one
    await admin.revokeRefreshToken(decoded.jti);
    
    const newRefreshTokenData = {
      token: newRefreshToken,
      tokenId: uuidv4(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent: req.get('User-Agent') || '',
      ipAddress: req.ip || req.connection.remoteAddress || '',
    };

    await admin.addRefreshToken(newRefreshTokenData);

    // Update session access
    if (req.body.sessionId) {
      await admin.updateSessionAccess(req.body.sessionId);
    }

    return res
      .status(200)
      .cookie("adminAccessToken", accessToken, getCookieOptions('access'))
      .cookie("adminRefreshToken", newRefreshToken, getCookieOptions('refresh'))
      .json(
        new ApiResponse(
          200,
          {
            tokens: {
              accessToken,
              refreshToken: newRefreshToken,
              tokenType,
              expiresIn,
            },
          },
          "Admin access token refreshed successfully"
        )
      );
  } catch (error) {
    // Clear invalid cookies
    res.clearCookie("adminAccessToken");
    res.clearCookie("adminRefreshToken");
    
    if (error.message.includes('expired')) {
      throw new ApiError(401, "Admin refresh token expired. Please login again.");
    }
    throw new ApiError(401, `Invalid admin refresh token: ${error.message}`);
  }
});

const changePassword = asyncHandler(async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  if (!email || !oldPassword || !newPassword) {
    throw new ApiError(402, "All credentials are required");
  }

  const admin = await User.findOne({ email: email });
  if (!admin) {
    throw new ApiError(401, "Unauthorized request :: No admin found");
  }

  const isCorrectPassword = await admin.isPasswordCorrect(oldPassword);

  if (!isCorrectPassword) {
    throw new ApiError(
      401,
      "your password is incorrect please provide correct password"
    );
  }

  const user = await User.findById(admin._id);

  user.password = newPassword;

  const response = await user.save();

  if (!response) {
    throw new ApiError(500, "error occured while updating the password");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password has been updated successfully"));
});

export { 
  registerAdmin, 
  loginAdmin, 
  logoutAdmin, 
  refreshAdminToken,
  changePassword 
};
