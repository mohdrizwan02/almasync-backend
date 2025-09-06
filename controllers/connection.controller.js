import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Connection } from "../models/connection.model.js";
import { User } from "../models/user.model.js";
import { createNotification } from "./notification.controller.js";
import mongoose from "mongoose";

// Socket.IO instance (will be initialized from chat controller or separately)
let io;

// Initialize Socket.IO for connections
const initializeConnectionSocket = (socketIO) => {
    io = socketIO;
    
    // Add connection-specific event handlers to existing socket connection
    io.on('connection', (socket) => {
        // Join user to their notification room
        socket.on('join_notifications', (userData) => {
            socket.join(`notifications_${userData.userId}`);
            console.log(`User ${userData.userId} joined notification room`);
        });
        
        // Leave notification room
        socket.on('leave_notifications', (userData) => {
            socket.leave(`notifications_${userData.userId}`);
            console.log(`User ${userData.userId} left notification room`);
        });
        
        // Handle connection request acknowledgment
        socket.on('connection_request_seen', (data) => {
            // Update notification as seen (you can implement this in database)
            console.log(`Connection request ${data.requestId} seen by user ${socket.userId}`);
        });
    });
};

// Send connection request
const sendConnectionRequest = asyncHandler(async (req, res) => {
    const { userId } = req.body; // User to send request to
    const fromUserId = req.user._id; // Current user sending request

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    if (userId === fromUserId.toString()) {
        throw new ApiError(400, "Cannot send connection request to yourself");
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
        throw new ApiError(404, "User not found");
    }

    // Check if connection request already exists
    const existingConnection = await Connection.findOne({
        $or: [
            { from: fromUserId, to: userId },
            { from: userId, to: fromUserId }
        ]
    });

    if (existingConnection) {
        if (existingConnection.status === 'pending') {
            throw new ApiError(400, "Connection request already sent");
        } else if (existingConnection.status === 'accepted') {
            throw new ApiError(400, "Already connected");
        } else if (existingConnection.status === 'blocked') {
            throw new ApiError(400, "Cannot send connection request");
        } else if (existingConnection.status === 'rejected') {
            // Allow sending request again after rejection
            existingConnection.status = 'pending';
            existingConnection.from = fromUserId;
            existingConnection.to = userId;
            existingConnection.requestedAt = new Date();
            existingConnection.respondedAt = null;
            
            await existingConnection.save();
            
            const populatedConnection = await Connection.findById(existingConnection._id)
                .populate('from', 'firstName lastName profileImage email role')
                .populate('to', 'firstName lastName profileImage email role');

            // Emit real-time notification
            if (io) {
                io.to(`notifications_${userId}`).emit('connection_request_received', {
                    type: 'connection_request',
                    connection: populatedConnection,
                    message: `${req.user.firstName} ${req.user.lastName} sent you a connection request`,
                    timestamp: new Date()
                });
            }

            // Create persistent notification
            await createNotification({
                recipient: userId,
                sender: fromUserId,
                type: 'connection_request',
                title: 'New Connection Request',
                message: `${req.user.firstName} ${req.user.lastName} sent you a connection request`,
                data: { connectionId: populatedConnection._id },
                actionUrl: `/connections/requests`
            });

            return res.status(200).json(
                new ApiResponse(200, { connection: populatedConnection }, "Connection request sent successfully")
            );
        }
    }

    // Create new connection request
    const newConnection = await Connection.create({
        from: fromUserId,
        to: userId,
        status: 'pending',
        requestedAt: new Date()
    });

    const populatedConnection = await Connection.findById(newConnection._id)
        .populate('from', 'firstName lastName profileImage email role')
        .populate('to', 'firstName lastName profileImage email role');

    // Emit real-time notification to target user
    if (io) {
        io.to(`notifications_${userId}`).emit('connection_request_received', {
            type: 'connection_request',
            connection: populatedConnection,
            message: `${req.user.firstName} ${req.user.lastName} sent you a connection request`,
            timestamp: new Date()
        });

        // Also emit to sender for confirmation
        io.to(`notifications_${fromUserId}`).emit('connection_request_sent', {
            type: 'connection_request_sent',
            connection: populatedConnection,
            message: `Connection request sent to ${targetUser.firstName} ${targetUser.lastName}`,
            timestamp: new Date()
        });
    }

    // Create persistent notification
    await createNotification({
        recipient: userId,
        sender: fromUserId,
        type: 'connection_request',
        title: 'New Connection Request',
        message: `${req.user.firstName} ${req.user.lastName} sent you a connection request`,
        data: { connectionId: populatedConnection._id },
        actionUrl: `/connections/requests`
    });

    return res.status(201).json(
        new ApiResponse(201, { connection: populatedConnection }, "Connection request sent successfully")
    );
});

