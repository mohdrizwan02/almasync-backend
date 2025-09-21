import { User } from "../models/user.model.js";
import { ApiError } from "./ApiError.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Session Management Utilities
 */

/**
 * Create a new user session
 * @param {Object} user - User object from database
 * @param {Object} req - Express request object
 * @returns {Promise<string>} - Session ID
 */
export const createUserSession = async (user, req) => {
  const sessionId = uuidv4();

  const sessionData = {
    sessionId,
    deviceInfo: req.get("User-Agent") || "Unknown Device",
    ipAddress: req.ip || req.connection.remoteAddress || "Unknown IP",
  };

  await user.addSession(sessionData);
  return sessionId;
};

/**
 * Validate and update user session
 * @param {Object} user - User object from database
 * @param {string} sessionId - Session ID to validate
 * @returns {Promise<boolean>} - True if session is valid
 */
export const validateUserSession = async (user, sessionId) => {
  if (!sessionId) return false;

  const session = user.activeSessions.find((s) => s.sessionId === sessionId);

  if (session) {
    await user.updateSessionAccess(sessionId);
    return true;
  }

  return false;
};

/**
 * Clean up expired sessions and refresh tokens
 * @param {Object} user - User object from database
 * @returns {Promise<void>}
 */
export const cleanupUserSessions = async (user) => {
  // Remove expired refresh tokens
  await user.removeExpiredRefreshTokens();

  // Remove old sessions (older than 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  user.activeSessions = user.activeSessions.filter(
    (session) => session.lastAccess > thirtyDaysAgo
  );

  await user.save();
};

/**
 * Security audit functions
 */

/**
 * Log security event
 * @param {string} userId - User ID
 * @param {string} event - Event type
 * @param {Object} details - Event details
 * @param {Object} req - Express request object
 */
export const logSecurityEvent = async (userId, event, details, req) => {
  const securityLog = {
    userId,
    event,
    details,
    timestamp: new Date(),
    ipAddress: req.ip || req.connection.remoteAddress || "Unknown",
    userAgent: req.get("User-Agent") || "Unknown",
  };

  // In a production environment, you would save this to a dedicated security log collection
  console.log("Security Event:", JSON.stringify(securityLog, null, 2));
};

/**
 * Check for suspicious login activity
 * @param {Object} user - User object from database
 * @param {Object} req - Express request object
 * @returns {Promise<boolean>} - True if activity seems suspicious
 */
export const checkSuspiciousActivity = async (user, req) => {
  const currentIP = req.ip || req.connection.remoteAddress || "";
  const currentUserAgent = req.get("User-Agent") || "";

  // Check for rapid login attempts from different IPs
  const recentSessions = user.activeSessions.filter(
    (session) => Date.now() - session.lastAccess.getTime() < 60 * 60 * 1000 // Last hour
  );

  const uniqueIPs = new Set(recentSessions.map((s) => s.ipAddress));

  if (uniqueIPs.size > 3) {
    await logSecurityEvent(
      user._id,
      "SUSPICIOUS_LOGIN_MULTIPLE_IPS",
      {
        ipCount: uniqueIPs.size,
        ips: Array.from(uniqueIPs),
        currentIP,
      },
      req
    );
    return true;
  }

  return false;
};

/**
 * Device fingerprinting and recognition
 * @param {Object} req - Express request object
 * @returns {string} - Device fingerprint
 */
export const generateDeviceFingerprint = (req) => {
  const userAgent = req.get("User-Agent") || "";
  const acceptLanguage = req.get("Accept-Language") || "";
  const acceptEncoding = req.get("Accept-Encoding") || "";

  // Create a simple fingerprint based on headers
  const fingerprint = Buffer.from(
    `${userAgent}|${acceptLanguage}|${acceptEncoding}`
  ).toString("base64");

  return fingerprint;
};

/**
 * Rate limiting helpers
 */

/**
 * Check if user has exceeded login attempt rate limit
 * @param {Object} user - User object from database
 * @returns {boolean} - True if rate limited
 */
export const isRateLimited = (user) => {
  const now = new Date();
  const lastAttempt = user.loginAttempts.lastAttempt;

  // If more than 5 attempts in last 15 minutes
  if (
    user.loginAttempts.count >= 5 &&
    lastAttempt &&
    now.getTime() - lastAttempt.getTime() < 15 * 60 * 1000
  ) {
    return true;
  }

  return false;
};

/**
 * Calculate remaining lockout time
 * @param {Object} user - User object from database
 * @returns {number} - Remaining lockout time in seconds
 */
export const getRemainingLockoutTime = (user) => {
  if (!user.loginAttempts.lockedUntil) return 0;

  const now = new Date();
  const remaining = Math.max(
    0,
    user.loginAttempts.lockedUntil.getTime() - now.getTime()
  );

  return Math.ceil(remaining / 1000); // Return seconds
};

/**
 * Token management helpers
 */

/**
 * Revoke all user tokens and sessions (for security incidents)
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const revokeAllUserAccess = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Revoke all refresh tokens
  await user.revokeAllRefreshTokens();

  // Clear all sessions
  await user.clearAllSessions();

  // Log security event
  console.log(
    `All access revoked for user ${userId} at ${new Date().toISOString()}`
  );
};

/**
 * Get active sessions count
 * @param {Object} user - User object from database
 * @returns {number} - Number of active sessions
 */
export const getActiveSessionsCount = (user) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return user.activeSessions.filter((session) => session.lastAccess > oneDayAgo)
    .length;
};

/**
 * Get active refresh tokens count
 * @param {Object} user - User object from database
 * @returns {number} - Number of active refresh tokens
 */
export const getActiveRefreshTokensCount = (user) => {
  const now = new Date();
  return user.refreshTokens.filter(
    (token) => !token.isRevoked && token.expiresAt > now
  ).length;
};
