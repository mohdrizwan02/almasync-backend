import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";

// Create a notification model schema
const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true
    },
    type: {
        type: String,
        enum: [
            'connection_request',
            'connection_accepted',
            'connection_rejected',
            'message',
            'profile_update',
            'job_posting',
            'event_invitation',
            'general'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed, // Additional data specific to notification type
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    actionUrl: {
        type: String // URL to navigate when notification is clicked
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
}, {
    timestamps: true
});

// Add index for efficient queries
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Notification = mongoose.model('notifications', NotificationSchema);

// Socket.IO instance
let io;

// Initialize Socket.IO for notifications
 const initializeNotificationSocket = (socketIO) => {
    io = socketIO;
};

// Create notification helper function
const createNotification = async (notificationData) => {
    try {
        const notification = await Notification.create(notificationData);
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'firstName lastName profileImage')
            .populate('recipient', 'firstName lastName');

        // Send real-time notification via Socket.IO
        if (io) {
            io.to(`notifications_${notificationData.recipient}`).emit('new_notification', {
                notification: populatedNotification,
                timestamp: new Date()
            });
        }

        return populatedNotification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};

// Get user notifications with pagination
const getUserNotifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const userId = req.user._id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = { recipient: userId };
    if (type) filter.type = type;
    if (isRead !== undefined) filter.isRead = isRead === 'true';

    const notifications = await Notification.find(filter)
        .populate('sender', 'firstName lastName profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const totalNotifications = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false
    });

    return res.status(200).json(
        new ApiResponse(200, {
            notifications,
            unreadCount,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalNotifications / parseInt(limit)),
                totalNotifications,
                hasNextPage: parseInt(page) < Math.ceil(totalNotifications / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        }, "Notifications retrieved successfully")
    );
});

// Mark notification as read
const markNotificationAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { 
            isRead: true, 
            readAt: new Date() 
        },
        { new: true }
    ).populate('sender', 'firstName lastName profileImage');

    if (!notification) {
        throw new ApiError(404, "Notification not found");
    }

    return res.status(200).json(
        new ApiResponse(200, { notification }, "Notification marked as read")
    );
});

// Mark all notifications as read
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const result = await Notification.updateMany(
        { recipient: userId, isRead: false },
        { 
            isRead: true, 
            readAt: new Date() 
        }
    );

    return res.status(200).json(
        new ApiResponse(200, { 
            modifiedCount: result.modifiedCount 
        }, "All notifications marked as read")
    );
});

// Delete notification
const deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId
    });

    if (!notification) {
        throw new ApiError(404, "Notification not found");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Notification deleted successfully")
    );
});

// Clear old notifications (older than 30 days)
const clearOldNotifications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await Notification.deleteMany({
        recipient: userId,
        createdAt: { $lt: thirtyDaysAgo }
    });

    return res.status(200).json(
        new ApiResponse(200, { 
            deletedCount: result.deletedCount 
        }, "Old notifications cleared successfully")
    );
});

// Get notification statistics
const getNotificationStats = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const stats = await Notification.aggregate([
        {
            $match: { recipient: new mongoose.Types.ObjectId(userId) }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                unread: {
                    $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] }
                },
                byType: {
                    $push: {
                        type: "$type",
                        isRead: "$isRead"
                    }
                }
            }
        }
    ]);

    // Process by type
    const typeStats = {};
    if (stats.length > 0) {
        stats[0].byType.forEach(item => {
            if (!typeStats[item.type]) {
                typeStats[item.type] = { total: 0, unread: 0 };
            }
            typeStats[item.type].total++;
            if (!item.isRead) {
                typeStats[item.type].unread++;
            }
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {
            total: stats.length > 0 ? stats[0].total : 0,
            unread: stats.length > 0 ? stats[0].unread : 0,
            byType: typeStats
        }, "Notification statistics retrieved successfully")
    );
});

// Update notification preferences (placeholder for future implementation)
const updateNotificationPreferences = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { preferences } = req.body;

    // This would typically update user preferences in the User model
    // For now, we'll just return success
    return res.status(200).json(
        new ApiResponse(200, { preferences }, "Notification preferences updated successfully")
    );
});

export {
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearOldNotifications,
    getNotificationStats,
    updateNotificationPreferences,
    createNotification,
    Notification
};
