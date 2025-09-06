// Connection utility functions
import { Connection } from "../models/connection.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

/**
 * Check if current user is authorized to perform action on connection
 * @param {string} connectionId - Connection ID
 * @param {string} currentUserId - Current user ID
 * @param {string} action - Action to perform ('accept', 'reject', 'cancel', 'view')
 * @returns {Promise<Object>} - Authorization result
 */
export const checkConnectionAuthorization = async (connectionId, currentUserId, action) => {
    try {
        const connection = await Connection.findById(connectionId);
        
        if (!connection) {
            return { authorized: false, reason: 'connection_not_found' };
        }

        switch (action) {
            case 'accept':
            case 'reject':
                // Only the receiver can accept/reject
                if (connection.to.toString() !== currentUserId) {
                    return { authorized: false, reason: 'not_connection_recipient' };
                }
                if (connection.status !== 'pending') {
                    return { authorized: false, reason: 'connection_not_pending' };
                }
                break;
                
            case 'cancel':
                // Only the sender can cancel
                if (connection.from.toString() !== currentUserId) {
                    return { authorized: false, reason: 'not_connection_sender' };
                }
                if (connection.status !== 'pending') {
                    return { authorized: false, reason: 'connection_not_pending' };
                }
                break;
                
            case 'view':
                // Both sender and receiver can view
                if (connection.from.toString() !== currentUserId && connection.to.toString() !== currentUserId) {
                    return { authorized: false, reason: 'not_connection_participant' };
                }
                break;
                
            default:
                return { authorized: false, reason: 'invalid_action' };
        }

        return { authorized: true, connection };
    } catch (error) {
        return { authorized: false, reason: 'error', error };
    }
};

/**
 * Check if user can view another user's connections (privacy check)
 * @param {string} targetUserId - User whose connections are being viewed
 * @param {string} currentUserId - Current user ID
 * @returns {Promise<boolean>} - True if authorized to view
 */