// Accept connection request
const acceptConnectionRequest = asyncHandler(async (req, res) => {
    const { connectionId } = req.body;
    const currentUserId = req.user._id;

    if (!connectionId) {
        throw new ApiError(400, "Connection ID is required");
    }

    // Find the connection request
    const connection = await Connection.findOne({
        _id: connectionId,
        to: currentUserId,
        status: 'pending'
    });

    if (!connection) {
        throw new ApiError(404, "Connection request not found or already processed");
    }

    // Update connection status
    connection.status = 'accepted';
    connection.respondedAt = new Date();
    await connection.save();

    const populatedConnection = await Connection.findById(connection._id)
        .populate('from', 'firstName lastName profileImage email role')
        .populate('to', 'firstName lastName profileImage email role');

    // Emit real-time notifications
    if (io) {
        // Notify the requester
        io.to(`notifications_${connection.from}`).emit('connection_request_accepted', {
            type: 'connection_accepted',
            connection: populatedConnection,
            message: `${req.user.firstName} ${req.user.lastName} accepted your connection request`,
            timestamp: new Date()
        });

        // Notify the accepter (current user)
        io.to(`notifications_${currentUserId}`).emit('connection_accepted', {
            type: 'connection_accepted',
            connection: populatedConnection,
            message: `You are now connected with ${populatedConnection.from.firstName} ${populatedConnection.from.lastName}`,
            timestamp: new Date()
        });
    }

    // Create persistent notification for requester
    await createNotification({
        recipient: connection.from,
        sender: currentUserId,
        type: 'connection_accepted',
        title: 'Connection Request Accepted',
        message: `${req.user.firstName} ${req.user.lastName} accepted your connection request`,
        data: { connectionId: populatedConnection._id },
        actionUrl: `/connections`
    });

    return res.status(200).json(
        new ApiResponse(200, { connection: populatedConnection }, "Connection request accepted successfully")
    );
});

// Reject connection request
const rejectConnectionRequest = asyncHandler(async (req, res) => {
    const { connectionId } = req.body;
    const currentUserId = req.user._id;

    if (!connectionId) {
        throw new ApiError(400, "Connection ID is required");
    }

    // Find the connection request
    const connection = await Connection.findOne({
        _id: connectionId,
        to: currentUserId,
        status: 'pending'
    });

    if (!connection) {
        throw new ApiError(404, "Connection request not found or already processed");
    }

    // Update connection status
    connection.status = 'rejected';
    connection.respondedAt = new Date();
    await connection.save();

    const populatedConnection = await Connection.findById(connection._id)
        .populate('from', 'firstName lastName profileImage email role')
        .populate('to', 'firstName lastName profileImage email role');

    // Emit real-time notification to requester (optional - you might not want to notify rejections)
    if (io) {
        io.to(`notifications_${connection.from}`).emit('connection_request_rejected', {
            type: 'connection_rejected',
            connection: populatedConnection,
            message: `Your connection request was declined`,
            timestamp: new Date()
        });
    }

    return res.status(200).json(
        new ApiResponse(200, { connection: populatedConnection }, "Connection request rejected successfully")
    );
});

