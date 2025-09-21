# AlmaSync Authentication & Authorization System Documentation

## Overview

AlmaSync implements a comprehensive JOSE-based dual token authentication system with role-based access control, session management, and advanced security features. The system supports three user roles: `student`, `alumni`, and `admin`, each with specific access patterns and authentication flows.

## Architecture Components

### 1. Core Components
- **JWT Utilities** (`utils/jwt.js`): JOSE-based token generation, verification, and management
- **User Model** (`models/user.model.js`): Database schema with security features
- **Auth Controller** (`controllers/auth.controller.js`): Authentication endpoints
- **Auth Middlewares**: User and admin authentication middleware
- **Session Management**: Advanced session tracking and device management

### 2. Security Features
- Dual token system (access + refresh tokens)
- Account lockout after failed attempts
- Session tracking and device management
- Token rotation on refresh
- Remember me functionality
- Role-based access control
- IP and User-Agent tracking

## Token System Architecture

### JOSE-Based JWT Implementation

#### Access Tokens
```javascript
{
  "userId": "user_id",
  "role": "student|alumni|admin", 
  "email": "user@example.com",
  "uid": "unique_identifier",
  "sessionId": "session_uuid", // Optional
  "tokenId": "token_uuid",
  "type": "access",
  "jti": "token_uuid", // JWT ID (same as tokenId)
  "iat": 1234567890,
  "exp": 1234568790, // 15 minutes from iat
  "iss": "almasync-backend",
  "aud": "almasync-frontend"
}
```

#### Refresh Tokens
```javascript
{
  "userId": "user_id",
  "role": "student|alumni|admin",
  "email": "user@example.com", 
  "uid": "unique_identifier",
  "sessionId": "session_uuid", // Optional
  "tokenId": "token_uuid",
  "type": "refresh",
  "jti": "token_uuid", // JWT ID (same as tokenId)
  "rememberMe": false,
  "iat": 1234567890,
  "exp": 1234567890, // 7 days (30 days if rememberMe)
  "iss": "almasync-backend", 
  "aud": "almasync-frontend"
}
```

#### Token Generation Functions

**generateAccessToken(payload)**
- Creates 15-minute access tokens
- Includes user data and session information
- Returns: `{token, tokenId, expiresIn}`

**generateRefreshToken(payload, rememberMe)**
- Creates 7-day tokens (30 days with rememberMe)
- Includes remember me flag in payload
- Returns: `{token, tokenId, expiresIn, rememberMe}`

**generateTokenPair(payload, rememberMe, sessionId)**
- Generates both tokens simultaneously
- Links tokens to session if provided
- Returns: `{accessToken, refreshToken, accessTokenId, refreshTokenId, tokenType, expiresIn, refreshExpiresIn, rememberMe}`

## Authentication Flows

### 1. User Registration Flow

#### Endpoint: `POST /api/auth/signup`

#### Request Body
```javascript
{
  "email": "student@example.com",
  "firstName": "John",
  "lastName": "Doe", 
  "password": "SecurePassword123",
  "college": "University Name",
  "uid": "unique_id",
  "admissionYear": 2020,
  "passoutYear": 2024,
  "degree": "Bachelor",
  "department": "Computer Science",
  "role": "student" // or "alumni"
}
```

#### Success Response (201)
```javascript
{
  "statusCode": 201,
  "data": {
    "user": {
      "_id": "user_id",
      "uid": "unique_id",
      "email": "student@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "student",
      "isProfileVerified": false,
      "isProfileComplete": false
    }
  },
  "message": "User created successfully",
  "success": true
}
```

#### Error Responses

**400 - Missing Fields**
```javascript
{
  "statusCode": 400,
  "data": null,
  "message": "All fields are required",
  "success": false
}
```

**409 - User Already Exists**
```javascript
{
  "statusCode": 409,
  "data": null,
  "message": "User already exists with the email or uid",
  "success": false
}
```

**500 - Server Error**
```javascript
{
  "statusCode": 500,
  "data": null,
  "message": "Something went wrong while creating a user",
  "success": false
}
```

### 2. User Login Flow

#### Endpoint: `POST /api/auth/login`

#### Request Body
```javascript
{
  "email": "student@example.com", // or uid
  "uid": "unique_id", // alternative to email
  "password": "SecurePassword123",
  "rememberMe": false // optional, default false
}
```

#### Success Response (200)
```javascript
{
  "statusCode": 200,
  "data": {
    "user": {
      "_id": "user_id",
      "uid": "unique_id", 
      "email": "student@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "student",
      "isProfileVerified": false,
      "isProfileComplete": false
    },
    "tokens": {
      "accessToken": "eyJ...", 
      "refreshToken": "eyJ...",
      "tokenType": "Bearer",
      "expiresIn": "15m"
    },
    "sessionId": "session_uuid"
  },
  "message": "User has been successfully logged in",
  "success": true
}
```

#### Error Responses

**404 - User Not Found**
```javascript
{
  "statusCode": 404,
  "data": null,
  "message": "Invalid credentials :: user not found",
  "success": false
}
```