export const canViewUserConnections = async (targetUserId, currentUserId) => {
    try {
        // Users can always view their own connections
        if (targetUserId === currentUserId) {
            return true;
        }

        // Check if users are connected (connected users can see each other's connections)
        const areConnected = await areUsersConnected(targetUserId, currentUserId);
        if (areConnected) {
            return true;
        }

        // Check if target user has public connection visibility (this would be in user preferences)
        const targetUser = await User.findById(targetUserId).select('connectionVisibility');
        if (targetUser && targetUser.connectionVisibility === 'public') {
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
};

/**
 * Check if user is authorized to send connection request
 * @param {string} fromUserId - Sender user ID
 * @param {string} toUserId - Receiver user ID
 * @returns {Promise<Object>} - Authorization result with detailed checks
 */
export const authorizeConnectionRequest = async (fromUserId, toUserId) => {
    try {
        // Basic validation
        if (fromUserId === toUserId) {
            return { authorized: false, reason: 'cannot_send_to_self' };
        }

        // Check if sender exists and is active
        const sender = await User.findById(fromUserId).select('isActive role isProfileComplete');
        if (!sender) {
            return { authorized: false, reason: 'sender_not_found' };
        }
        
        if (!sender.isActive) {
            return { authorized: false, reason: 'sender_account_inactive' };
        }

        // Check if target user exists and is active
        const targetUser = await User.findById(toUserId).select('isActive role acceptingConnections isProfileComplete');
        if (!targetUser) {
            return { authorized: false, reason: 'target_user_not_found' };
        }
        
        if (!targetUser.isActive) {
            return { authorized: false, reason: 'target_user_inactive' };
        }

        // Check if target user is accepting connections (privacy setting)
        if (targetUser.acceptingConnections === false) {
            return { authorized: false, reason: 'target_user_not_accepting_connections' };
        }

        // Check if profiles are complete (business rule)
        if (!sender.isProfileComplete || !targetUser.isProfileComplete) {
            return { authorized: false, reason: 'incomplete_profiles' };
        }

        // Check if user is blocked by target user
        const isBlocked = await isUserBlockedBy(fromUserId, toUserId);
        if (isBlocked) {
            return { authorized: false, reason: 'blocked_by_target_user' };
        }

        // Check existing connection status
        const existingConnection = await Connection.findOne({
            $or: [
                { from: fromUserId, to: toUserId },
                { from: toUserId, to: fromUserId }
            ]
        });

        if (existingConnection) {
            switch (existingConnection.status) {
                case 'pending':
                    return { authorized: false, reason: 'request_already_exists' };
                case 'accepted':
                    return { authorized: false, reason: 'already_connected' };
                case 'blocked':
                    return { authorized: false, reason: 'connection_blocked' };
                case 'rejected':
                    // Check if enough time has passed since rejection (e.g., 24 hours)
                    const timeSinceRejection = Date.now() - existingConnection.respondedAt.getTime();
                    const oneDayInMs = 24 * 60 * 60 * 1000;
                    if (timeSinceRejection < oneDayInMs) {
                        return { authorized: false, reason: 'too_soon_after_rejection' };
                    }
                    break;
            }
        }

        return { 
            authorized: true, 
            sender, 
            targetUser, 
            existingConnection 
        };
    } catch (error) {
        return { authorized: false, reason: 'error', error };
    }
};

/**
 * Check if user is authorized to remove a connection
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @param {string} currentUserId - Current user performing the action
 * @returns {Promise<Object>} - Authorization result
 */
export const authorizeConnectionRemoval = async (userId1, userId2, currentUserId) => {
    try {
        // User can only remove connections they are part of
        if (currentUserId !== userId1 && currentUserId !== userId2) {
            return { authorized: false, reason: 'not_connection_participant' };
        }

        // Check if connection exists and is accepted
        const connection = await Connection.findOne({
            $or: [
                { from: userId1, to: userId2 },
                { from: userId2, to: userId1 }
            ],
            status: 'accepted'
        });

        if (!connection) {
            return { authorized: false, reason: 'connection_not_found_or_not_accepted' };
        }

        return { authorized: true, connection };
    } catch (error) {
        return { authorized: false, reason: 'error', error };
    }
};

/**
 * Check if user is authorized to block another user
 * @param {string} blockerUserId - User who wants to block
 * @param {string} targetUserId - User to be blocked
 * @returns {Promise<Object>} - Authorization result
 */
export const authorizeUserBlocking = async (blockerUserId, targetUserId) => {
    try {
        if (blockerUserId === targetUserId) {
            return { authorized: false, reason: 'cannot_block_self' };
        }

        // Check if target user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return { authorized: false, reason: 'target_user_not_found' };
        }

        // Check if user is trying to block an admin (business rule)
        if (targetUser.role === 'admin') {
            return { authorized: false, reason: 'cannot_block_admin' };
        }

        return { authorized: true, targetUser };
    } catch (error) {
        return { authorized: false, reason: 'error', error };
    }
};

/**
 * Check rate limiting for connection requests
 * @param {string} userId - User ID
 * @param {number} maxRequestsPerHour - Maximum requests per hour (default: 10)
 * @returns {Promise<Object>} - Rate limit check result
 */
export const checkConnectionRequestRateLimit = async (userId, maxRequestsPerHour = 10) => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentRequests = await Connection.countDocuments({
            from: userId,
            createdAt: { $gte: oneHourAgo }
        });

        if (recentRequests >= maxRequestsPerHour) {
            return { 
                allowed: false, 
                reason: 'rate_limit_exceeded', 
                resetTime: new Date(Date.now() + 60 * 60 * 1000) 
            };
        }

        return { 
            allowed: true, 
            remaining: maxRequestsPerHour - recentRequests 
        };
    } catch (error) {
        return { allowed: true, reason: 'error_checking_rate_limit' };
    }
};

/**
 * Validate user permissions for connection actions
 * @param {string} userId - User ID to validate
 * @param {string} action - Action being performed
 * @returns {Promise<Object>} - Permission validation result
 */
export const validateUserPermissions = async (userId, action) => {
    try {
        const user = await User.findById(userId).select('isActive role isVerified isProfileComplete');
        
        if (!user) {
            return { valid: false, reason: 'user_not_found' };
        }

        if (!user.isActive) {
            return { valid: false, reason: 'account_inactive' };
        }

        // Check if user needs to complete profile for certain actions
        const actionsRequiringCompleteProfile = [
            'send_connection_request',
            'accept_connection_request'
        ];

        if (actionsRequiringCompleteProfile.includes(action) && !user.isProfileComplete) {
            return { valid: false, reason: 'profile_incomplete' };
        }

        // Check if user needs verification for certain actions (business rule)
        const actionsRequiringVerification = [
            'bulk_connection_requests'
        ];

        if (actionsRequiringVerification.includes(action) && !user.isVerified) {
            return { valid: false, reason: 'account_not_verified' };
        }

        return { valid: true, user };
    } catch (error) {
        return { valid: false, reason: 'error', error };
    }
};

export const areUsersConnected = async (userId1, userId2) => {
    try {
        const connection = await Connection.findOne({
            $or: [
                { from: userId1, to: userId2 },
                { from: userId2, to: userId1 }
            ],
            status: 'accepted'
        });
        return connection;
    } catch (error) {
        return null;
    }
};

