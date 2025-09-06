# JOSE-based Access & Refresh Token Authentication System

## Overview

This document describes the complete implementation of a secure, full-fledged authentication and authorization system using JOSE (JavaScript Object Signing and Encryption) instead of the traditional jsonwebtoken library. The system implements dual-token architecture with access tokens and refresh tokens for enhanced security.

## Key Features

### 🔐 **Security Features**
- **Dual Token System**: Short-lived access tokens (15 minutes) and long-lived refresh tokens (7 days)
- **Token Rotation**: Automatic refresh token rotation on each use
- **Session Management**: Track active user sessions with device information
- **Account Lockout**: Protection against brute-force attacks
- **Token Revocation**: Ability to revoke individual or all tokens
- **Security Auditing**: Comprehensive logging of authentication events

### 🛡️ **Enhanced Protection**
- **Rate Limiting**: Login attempt restrictions
- **Device Fingerprinting**: Track and identify user devices
- **IP Tracking**: Monitor access from different locations
- **Suspicious Activity Detection**: Alert on unusual login patterns
- **JOSE Standards**: Industry-standard token signing and verification

## Architecture

### Token Types

#### Access Token
- **Lifetime**: 15 minutes
- **Purpose**: API access authentication
- **Storage**: HTTP-only cookies + Authorization header support
- **Claims**: User ID, role, email, verification status, profile completion

#### Refresh Token
- **Lifetime**: 7 days
- **Purpose**: Renew access tokens
- **Storage**: HTTP-only cookies + database tracking
- **Features**: Rotation, revocation, expiry tracking

## Implementation Details

### 1. JWT Utilities (`utils/jwt.js`)

```javascript
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from './utils/jwt.js';

// Generate both tokens
const tokens = await generateTokenPair(userPayload);

// Verify tokens
const accessPayload = await verifyAccessToken(accessToken);
const refreshPayload = await verifyRefreshToken(refreshToken);
```

**Key Functions:**
- `generateAccessToken(payload)` - Create access token
- `generateRefreshToken(payload)` - Create refresh token
- `generateTokenPair(payload)` - Create both tokens
- `verifyAccessToken(token)` - Verify access token
- `verifyRefreshToken(token)` - Verify refresh token
- `createUserPayload(user)` - Create user payload for tokens
- `createAdminPayload(admin)` - Create admin payload for tokens

### 2. Enhanced User Model

```javascript
// Refresh token management
refreshTokens: [{
  token: String,
  tokenId: String,
  createdAt: Date,
  expiresAt: Date,
  userAgent: String,
  ipAddress: String,
  isRevoked: Boolean
}]

// Session tracking
activeSessions: [{
  sessionId: String,
  deviceInfo: String,
  lastAccess: Date,
  ipAddress: String
}]

// Security features
loginAttempts: {
  count: Number,
  lastAttempt: Date,
  lockedUntil: Date
}
```

**Model Methods:**
- `addRefreshToken(tokenData)` - Store new refresh token
- `revokeRefreshToken(tokenId)` - Revoke specific token
- `revokeAllRefreshTokens()` - Revoke all tokens
- `isRefreshTokenValid(tokenId)` - Check token validity
- `addSession(sessionData)` - Track new session
- `updateSessionAccess(sessionId)` - Update session activity

### 3. Authentication Controllers

#### User Authentication (`controllers/auth.controller.js`)

**Login Flow:**
1. Validate credentials
2. Check account lockout status
3. Generate token pair
4. Store refresh token in database
5. Create user session
6. Set secure HTTP-only cookies
7. Return tokens and user data

**Logout Flow:**
1. Revoke refresh token
2. Clear sessions
3. Clear cookies
4. Return success response

**Token Refresh Flow:**
1. Validate refresh token
2. Check database validity
3. Generate new token pair
4. Rotate refresh token
5. Update session activity
6. Return new tokens

#### Admin Authentication (`controllers/admin.auth.controller.js`)

Similar flow with admin-specific token handling and separate cookie names.

### 4. Authentication Middlewares

#### User Authentication (`middlewares/auth.middleware.js`)

```javascript
import { userAuthentication } from './middlewares/auth.middleware.js';

// Protect routes
router.get('/protected', userAuthentication, controller);
```

**Features:**
- JOSE token verification
- User role validation
- Account lockout check
- Session activity tracking
- Comprehensive error handling

#### Admin Authentication (`middlewares/admin.auth.middleware.js`)

```javascript
import { adminAuthentication } from './middlewares/admin.auth.middleware.js';

// Protect admin routes
router.get('/admin/protected', adminAuthentication, controller);
```

#### Advanced Middlewares (`middlewares/refresh.middleware.js`)

```javascript
import { 
  userRefreshTokenValidation,
  requireRoles,
  requireVerification,
  requireCompleteProfile 
} from './middlewares/refresh.middleware.js';

// Role-based protection
router.get('/alumni-only', userAuthentication, requireRoles(['alumni']), controller);

// Verification requirement
router.get('/verified-only', userAuthentication, requireVerification, controller);
```