**401 - Invalid Password**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Invalid password",
  "success": false
}
```

**429 - Account Locked**
```javascript
{
  "statusCode": 429,
  "data": null,
  "message": "Account temporarily locked due to too many failed login attempts. Please try again later.",
  "success": false
}
```

#### Session and Token Management
- Creates session with UUID
- Links refresh token to session
- Stores device info and IP address
- Limits to 5 active refresh tokens per user
- Updates `lastActive` timestamp

### 3. User Logout Flow

#### Endpoint: `POST /api/auth/logout`
#### Authentication: Required (userAuthentication middleware)

#### Request Body
```javascript
{
  "sessionId": "optional_session_uuid" // optional
}
```

#### Success Response (200)
```javascript
{
  "statusCode": 200,
  "data": {},
  "message": "User successfully logged out",
  "success": true
}
```

#### Logout Process
1. Extracts refresh token from cookies or header
2. Verifies refresh token (continues even if invalid)
3. Revokes specific refresh token from database
4. Removes associated session if sessionId available
5. Clears both access and refresh token cookies
6. Always returns success (even with errors)

### 4. Token Refresh Flow

#### Endpoint: `POST /api/auth/refresh-token`
#### Authentication: userRefreshTokenValidation middleware

#### Request Body
```javascript
{
  "sessionId": "optional_session_uuid" // optional
}
```

#### Success Response (200)
```javascript
{
  "statusCode": 200,
  "data": {
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...", // new refresh token
      "tokenType": "Bearer",
      "expiresIn": "15m"
    }
  },
  "message": "Access token refreshed successfully",
  "success": true
}
```

#### Error Responses

**401 - No Refresh Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Refresh token not found",
  "success": false
}
```

**401 - Invalid Refresh Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Invalid refresh token - user not found",
  "success": false
}
```

**401 - Revoked Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Refresh token has been revoked or expired",
  "success": false
}
```

#### Token Refresh Process
1. Validates refresh token and user existence
2. Checks token validity in database
3. Revokes old refresh token
4. Generates new token pair
5. Maintains session continuity
6. Updates session access time

## Authorization System

### 1. User Authentication Middleware

#### Purpose
Protects routes requiring user authentication (students/alumni only)

#### Implementation
```javascript
userAuthentication(req, res, next)
```

#### Process Flow
1. **Token Extraction**: From cookies (`accessToken`) or Authorization header
2. **Token Verification**: Using JOSE with issuer/audience validation
3. **Payload Validation**: Ensures token type is 'access'
4. **User Lookup**: Finds user by ID from token
5. **Role Verification**: Rejects admin users (should use admin routes)
6. **Account Status**: Checks if account is locked
7. **Session Update**: Updates session activity if sessionId provided
8. **User Attachment**: Adds user object to `req.user`

#### Success Response
- User object attached to request
- Continues to next middleware/controller

#### Error Responses

**401 - No Access Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Access token not found - unauthorized request",
  "success": false
}
```

**401 - Invalid Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Invalid access token - user not found",
  "success": false
}
```

**401 - Expired Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Access token expired - please refresh",
  "success": false
}
```

**403 - Admin User**
```javascript
{
  "statusCode": 403,
  "data": null,
  "message": "Admin users should use admin routes",
  "success": false
}
```

**423 - Account Locked**
```javascript
{
  "statusCode": 423,
  "data": null,
  "message": "Account is temporarily locked",
  "success": false
}
```

### 2. Optional User Authentication Middleware

#### Purpose
For routes that work with both authenticated and non-authenticated users

#### Implementation
```javascript
optionalUserAuthentication(req, res, next)
```

#### Behavior
- Never throws errors
- Attaches user to request if valid token provided
- Continues execution regardless of authentication status
- Useful for public endpoints with optional user context

### 3. Admin Authentication Middleware

#### Purpose
Protects admin-only routes

#### Implementation
```javascript
adminAuthentication(req, res, next)
```

#### Process Flow
1. **Token Extraction**: From `adminAccessToken` cookie, `accessToken` cookie, or Authorization header
2. **Token Verification**: Using JOSE verification
3. **User Lookup**: Finds admin by ID from token
4. **Role Verification**: Ensures user has admin role
5. **Account Status**: Checks if admin account is locked
6. **Session Update**: Updates admin session activity
7. **Admin Attachment**: Adds admin object to `req.admin`

#### Error Responses

**401 - No Admin Token**
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Admin access token not found - unauthorized request",
  "success": false
}
```

**403 - Not Admin**
```javascript
{
  "statusCode": 403,
  "data": null,
  "message": "Unauthorized - admin role required",
  "success": false
}
```

**423 - Admin Account Locked**
```javascript
{
  "statusCode": 423,
  "data": null,
  "message": "Admin account is temporarily locked",
  "success": false
}
```

## Security Features

### 1. Account Lockout System

#### Configuration
- **Failed Attempt Threshold**: 5 attempts
- **Lockout Duration**: 30 minutes
- **Attempt Reset Window**: 15 minutes

