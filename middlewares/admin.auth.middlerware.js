import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { 
  verifyAccessToken, 
  extractToken, 
  validateTokenPayload 
} from "../utils/jwt.js";

const adminAuthentication = asyncHandler(async (req, res, next) => {
  try {
    // Extract access token from cookies or Authorization header
    // For admin, we check both adminAccessToken cookie and Authorization header
    const accessToken = req.cookies?.adminAccessToken || 
                       req.cookies?.accessToken || 
                       extractToken(req, 'access');

    if (!accessToken) {
      throw new ApiError(401, "Admin access token not found - unauthorized request");
    }

    // Verify access token using JOSE
    const decodedToken = await verifyAccessToken(accessToken);
    
    // Validate token payload structure
    validateTokenPayload(decodedToken, 'access');

    // Find admin by ID from token
    const admin = await User.findById(decodedToken._id).select(
      "_id uid email role isProfileVerified isProfileComplete"
    );

    if (!admin) {
      throw new ApiError(401, "Invalid admin access token - admin not found");
    }

    // Verify admin role
    if (admin.role !== "admin") {
      throw new ApiError(403, "Unauthorized - admin role required");
    }

    // Check if account is locked
    if (admin.isAccountLocked()) {
      throw new ApiError(423, "Admin account is temporarily locked");
    }

    // Update session activity if sessionId is provided in headers
    const sessionId = req.header('X-Session-Id');
    if (sessionId) {
      try {
        await admin.updateSessionAccess(sessionId);
      } catch (error) {
        // Non-critical error, don't fail the request
        console.log('Warning: Could not update admin session access:', error.message);
      }
    }

    // Attach admin to request object
    req.admin = admin;
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Handle JOSE-specific errors
    if (error.message.includes('expired')) {
      throw new ApiError(401, "Admin access token expired - please refresh");
    }
    
    throw new ApiError(401, `Admin authentication failed: ${error.message}`);
  }
});

// Middleware to verify refresh token for admin token refresh endpoint
const adminRefreshTokenValidation = asyncHandler(async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.adminRefreshToken || extractToken(req, 'refresh');

    if (!refreshToken) {
      throw new ApiError(401, "Admin refresh token not found");
    }

    // The actual verification will be done in the controller
    // This middleware just ensures the token is present
    req.refreshToken = refreshToken;
    
    next();
  } catch (error) {
    throw new ApiError(401, `Admin refresh token validation failed: ${error.message}`);
  }
});

export { adminAuthentication, adminRefreshTokenValidation };