// Cancel sent connection request
const cancelConnectionRequest = asyncHandler(async (req, res) => {
    const { connectionId } = req.body;
    const currentUserId = req.user._id;

    if (!connectionId) {
        throw new ApiError(400, "Connection ID is required");
    }

    // Find the connection request sent by current user
    const connection = await Connection.findOne({
        _id: connectionId,
        from: currentUserId,
        status: 'pending'
    });

    if (!connection) {
        throw new ApiError(404, "Connection request not found or cannot be cancelled");
    }

    // Delete the connection request
    await Connection.findByIdAndDelete(connectionId);

    // Emit real-time notification to target user
    if (io) {
        io.to(`notifications_${connection.to}`).emit('connection_request_cancelled', {
            type: 'connection_request_cancelled',
            connectionId: connectionId,
            message: `Connection request was cancelled`,
            timestamp: new Date()
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Connection request cancelled successfully")
    );
});

// Remove/Disconnect from a user
const removeConnection = asyncHandler(async (req, res) => {
    const { userId } = req.body; // User to disconnect from
    const currentUserId = req.user._id;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    // Find the accepted connection
    const connection = await Connection.findOne({
        $or: [
            { from: currentUserId, to: userId },
            { from: userId, to: currentUserId }
        ],
        status: 'accepted'
    });

    if (!connection) {
        throw new ApiError(404, "Connection not found");
    }

    // Delete the connection
    await Connection.findByIdAndDelete(connection._id);

    // Emit real-time notification to the other user
    if (io) {
        io.to(`notifications_${userId}`).emit('connection_removed', {
            type: 'connection_removed',
            removedBy: {
                _id: currentUserId,
                firstName: req.user.firstName,
                lastName: req.user.lastName
            },
            message: `${req.user.firstName} ${req.user.lastName} removed you from their connections`,
            timestamp: new Date()
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Connection removed successfully")
    );
});

// Block a user
const blockUser = asyncHandler(async (req, res) => {
    const { userId } = req.body; // User to block
    const currentUserId = req.user._id;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    if (userId === currentUserId.toString()) {
        throw new ApiError(400, "Cannot block yourself");
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
        throw new ApiError(404, "User not found");
    }

    // Find existing connection or create new blocked connection
    let connection = await Connection.findOne({
        $or: [
            { from: currentUserId, to: userId },
            { from: userId, to: currentUserId }
        ]
    });

    if (connection) {
        connection.status = 'blocked';
        connection.from = currentUserId; // Set current user as the blocker
        connection.to = userId;
        connection.respondedAt = new Date();
        await connection.save();
    } else {
        connection = await Connection.create({
            from: currentUserId,
            to: userId,
            status: 'blocked',
            requestedAt: new Date(),
            respondedAt: new Date()
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "User blocked successfully")
    );
});

// Unblock a user
const unblockUser = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    // Find the blocked connection
    const connection = await Connection.findOne({
        from: currentUserId,
        to: userId,
        status: 'blocked'
    });

    if (!connection) {
        throw new ApiError(404, "User is not blocked");
    }

    // Delete the blocked connection
    await Connection.findByIdAndDelete(connection._id);

    return res.status(200).json(
        new ApiResponse(200, {}, "User unblocked successfully")
    );
});

// Get received connection requests (pending)
const getReceivedConnectionRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const currentUserId = req.user._id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await Connection.find({
        to: currentUserId,
        status: 'pending'
    })
    .populate('from', 'firstName lastName profileImage email role')
    .sort({ requestedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const totalRequests = await Connection.countDocuments({
        to: currentUserId,
        status: 'pending'
    });

    return res.status(200).json(
        new ApiResponse(200, {
            requests,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRequests / parseInt(limit)),
                totalRequests,
                hasNextPage: parseInt(page) < Math.ceil(totalRequests / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        }, "Connection requests retrieved successfully")
    );
});

// Get sent connection requests (pending)
const getSentConnectionRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const currentUserId = req.user._id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await Connection.find({
        from: currentUserId,
        status: 'pending'
    })
    .populate('to', 'firstName lastName profileImage email role')
    .sort({ requestedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const totalRequests = await Connection.countDocuments({
        from: currentUserId,
        status: 'pending'
    });

    return res.status(200).json(
        new ApiResponse(200, {
            requests,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRequests / parseInt(limit)),
                totalRequests,
                hasNextPage: parseInt(page) < Math.ceil(totalRequests / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        }, "Sent connection requests retrieved successfully")
    );
});

// Get user's connections (accepted)
const getUserConnections = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const currentUserId = req.user._id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build aggregation pipeline
    const pipeline = [
        {
            $match: {
                $or: [
                    { from: new mongoose.Types.ObjectId(currentUserId) },
                    { to: new mongoose.Types.ObjectId(currentUserId) }
                ],
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
                        if: { $eq: ['$from', new mongoose.Types.ObjectId(currentUserId)] },
                        then: { $arrayElemAt: ['$toUser', 0] },
                        else: { $arrayElemAt: ['$fromUser', 0] }
                    }
                }
            }
        }
    ];

    // Add search filter if provided
    if (search) {
        pipeline.push({
            $match: {
                $or: [
                    { 'connectedUser.firstName': { $regex: search, $options: 'i' } },
                    { 'connectedUser.lastName': { $regex: search, $options: 'i' } },
                    { 'connectedUser.email': { $regex: search, $options: 'i' } }
                ]
            }
        });
    }

    // Add projection
    pipeline.push({
        $project: {
            _id: 1,
            connectedUser: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                profileImage: 1,
                email: 1,
                role: 1,
                profileHeadline: 1
            },
            connectedAt: '$respondedAt',
            createdAt: 1
        }
    });

    // Add sorting, skip, and limit
    pipeline.push(
        { $sort: { connectedAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
    );

    const connections = await Connection.aggregate(pipeline);

    // Get total count
    const totalConnections = await Connection.countDocuments({
        $or: [
            { from: currentUserId },
            { to: currentUserId }
        ],
        status: 'accepted'
    });

    return res.status(200).json(
        new ApiResponse(200, {
            connections,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalConnections / parseInt(limit)),
                totalConnections,
                hasNextPage: parseInt(page) < Math.ceil(totalConnections / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        }, "Connections retrieved successfully")
    );
});

