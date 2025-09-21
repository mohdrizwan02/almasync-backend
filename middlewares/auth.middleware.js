import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyJWT } from "../utils/jwt.js";

export const userAuthentication = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Access token not found");
  }

  try {
    const decoded = await verifyJWT(token);
    const user = await User.findById(decoded.userId).select(
      "-password -refreshTokens"
    );

    if (!user) {
      throw new ApiError(401, "Invalid token - user not found");
    }

    if (!user.isActive) {
      throw new ApiError(403, "Account has been deactivated");
    }

    req.user = user;
    req.tokenData = {
      tokenId: decoded.tokenId,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    throw new ApiError(401, error.message || "Invalid access token");
  }
});

export const optionalUserAuthentication = asyncHandler(
  async (req, res, next) => {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (token) {
      try {
        const decoded = await verifyJWT(token);
        const user = await User.findById(decoded.userId).select(
          "-password -refreshTokens"
        );

        if (user && user.isActive) {
          req.user = user;
          req.tokenData = {
            tokenId: decoded.tokenId,
            sessionId: decoded.sessionId,
          };
        }
      } catch (error) {
        // Ignore errors for optional authentication
        console.log("Optional authentication failed:", error.message);
      }
    }

    next();
  }
);
