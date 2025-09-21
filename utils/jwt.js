import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';

// JWT Configuration
const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_ACCESS_TOKEN_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
);

const JWT_ADMIN_SECRET = new TextEncoder().encode(
    process.env.JWT_ADMIN_SECRET || 'your-super-secret-admin-jwt-key-change-this-in-production'
);

const JWT_ISSUER = process.env.JWT_ISSUER || 'almasync-backend';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'almasync-frontend';

// Generate Access Token
export const generateAccessToken = async (payload, sessionId = null) => {
    const tokenId = uuidv4();
    
    const jwt = await new SignJWT({
        ...payload,
        sessionId,
        tokenId,
        type: 'access'
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('15m')
    .sign(JWT_SECRET);

    return jwt;
};

// Generate Refresh Token
export const generateRefreshToken = async (payload, rememberMe = false, sessionId = null) => {
    const tokenId = uuidv4();
    const expiry = rememberMe ? '30d' : '7d';
    
    const jwt = await new SignJWT({
        ...payload,
        sessionId,
        tokenId,
        rememberMe,
        type: 'refresh'
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);

    return { token: jwt, tokenId };
};

// Generate Token Pair
export const generateTokenPair = async (payload, rememberMe = false, sessionId = null) => {
    const accessToken = await generateAccessToken(payload, sessionId);
    const refreshTokenData = await generateRefreshToken(payload, rememberMe, sessionId);
    
    return { 
        accessToken, 
        refreshToken: refreshTokenData.token,
        refreshTokenId: refreshTokenData.tokenId,
        tokenType: 'Bearer',
        expiresIn: 15 * 60, // 15 minutes in seconds
    };
};

// Verify JWT Token
export const verifyJWT = async (token, isAdmin = false) => {
    try {
        const secret = isAdmin ? JWT_ADMIN_SECRET : JWT_SECRET;
        const { payload } = await jwtVerify(token, secret, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
        
        return payload;
    } catch (error) {
        throw new Error(`JWT verification failed: ${error.message}`);
    }
};

// For backward compatibility with existing code
export const verifyAccessToken = async (token) => {
    return await verifyJWT(token, false);
};

export const verifyRefreshToken = async (token) => {
    return await verifyJWT(token, false);
};

// Create user payload for JWT tokens
export const createUserPayload = (user) => {
    return {
        userId: user._id.toString(),
        uid: user.uid,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
    };
};

// Create admin payload for JWT tokens
export const createAdminPayload = (admin) => {
    return {
        userId: admin._id.toString(),
        uid: admin.uid,
        email: admin.email,
        role: 'admin',
        firstName: admin.firstName,
        lastName: admin.lastName,
    };
};

// Extract token from request headers or cookies
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

// Validate token payload structure
export const validateTokenPayload = (payload, expectedType) => {
    if (!payload) {
        throw new Error('Token payload is empty');
    }

    if (payload.type !== expectedType) {
        throw new Error(`Expected ${expectedType} token, got ${payload.type}`);
    }

    if (!payload.userId || !payload.email || !payload.role) {
        throw new Error('Token payload missing required fields');
    }

    return true;
};

// Generate Password Reset Token
export const generatePasswordResetToken = async (payload) => {
    const tokenId = uuidv4();
    
    const jwt = await new SignJWT({
        ...payload,
        tokenId,
        type: 'password_reset'
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('10m')
    .sign(JWT_SECRET);

    return jwt;
};

// Generate Email Verification Token
export const generateEmailVerificationToken = async (payload) => {
    const tokenId = uuidv4();
    
    const jwt = await new SignJWT({
        ...payload,
        tokenId,
        type: 'email_verification'
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

    return jwt;
};

// Cookie Options
export const getCookieOptions = (type = 'access', rememberMe = false) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const baseOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
    };

    if (type === 'refresh') {
        const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        return { ...baseOptions, maxAge };
    }

    return { ...baseOptions, maxAge: 15 * 60 * 1000 };
};