/**
 * Check connection status between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<string>} - Connection status
 */
export const getConnectionStatus = async (userId1, userId2) => {
    try {
        const connection = await Connection.findOne({
            $or: [
                { from: userId1, to: userId2 },
                { from: userId2, to: userId1 }
            ]
        });

        if (!connection) return 'not_connected';
        return connection.status;
    } catch (error) {
        return 'error';
    }
};

/**
 * Check if user can send connection request to another user
 * @param {string} fromUserId - Sender user ID
 * @param {string} toUserId - Receiver user ID
 * @returns {Promise<Object>} - Object with canSend boolean and reason
 */
export const canSendConnectionRequest = async (fromUserId, toUserId) => {
    try {
        if (fromUserId === toUserId) {
            return { canSend: false, reason: 'cannot_send_to_self' };
        }

        // Check if target user exists
        const targetUser = await User.findById(toUserId);
        if (!targetUser) {
            return { canSend: false, reason: 'user_not_found' };
        }

        // Check existing connection
        const connection = await Connection.findOne({
            $or: [
                { from: fromUserId, to: toUserId },
                { from: toUserId, to: fromUserId }
            ]
        });

        if (!connection) {
            return { canSend: true, reason: 'no_existing_connection' };
        }

        switch (connection.status) {
            case 'pending':
                return { canSend: false, reason: 'request_already_sent' };
            case 'accepted':
                return { canSend: false, reason: 'already_connected' };
            case 'blocked':
                return { canSend: false, reason: 'blocked' };
            case 'rejected':
                // Can send again after rejection
                return { canSend: true, reason: 'can_retry_after_rejection' };
            default:
                return { canSend: false, reason: 'unknown_status' };
        }
    } catch (error) {
        return { canSend: false, reason: 'error' };
    }
};

/**
 * Get user's connection count
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of connections
 */
export const getUserConnectionCount = async (userId) => {
    try {
        const count = await Connection.countDocuments({
            $or: [
                { from: userId },
                { to: userId }
            ],
            status: 'accepted'
        });
        return count;
    } catch (error) {
        return 0;
    }
};

/**
 * Get pending connection requests count for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Object with received and sent counts
 */
export const getPendingRequestsCount = async (userId) => {
    try {
        const [received, sent] = await Promise.all([
            Connection.countDocuments({
                to: userId,
                status: 'pending'
            }),
            Connection.countDocuments({
                from: userId,
                status: 'pending'
            })
        ]);

        return { received, sent, total: received + sent };
    } catch (error) {
        return { received: 0, sent: 0, total: 0 };
    }
};

/**
 * Get mutual connections count between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<number>} - Number of mutual connections
 */
export const getMutualConnectionsCount = async (userId1, userId2) => {
    try {
        // Get user1's connections
        const user1Connections = await Connection.find({
            $or: [
                { from: userId1 },
                { to: userId1 }
            ],
            status: 'accepted'
        });

        // Get user2's connections
        const user2Connections = await Connection.find({
            $or: [
                { from: userId2 },
                { to: userId2 }
            ],
            status: 'accepted'
        });

        // Extract connected user IDs for user1
        const user1ConnectedIds = user1Connections.map(conn => 
            conn.from.toString() === userId1 ? conn.to.toString() : conn.from.toString()
        );

        // Extract connected user IDs for user2
        const user2ConnectedIds = user2Connections.map(conn => 
            conn.from.toString() === userId2 ? conn.to.toString() : conn.from.toString()
        );

        // Find mutual connections
        const mutualCount = user1ConnectedIds.filter(id => 
            user2ConnectedIds.includes(id)
        ).length;

        return mutualCount;
    } catch (error) {
        return 0;
    }
};

/**
 * Get suggested connections for a user based on mutual connections
 * @param {string} userId - User ID
 * @param {number} limit - Number of suggestions to return
 * @returns {Promise<Array>} - Array of suggested user IDs
 */
export const getSuggestedConnections = async (userId, limit = 10) => {
    try {
        // Get user's current connections
        const userConnections = await Connection.find({
            $or: [
                { from: userId },
                { to: userId }
            ],
            status: { $in: ['accepted', 'pending', 'blocked'] }
        });

        // Extract connected/blocked user IDs
        const excludeUserIds = userConnections.map(conn => 
            conn.from.toString() === userId ? conn.to.toString() : conn.from.toString()
        );
        excludeUserIds.push(userId); // Exclude self

        // Get current user details
        const currentUser = await User.findById(userId);
        if (!currentUser) return [];

        // Find users with similar profiles (same role, similar interests, etc.)
        const suggestions = await User.find({
            _id: { $nin: excludeUserIds },
            role: currentUser.role === 'student' ? 'alumni' : 'student', // Suggest opposite role
            isProfileVerified: true
        })
        .select('_id firstName lastName profileImage email role profileHeadline')
        .limit(limit);

        return suggestions;
    } catch (error) {
        return [];
    }
};