### 5. Session Management (`utils/sessionUtils.js`)

```javascript
import { 
  createUserSession,
  validateUserSession,
  cleanupUserSessions,
  revokeAllUserAccess 
} from './utils/sessionUtils.js';

// Create session
const sessionId = await createUserSession(user, req);

// Validate session
const isValid = await validateUserSession(user, sessionId);

// Security cleanup
await revokeAllUserAccess(userId);
```

## API Endpoints

### User Authentication Routes (`/api/v1/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register new user |
| POST | `/login` | User login |
| POST | `/logout` | User logout |
| POST | `/refresh-token` | Refresh access token |
| GET | `/forgot-password/:email` | Verify user for password reset |
| POST | `/forgot-password/:email/verify-otp` | Verify OTP |
| POST | `/forgot-password/:email/otp-change-password/:token` | Reset password |

### Admin Authentication Routes (`/api/v1/admin/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register new admin |
| POST | `/login` | Admin login |
| POST | `/logout` | Admin logout |
| POST | `/refresh-token` | Refresh admin access token |
| POST | `/change-password` | Change admin password |

## Security Considerations

### 1. Token Security
- **HTTP-Only Cookies**: Prevent XSS attacks
- **Secure Cookies**: HTTPS-only in production
- **SameSite Protection**: CSRF protection
- **Token Rotation**: Refresh tokens are single-use

### 2. Account Protection
- **Rate Limiting**: 5 failed attempts = 30-minute lockout
- **Session Limits**: Maximum 10 active sessions per user
- **Token Limits**: Maximum 5 active refresh tokens per user
- **Automatic Cleanup**: Expired tokens and sessions removed

### 3. Monitoring & Auditing
- **Security Logging**: All authentication events logged
- **Suspicious Activity Detection**: Multiple IP alerts
- **Device Tracking**: Unknown device notifications
- **Session Monitoring**: Real-time active session tracking

## Environment Configuration

```env
# JWT Configuration (JOSE)
JWT_ACCESS_TOKEN_SECRET=your-super-secure-access-token-secret-here
JWT_REFRESH_TOKEN_SECRET=your-super-secure-refresh-token-secret-here

# Database
MONGODB_URL=mongodb://localhost:27017/almasync

# Server
PORT=3000
NODE_ENV=production
```

## Usage Examples

### Frontend Integration

```javascript
// Login
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  credentials: 'include' // Important for cookies
});

// API calls with automatic token refresh
const apiCall = async (url, options = {}) => {
  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers
    }
  });

  // If access token expired, refresh and retry
  if (response.status === 401) {
    const refreshResponse = await fetch('/api/v1/auth/refresh-token', {
      method: 'POST',
      credentials: 'include'
    });

    if (refreshResponse.ok) {
      const { tokens } = await refreshResponse.json();
      // Retry original request with new token
      response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          ...options.headers
        }
      });
    }
  }

  return response;
};
```

### Middleware Usage

```javascript
// Basic protection
app.get('/protected', userAuthentication, (req, res) => {
  res.json({ user: req.user });
});

// Role-based protection
app.get('/alumni-only', 
  userAuthentication, 
  requireRoles(['alumni']), 
  (req, res) => {
    res.json({ message: 'Alumni-only content' });
  }
);

// Multiple requirements
app.get('/premium-feature', 
  userAuthentication, 
  requireVerification,
  requireCompleteProfile,
  requireRoles(['alumni', 'student']),
  (req, res) => {
    res.json({ message: 'Premium feature access' });
  }
);
```

## Migration from jsonwebtoken

The system maintains backward compatibility during migration:

1. **Gradual Migration**: Old JWT tokens still work during transition period
2. **Dual Support**: Both old and new token formats accepted
3. **Environment Variables**: Old JWT_TOKEN_SECRET preserved for compatibility
4. **Smooth Transition**: Users don't need to re-login during deployment

## Troubleshooting

### Common Issues

1. **Token Expired Errors**: Implement proper refresh token logic
2. **Cookie Issues**: Ensure `credentials: 'include'` in frontend requests
3. **CORS Problems**: Configure CORS to allow cookies from your domain
4. **Session Cleanup**: Run periodic cleanup jobs for expired data

### Debug Logging

Enable detailed logging in development:

```javascript
// Add to your app.js
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log('Auth Headers:', req.headers.authorization);
    console.log('Cookies:', req.cookies);
    next();
  });
}
```

## Benefits of JOSE over jsonwebtoken

1. **Standards Compliance**: Full RFC 7515, 7516, 7517, 7518 compliance
2. **Better Security**: More secure algorithms and key handling
3. **Next.js Compatibility**: Seamless integration with Next.js middleware
4. **Modern Architecture**: Built for modern JavaScript environments
5. **Enhanced Features**: Better error handling and validation
6. **Future Proof**: Active development and community support

This authentication system provides enterprise-grade security with modern standards compliance, making it suitable for production applications requiring robust user management and security features.
