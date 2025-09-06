import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { 
  verifyRefreshToken,
  verifyAccessToken,
  extractToken, 
  validateTokenPayload 
} from "../utils/jwt.js";

// Middleware to validate refresh token for user token refresh endpoint
const userRefreshTokenValidation = asyncHandler(async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || extractToken(req, 'refresh');

    if (!refreshToken) {
      throw new ApiError(401, "Refresh token not found");
    }

    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);
    validateTokenPayload(decoded, 'refresh');

    // Find user and validate refresh token in database
    const user = await User.findById(decoded._id);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token - user not found");
    }

    // Check if refresh token is valid in database
    if (!user.isRefreshTokenValid(decoded.jti)) {
      throw new ApiError(401, "Refresh token has been revoked or expired");
    }

    // Attach decoded token and user to request
    req.refreshTokenPayload = decoded;
    req.user = user;
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error.message.includes('expired')) {
      throw new ApiError(401, "Refresh token expired - please login again");
    }
    
    throw new ApiError(401, `Refresh token validation failed: ${error.message}`);
  }
});

// Middleware for routes that require either access token or refresh token
const flexibleAuthentication = asyncHandler(async (req, res, next) => {
  try {
    // Try access token first
    const accessToken = req.cookies?.accessToken || extractToken(req, 'access');
    
    if (accessToken) {
      try {
        const decodedToken = await verifyAccessToken(accessToken);
        validateTokenPayload(decodedToken, 'access');
        
        const user = await User.findById(decodedToken._id).select(
          "_id uid firstName lastName email role isProfileVerified isProfileComplete"
        );
        
        if (user && user.role !== "admin" && !user.isAccountLocked()) {
          req.user = user;
          req.tokenType = 'access';
          return next();
        }
      } catch (error) {
        // Access token failed, try refresh token
      }
    }

    // Try refresh token as fallback
    const refreshToken = req.cookies?.refreshToken || extractToken(req, 'refresh');
    
    if (refreshToken) {
      const decoded = await verifyRefreshToken(refreshToken);
      validateTokenPayload(decoded, 'refresh');
      
      const user = await User.findById(decoded._id);
      if (user && user.isRefreshTokenValid(decoded.jti) && !user.isAccountLocked()) {
        req.user = user;
        req.tokenType = 'refresh';
        req.refreshTokenPayload = decoded;
        return next();
      }
    }

    throw new ApiError(401, "No valid authentication token found");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, `Authentication failed: ${error.message}`);
  }
});

// Middleware to check if user has specific roles
const requireRoles = (allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user && !req.admin) {
      throw new ApiError(401, "Authentication required");
    }

    const userRole = req.user?.role || req.admin?.role;
    
    if (!allowedRoles.includes(userRole)) {
      throw new ApiError(403, `Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }

    next();
  });
};

// Middleware to check if user is verified
const requireVerification = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (!req.user.isProfileVerified) {
    throw new ApiError(403, "Email verification required");
  }

  next();
});

// Middleware to check if user profile is complete
const requireCompleteProfile = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (!req.user.isProfileComplete) {
    throw new ApiError(403, "Profile completion required");
  }

  next();
});

export { 
  userRefreshTokenValidation,
  flexibleAuthentication,
  requireRoles,
  requireVerification,
  requireCompleteProfile
};
