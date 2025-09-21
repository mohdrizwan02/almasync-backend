import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyJWT } from "../utils/jwt.js";
import { User } from "../models/user.model.js";

export const userRefreshTokenValidation = asyncHandler(async (req, res, next) => {
    const refreshToken = req.cookies?.refreshToken || 
                       req.header("Authorization")?.replace("Bearer ", "");

    if (!refreshToken) {
        throw new ApiError(401, "Refresh token not found");
    }

    try {
        const decoded = await verifyJWT(refreshToken);
        const user = await User.findById(decoded.userId).select("+refreshTokens");
        
        if (!user) {
            throw new ApiError(401, "Invalid refresh token - user not found");
        }

        // Check if refresh token exists and is not revoked
        const storedToken = user.refreshTokens.find(
            token => token.tokenId === decoded.tokenId && !token.isRevoked
        );

        if (!storedToken) {
            throw new ApiError(401, "Refresh token has been revoked or expired");
        }

        // Check if token has expired
        if (new Date() > storedToken.expiresAt) {
            await user.revokeRefreshToken(decoded.tokenId);
            throw new ApiError(401, "Refresh token has expired");
        }

        req.user = user;
        req.refreshTokenData = {
            tokenId: decoded.tokenId,
            sessionId: decoded.sessionId,
            rememberMe: decoded.rememberMe || false
        };

        next();
    } catch (error) {
        throw new ApiError(401, error.message || "Invalid refresh token");
    }
});