/**
 * Validate connection request data
 * @param {string} fromUserId - Sender user ID
 * @param {string} toUserId - Receiver user ID
 * @returns {Object} - Validation result
 */
export const validateConnectionRequest = (fromUserId, toUserId) => {
    const errors = [];

    if (!fromUserId) {
        errors.push('Sender user ID is required');
    }

    if (!toUserId) {
        errors.push('Receiver user ID is required');
    }

    if (fromUserId === toUserId) {
        errors.push('Cannot send connection request to yourself');
    }

    if (!mongoose.Types.ObjectId.isValid(fromUserId)) {
        errors.push('Invalid sender user ID format');
    }

    if (!mongoose.Types.ObjectId.isValid(toUserId)) {
        errors.push('Invalid receiver user ID format');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Format connection data for API response
 * @param {Object} connection - Connection object
 * @param {string} currentUserId - Current user ID for context
 * @returns {Object} - Formatted connection data
 */
export const formatConnectionResponse = (connection, currentUserId) => {
    const connObj = connection.toObject ? connection.toObject() : connection;
    
    return {
        ...connObj,
        isRequestSent: connObj.from.toString() === currentUserId,
        isRequestReceived: connObj.to.toString() === currentUserId,
        otherUser: connObj.from.toString() === currentUserId ? connObj.to : connObj.from
    };
};

/**
 * Get connection statistics for analytics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Connection statistics
 */
export const getConnectionAnalytics = async (userId) => {
    try {
        const [
            totalConnections,
            pendingRequests,
            connectionsThisMonth,
            connectionsByRole
        ] = await Promise.all([
            // Total connections
            Connection.countDocuments({
                $or: [{ from: userId }, { to: userId }],
                status: 'accepted'
            }),
            
            // Pending requests
            getPendingRequestsCount(userId),
            
            // Connections made this month
            Connection.countDocuments({
                $or: [{ from: userId }, { to: userId }],
                status: 'accepted',
                respondedAt: {
                    $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
            }),
            
            // Connections by role
            Connection.aggregate([
                {
                    $match: {
                        $or: [{ from: new mongoose.Types.ObjectId(userId) }, { to: new mongoose.Types.ObjectId(userId) }],
                        status: 'accepted'
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'from',
                        foreignField: '_id',
                        as: 'fromUser'
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'to',
                        foreignField: '_id',
                        as: 'toUser'
                    }
                },
                {
                    $addFields: {
                        connectedUser: {
                            $cond: {
                                if: { $eq: ['$from', new mongoose.Types.ObjectId(userId)] },
                                then: { $arrayElemAt: ['$toUser', 0] },
                                else: { $arrayElemAt: ['$fromUser', 0] }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$connectedUser.role',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        return {
            totalConnections,
            pendingRequests,
            connectionsThisMonth,
            connectionsByRole: connectionsByRole.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        };
    } catch (error) {
        return {
            totalConnections: 0,
            pendingRequests: { received: 0, sent: 0, total: 0 },
            connectionsThisMonth: 0,
            connectionsByRole: {}
        };
    }
};

/**
 * Check if user is blocked by another user
 * @param {string} userId - User ID to check
 * @param {string} blockedBy - User who might have blocked
 * @returns {Promise<boolean>} - True if blocked
 */
export const isUserBlockedBy = async (userId, blockedBy) => {
    try {
        const blocked = await Connection.findOne({
            from: blockedBy,
            to: userId,
            status: 'blocked'
        });
        return !!blocked;
    } catch (error) {
        return false;
    }
};

/**
 * Get users who have blocked the current user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of user IDs who blocked this user
 */
export const getUsersWhoBlockedMe = async (userId) => {
    try {
        const blockedConnections = await Connection.find({
            to: userId,
            status: 'blocked'
        }).select('from');
        
        return blockedConnections.map(conn => conn.from.toString());
    } catch (error) {
        return [];
    }
};

export {
    areUsersConnected,
    canSendConnectionRequest,
    getUserConnectionCount,
    getMutualConnectionsCount,
    getSuggestedConnections,
    validateConnectionRequest,
    formatConnectionResponse,
    getConnectionAnalytics,
    isUserBlockedBy,
    getUsersWhoBlockedMe
};
