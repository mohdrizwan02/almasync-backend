import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { 
  verifyAccessToken, 
  extractToken, 
  validateTokenPayload 
} from "../utils/jwt.js";

const userAuthentication = asyncHandler(async (req, res, next) => {
  try {
    // Extract access token from cookies or Authorization header
    const accessToken = req.cookies?.accessToken || extractToken(req, 'access');

    if (!accessToken) {
      throw new ApiError(401, "Access token not found - unauthorized request");
    }

    // Verify access token using JOSE
    const decodedToken = await verifyAccessToken(accessToken);
    
    // Validate token payload structure
    validateTokenPayload(decodedToken, 'access');

    // Find user by ID from token
    const user = await User.findById(decodedToken._id).select(
      "_id uid firstName lastName email role isProfileVerified isProfileComplete"
    );

    if (!user) {
      throw new ApiError(401, "Invalid access token - user not found");
    }

    // Check if user is admin (should not use user routes)
    if (user.role === "admin") {
      throw new ApiError(403, "Admin users should use admin routes");
    }

    // Check if account is locked
    if (user.isAccountLocked()) {
      throw new ApiError(423, "Account is temporarily locked");
    }

    // Update session activity if sessionId is provided in headers
    const sessionId = req.header('X-Session-Id');
    if (sessionId) {
      try {
        await user.updateSessionAccess(sessionId);
      } catch (error) {
        // Non-critical error, don't fail the request
        console.log('Warning: Could not update session access:', error.message);
      }
    }

    // Attach user to request object
    req.user = user;
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Handle JOSE-specific errors
    if (error.message.includes('expired')) {
      throw new ApiError(401, "Access token expired - please refresh");
    }
    
    throw new ApiError(401, `Authentication failed: ${error.message}`);
  }
});

// Optional middleware for routes that work with both authenticated and non-authenticated users
const optionalUserAuthentication = asyncHandler(async (req, res, next) => {
  try {
    const accessToken = req.cookies?.accessToken || extractToken(req, 'access');
    
    if (accessToken) {
      const decodedToken = await verifyAccessToken(accessToken);
      validateTokenPayload(decodedToken, 'access');
      
      const user = await User.findById(decodedToken._id).select(
        "_id uid firstName lastName email role isProfileVerified isProfileComplete"
      );
      
      if (user && user.role !== "admin" && !user.isAccountLocked()) {
        req.user = user;
        
        // Update session activity if sessionId is provided
        const sessionId = req.header('X-Session-Id');
        if (sessionId) {
          try {
            await user.updateSessionAccess(sessionId);
          } catch (error) {
            console.log('Warning: Could not update session access:', error.message);
          }
        }
      }
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't throw errors, just proceed without user
    next();
  }
});

export { userAuthentication, optionalUserAuthentication };
