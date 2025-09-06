import mongoose from "mongoose";

import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: [true, "password is required "],
    },

    firstName: {
      type: String,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ["student", "alumni", "admin"],
      required: true,
    },
    
    isActive: { type: Boolean, default: false },
    
    lastActive: Date,

    isProfileComplete: {
      type: Boolean,
      default: false,
    },

    isProfileVerified: {
      type: Boolean,
      default: false,
    },

    verifyOtp: {
      type: Number,
    },

    // Refresh Token Management
    refreshTokens: [{
      token: {
        type: String,
        required: true,
      },
      tokenId: {
        type: String,
        required: true,
        unique: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
      userAgent: String,
      ipAddress: String,
      isRevoked: {
        type: Boolean,
        default: false,
      },
    }],

    // Account security
    loginAttempts: {
      count: { type: Number, default: 0 },
      lastAttempt: Date,
      lockedUntil: Date,
    },

    // Session management
    activeSessions: [{
      sessionId: String,
      deviceInfo: String,
      lastAccess: Date,
      ipAddress: String,
    }],

    mobileNumber: {
      type: String,
    },

    address: {
      country: {
        type: String,

        trim: true,
      },
      state: {
        type: String,

        trim: true,
      },
      city: {
        type: String,

        trim: true,
      },
      pincode: {
        type: Number,
      },
      houseNo: {
        type: String,
        trim: true,
      },
      landmark: {
        type: String,
        trim: true,
      },
    },

    dateOfBirth: {
      type: Date,
    },

    resume: {
      type: String,
    },

    college: {
      type: String,
     
    },

    admissionYear: {
      type: Number,
     
    },

    passoutYear: {
      type: Number,
      
    },
    degree: {
      type: String,
      
    },
    department: {
      type: String,
      
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },

    about: {
      type: String,
    },

    isEmployed: {
      type: Boolean,
      default: false,
    },

    // Enhanced employment details for better analytics
    currentJobTitle: {
      type: String,
      trim: true,
    },
    
    currentCompany: {
      type: String,
      trim: true,
    },
    
    currentSalary: {
      amount: { type: Number, min: 0 },
      currency: { type: String, default: "INR" },
      type: { type: String, enum: ["monthly", "yearly"], default: "yearly" },
    },
    
    workLocation: {
      type: String,
      trim: true,
    },

    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    communicationLanguages: [
      {
        type: String,
      },
    ],

    profileImage: {
      type: String,
    },

    coverImage: {
      type: String,
    },

    profileHeadline: {
      type: String,
    },

    availableForMentorship: {
      type: Boolean,
      default: false,
    },

    mentorshipExperience: {
      type: Number,
    },

    mentorshipTopics: [
      {
        type: String,
      },
    ],

    mentorshipsNeeds: [
      {
        type: String,
      },
    ],

    socials: {
      linkedin: { type: String },
      github: { type: String },
      twitter: { type: String },
      portfolio: { type: String },
    },

    hobbies: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);

  next();
});

UserSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Refresh token management methods
UserSchema.methods.addRefreshToken = async function (tokenData) {
  const { token, tokenId, expiresAt, userAgent = '', ipAddress = '' } = tokenData;
  
  // Remove expired tokens and limit active tokens to 5
  this.refreshTokens = this.refreshTokens.filter(
    (rt) => rt.expiresAt > new Date() && !rt.isRevoked
  ).slice(-4); // Keep only the latest 4 tokens
  
  // Add new refresh token
  this.refreshTokens.push({
    token,
    tokenId,
    expiresAt,
    userAgent,
    ipAddress,
    createdAt: new Date(),
    isRevoked: false,
  });
  
  await this.save();
};

UserSchema.methods.revokeRefreshToken = async function (tokenId) {
  const tokenIndex = this.refreshTokens.findIndex(
    (rt) => rt.tokenId === tokenId
  );
  
  if (tokenIndex !== -1) {
    this.refreshTokens[tokenIndex].isRevoked = true;
    await this.save();
    return true;
  }
  
  return false;
};

UserSchema.methods.revokeAllRefreshTokens = async function () {
  this.refreshTokens.forEach((rt) => {
    rt.isRevoked = true;
  });
  await this.save();
};

UserSchema.methods.removeExpiredRefreshTokens = async function () {
  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter(
    (rt) => rt.expiresAt > now && !rt.isRevoked
  );
  await this.save();
};

UserSchema.methods.isRefreshTokenValid = function (tokenId) {
  const token = this.refreshTokens.find((rt) => rt.tokenId === tokenId);
  return token && !token.isRevoked && token.expiresAt > new Date();
};

// Account security methods
UserSchema.methods.incrementLoginAttempts = async function () {
  // If we have a previous attempt and it's been more than 15 minutes, reset attempts
  if (this.loginAttempts.lastAttempt && 
      Date.now() - this.loginAttempts.lastAttempt.getTime() > 15 * 60 * 1000) {
    this.loginAttempts.count = 1;
  } else {
    this.loginAttempts.count += 1;
  }
  
  this.loginAttempts.lastAttempt = new Date();
  
  // Lock account after 5 failed attempts for 30 minutes
  if (this.loginAttempts.count >= 5) {
    this.loginAttempts.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  await this.save();
};

UserSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts.count = 0;
  this.loginAttempts.lastAttempt = undefined;
  this.loginAttempts.lockedUntil = undefined;
  await this.save();
};

UserSchema.methods.isAccountLocked = function () {
  return this.loginAttempts.lockedUntil && this.loginAttempts.lockedUntil > new Date();
};

// Session management methods
UserSchema.methods.addSession = async function (sessionData) {
  const { sessionId, deviceInfo, ipAddress } = sessionData;
  
  // Remove old sessions (keep only 10 most recent)
  this.activeSessions = this.activeSessions.slice(-9);
  
  // Add new session
  this.activeSessions.push({
    sessionId,
    deviceInfo,
    ipAddress,
    lastAccess: new Date(),
  });
  
  await this.save();
};

UserSchema.methods.updateSessionAccess = async function (sessionId) {
  const session = this.activeSessions.find((s) => s.sessionId === sessionId);
  if (session) {
    session.lastAccess = new Date();
    await this.save();
  }
};

UserSchema.methods.removeSession = async function (sessionId) {
  this.activeSessions = this.activeSessions.filter(
    (s) => s.sessionId !== sessionId
  );
  await this.save();
};

UserSchema.methods.clearAllSessions = async function () {
  this.activeSessions = [];
  await this.save();
};

export const User = mongoose.model("users", UserSchema);