// Get connection status with another user
const getConnectionStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    if (userId === currentUserId.toString()) {
        return res.status(200).json(
            new ApiResponse(200, { status: 'self' }, "Connection status retrieved")
        );
    }

    const connection = await Connection.findOne({
        $or: [
            { from: currentUserId, to: userId },
            { from: userId, to: currentUserId }
        ]
    }).populate('from to', 'firstName lastName profileImage');

    if (!connection) {
        return res.status(200).json(
            new ApiResponse(200, { 
                status: 'not_connected',
                canSendRequest: true 
            }, "No connection found")
        );
    }

    let responseData = {
        status: connection.status,
        connection: connection,
        canSendRequest: false,
        canAccept: false,
        canReject: false,
        canCancel: false,
        canRemove: false,
        isRequestSent: false,
        isRequestReceived: false
    };

    switch (connection.status) {
        case 'pending':
            if (connection.from.toString() === currentUserId.toString()) {
                responseData.isRequestSent = true;
                responseData.canCancel = true;
            } else {
                responseData.isRequestReceived = true;
                responseData.canAccept = true;
                responseData.canReject = true;
            }
            break;
        case 'accepted':
            responseData.canRemove = true;
            break;
        case 'rejected':
            if (connection.from.toString() === currentUserId.toString()) {
                responseData.canSendRequest = true;
            }
            break;
        case 'blocked':
            if (connection.from.toString() === currentUserId.toString()) {
                responseData.status = 'blocked_by_you';
            } else {
                responseData.status = 'blocked_by_user';
            }
            break;
    }

    return res.status(200).json(
        new ApiResponse(200, responseData, "Connection status retrieved successfully")
    );
});

// Get connection statistics for current user
const getConnectionStats = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const stats = await Connection.aggregate([
        {
            $match: {
                $or: [
                    { from: new mongoose.Types.ObjectId(currentUserId) },
                    { to: new mongoose.Types.ObjectId(currentUserId) }
                ]
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // Calculate specific stats
    const totalConnections = stats.find(s => s._id === 'accepted')?.count || 0;
    const pendingReceived = await Connection.countDocuments({
        to: currentUserId,
        status: 'pending'
    });
    const pendingSent = await Connection.countDocuments({
        from: currentUserId,
        status: 'pending'
    });

    return res.status(200).json(
        new ApiResponse(200, {
            totalConnections,
            pendingReceived,
            pendingSent,
            detailed: stats
        }, "Connection statistics retrieved successfully")
    );
});

// Get mutual connections between current user and another user
const getMutualConnections = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    const currentUserId = req.user._id;

    if (!userId || userId === currentUserId.toString()) {
        throw new ApiError(400, "Valid user ID is required");
    }

    // Get current user's connections
    const currentUserConnections = await Connection.find({
        $or: [
            { from: currentUserId },
            { to: currentUserId }
        ],
        status: 'accepted'
    });

    // Get other user's connections
    const otherUserConnections = await Connection.find({
        $or: [
            { from: userId },
            { to: userId }
        ],
        status: 'accepted'
    });

    // Extract user IDs from connections
    const currentUserConnectionIds = currentUserConnections.map(conn => 
        conn.from.toString() === currentUserId.toString() ? conn.to.toString() : conn.from.toString()
    );

    const otherUserConnectionIds = otherUserConnections.map(conn => 
        conn.from.toString() === userId ? conn.to.toString() : conn.from.toString()
    );

    // Find mutual connection IDs
    const mutualConnectionIds = currentUserConnectionIds.filter(id => 
        otherUserConnectionIds.includes(id)
    ).slice(0, parseInt(limit));

    // Get mutual connection user details
    const mutualConnections = await User.find({
        _id: { $in: mutualConnectionIds }
    }).select('firstName lastName profileImage email role profileHeadline');

    return res.status(200).json(
        new ApiResponse(200, {
            mutualConnections,
            count: mutualConnections.length
        }, "Mutual connections retrieved successfully")
    );
});

export {
    sendConnectionRequest,
    acceptConnectionRequest,
    rejectConnectionRequest,
    cancelConnectionRequest,
    removeConnection,
    blockUser,
    unblockUser,
    getReceivedConnectionRequests,
    getSentConnectionRequests,
    getUserConnections,
    getConnectionStatus,
    getConnectionStats,
    getMutualConnections,
    initializeConnectionSocket
};
