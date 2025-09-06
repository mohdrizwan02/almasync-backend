import { SignJWT, jwtVerify, importJWK, generateSecret } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// JWT Configuration
const JWT_ACCESS_TOKEN_EXPIRY = '15m';
const JWT_REFRESH_TOKEN_EXPIRY = '7d';
const ALGORITHM = 'HS256';

// Generate JWT secrets (in production, store these securely in environment variables)
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_TOKEN_SECRET || crypto.randomBytes(32).toString('hex'));
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_TOKEN_SECRET || crypto.randomBytes(32).toString('hex'));

/**
 * Generate Access Token using JOSE
 * @param {Object} payload - User data to include in token
 * @returns {Promise<string>} - Signed JWT access token
 */
export const generateAccessToken = async (payload) => {
  try {
    const jwt = await new SignJWT({
      ...payload,
      type: 'access',
      jti: uuidv4(), // Add unique token ID
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(JWT_ACCESS_TOKEN_EXPIRY)
      .setIssuer('almasync-backend')
      .setAudience('almasync-frontend')
      .sign(ACCESS_TOKEN_SECRET);

    return jwt;
  } catch (error) {
    throw new Error(`Error generating access token: ${error.message}`);
  }
};

/**
 * Generate Refresh Token using JOSE
 * @param {Object} payload - User data to include in token
 * @returns {Promise<string>} - Signed JWT refresh token
 */
export const generateRefreshToken = async (payload) => {
  try {
    const jwt = await new SignJWT({
      ...payload,
      type: 'refresh',
      jti: uuidv4(), // Add unique token ID
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(JWT_REFRESH_TOKEN_EXPIRY)
      .setIssuer('almasync-backend')
      .setAudience('almasync-frontend')
      .sign(REFRESH_TOKEN_SECRET);

    return jwt;
  } catch (error) {
    throw new Error(`Error generating refresh token: ${error.message}`);
  }
};

/**
 * Verify Access Token using JOSE
 * @param {string} token - JWT access token to verify
 * @returns {Promise<Object>} - Decoded token payload
 */
export const verifyAccessToken = async (token) => {
  try {
    const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET, {
      issuer: 'almasync-backend',
      audience: 'almasync-frontend',
    });

    // Verify token type
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new Error('Access token expired');
    }
    throw new Error(`Invalid access token: ${error.message}`);
  }
};

/**
 * Verify Refresh Token using JOSE
 * @param {string} token - JWT refresh token to verify
 * @returns {Promise<Object>} - Decoded token payload
 */
export const verifyRefreshToken = async (token) => {
  try {
    const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET, {
      issuer: 'almasync-backend',
      audience: 'almasync-frontend',
    });

    // Verify token type
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new Error('Refresh token expired');
    }
    throw new Error(`Invalid refresh token: ${error.message}`);
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} payload - User data to include in tokens
 * @returns {Promise<Object>} - Object containing both tokens
 */
export const generateTokenPair = async (payload) => {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken(payload),
      generateRefreshToken(payload)
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: JWT_ACCESS_TOKEN_EXPIRY,
    };
  } catch (error) {
    throw new Error(`Error generating token pair: ${error.message}`);
  }
};

/**
 * Create user payload for JWT tokens
 * @param {Object} user - User object from database
 * @returns {Object} - Sanitized user payload for JWT
 */
export const createUserPayload = (user) => {
  return {
    _id: user._id.toString(),
    uid: user.uid,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    isVerified: user.isProfileVerified || false,
    profileComplete: user.isProfileComplete || false,
  };
};

/**
 * Create admin payload for JWT tokens
 * @param {Object} admin - Admin object from database
 * @returns {Object} - Sanitized admin payload for JWT
 */
export const createAdminPayload = (admin) => {
  return {
    _id: admin._id.toString(),
    uid: admin.uid,
    email: admin.email,
    role: 'admin',
  };
};

/**
 * Extract token from request headers or cookies
 * @param {Object} req - Express request object
 * @param {string} tokenType - Type of token ('access' or 'refresh')
 * @returns {string|null} - Extracted token or null
 */
export const extractToken = (req, tokenType = 'access') => {
  // Try Authorization header first
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  // Try cookies as fallback
  const cookieName = tokenType === 'access' ? 'accessToken' : 'refreshToken';
  return req.cookies?.[cookieName] || null;
};

/**
 * Validate token payload structure
 * @param {Object} payload - Token payload to validate
 * @param {string} expectedType - Expected token type ('access' or 'refresh')
 * @returns {boolean} - True if valid, throws error if invalid
 */
export const validateTokenPayload = (payload, expectedType) => {
  if (!payload) {
    throw new Error('Token payload is empty');
  }

  if (payload.type !== expectedType) {
    throw new Error(`Expected ${expectedType} token, got ${payload.type}`);
  }

  if (!payload._id || !payload.email || !payload.role) {
    throw new Error('Token payload missing required fields');
  }

  return true;
};

/**
 * Get token expiry time in seconds
 * @param {string} tokenType - Type of token ('access' or 'refresh')
 * @returns {number} - Expiry time in seconds
 */
export const getTokenExpirySeconds = (tokenType) => {
  if (tokenType === 'access') {
    // 15 minutes = 15 * 60 = 900 seconds
    return 15 * 60;
  } else if (tokenType === 'refresh') {
    // 7 days = 7 * 24 * 60 * 60 = 604800 seconds
    return 7 * 24 * 60 * 60;
  }
  return 0;
};

/**
 * Create cookie options for tokens
 * @param {string} tokenType - Type of token ('access' or 'refresh')
 * @returns {Object} - Cookie options
 */
export const getCookieOptions = (tokenType) => {
  const maxAge = getTokenExpirySeconds(tokenType) * 1000; // Convert to milliseconds
  
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge,
    path: '/',
  };
};