#### Process
1. Failed login increments attempt counter
2. Counter resets after 15 minutes of inactivity
3. Account locks after 5 failed attempts
4. Successful login resets all counters
5. Locked accounts return 429 status

### 2. Session Management

#### Features
- **Session Tracking**: UUID-based session identification
- **Device Information**: User-Agent and IP address logging
- **Session Limits**: Maximum 10 active sessions per user
- **Session Cleanup**: Automatic removal of old sessions
- **Activity Updates**: Last access timestamp tracking

#### Session Data Structure
```javascript
{
  sessionId: "uuid",
  deviceInfo: "User-Agent string",
  ipAddress: "client_ip",
  refreshTokenId: "token_uuid", // Links session to token
  createdAt: Date,
  lastAccess: Date
}
```

### 3. Refresh Token Management

#### Features
- **Token Limits**: Maximum 5 active refresh tokens
- **Automatic Cleanup**: Removes expired and revoked tokens
- **Revocation**: Individual token revocation capability
- **Device Tracking**: Links tokens to specific devices
- **Rotation**: New refresh token on each refresh

#### Refresh Token Data Structure
```javascript
{
  token: "jwt_string",
  tokenId: "uuid",
  expiresAt: Date,
  userAgent: "User-Agent string",
  ipAddress: "client_ip", 
  rememberMe: Boolean,
  sessionId: "session_uuid", // Optional
  createdAt: Date,
  isRevoked: Boolean
}
```

### 4. Cookie Security

#### Configuration
```javascript
{
  httpOnly: true, // Prevents XSS access
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/',
  maxAge: // Token-specific expiry
}
```

## API Route Protection

### Public Routes
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User authentication
- `GET /api/auth/forgot-password/:email` - Password reset initiation

### Protected User Routes
- `POST /api/auth/logout` - User logout (userAuthentication)
- `POST /api/auth/refresh-token` - Token refresh (userRefreshTokenValidation)
- All user-specific endpoints (profile, connections, etc.)

### Protected Admin Routes
- All `/api/admin/*` routes (adminAuthentication)
- Admin-specific functionalities

### Optional Authentication Routes
- Public feeds with user context
- Search endpoints with personalization

## Error Handling

### Standardized Error Response Format
```javascript
{
  "statusCode": 401,
  "data": null,
  "message": "Specific error message",
  "success": false
}
```

### Common HTTP Status Codes
- **200**: Success
- **201**: Created (registration)
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (authentication required)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (user/resource not found)
- **409**: Conflict (user already exists)
- **423**: Locked (account temporarily locked)
- **429**: Too Many Requests (rate limiting/account lockout)
- **500**: Internal Server Error

## Best Practices & Security Considerations

### 1. Token Security
- Short-lived access tokens (15 minutes)
- Secure refresh token storage
- Token rotation on refresh
- Proper token revocation

### 2. Session Security
- Session activity tracking
- Device fingerprinting
- Session limits and cleanup
- IP address validation

### 3. Account Security
- Password hashing with bcrypt
- Account lockout protection
- Login attempt monitoring
- Role-based access control

### 4. Database Security
- Indexed fields for performance
- Sensitive data exclusion in queries
- Proper data validation
- Automatic cleanup of expired data

### 5. API Security
- Input validation
- Rate limiting ready
- CORS configuration
- Secure cookie settings
- Proper error messages (no information leakage)

## Troubleshooting Guide

### Common Issues

#### 1. "Access token expired - please refresh"
- **Cause**: Access token has exceeded 15-minute lifespan
- **Solution**: Use refresh token endpoint to get new access token
- **Prevention**: Implement automatic token refresh in frontend

#### 2. "Refresh token has been revoked or expired"
- **Cause**: Refresh token was manually revoked or expired
- **Solution**: User must log in again
- **Prevention**: Monitor token expiry and refresh proactively

#### 3. "Account temporarily locked"
- **Cause**: 5 failed login attempts within timeframe
- **Solution**: Wait 30 minutes or contact admin
- **Prevention**: Implement account recovery mechanisms

#### 4. "Admin users should use admin routes"
- **Cause**: Admin user trying to access user-protected routes
- **Solution**: Use admin-specific endpoints
- **Prevention**: Proper role-based routing in frontend

### Debugging Tips

1. **Check token payload**: Decode JWT to verify structure
2. **Verify token type**: Ensure access tokens for authentication
3. **Check expiry times**: Validate token timestamps
4. **Monitor session data**: Track session creation and updates
5. **Review database state**: Check refresh token and session collections

## Future Enhancements

### Planned Features
1. **Two-Factor Authentication (2FA)**
2. **OAuth Integration** (Google, GitHub)
3. **Advanced Rate Limiting**
4. **Audit Logging**
5. **Suspicious Activity Detection**
6. **Device Management Dashboard**
7. **Session Analytics**
8. **Token Blacklisting**

### Performance Optimizations
1. **Redis Session Storage**
2. **Token Caching**
3. **Database Indexing**
4. **Connection Pooling**
5. **Async Token Validation**

This documentation provides a comprehensive overview of the AlmaSync authentication and authorization system. For implementation details, refer to the source code in the respective modules.
