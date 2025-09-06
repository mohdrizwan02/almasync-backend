// Chat utility functions
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

/**
 * Check if user is member of a chat
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user is member
 */
export const isUserChatMember = async (chatId, userId) => {
    try {
        const chat = await Chat.findOne({
            _id: chatId,
            users: userId
        });
        return !!chat;
    } catch (error) {
        return false;
    }
};

/**
 * Check if user is admin of a group chat
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user is admin
 */
export const isUserChatAdmin = async (chatId, userId) => {
    try {
        const chat = await Chat.findOne({
            _id: chatId,
            isGroupChat: true,
            admins: userId
        });
        return !!chat;
    } catch (error) {
        return false;
    }
};

/**
 * Get unread message count for a user in a chat
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID
 * @param {Date} lastSeenAt - Last seen timestamp
 * @returns {Promise<number>} - Unread message count
 */
export const getUnreadMessageCount = async (chatId, userId, lastSeenAt) => {
    try {
        const count = await Message.countDocuments({
            chat: chatId,
            sender: { $ne: userId },
            createdAt: { $gt: lastSeenAt }
        });
        return count;
    } catch (error) {
        return 0;
    }
};

/**
 * Format chat data for response
 * @param {Object} chat - Chat object
 * @param {string} currentUserId - Current user ID
 * @returns {Object} - Formatted chat data
 */
export const formatChatResponse = (chat, currentUserId) => {
    const chatObj = chat.toObject ? chat.toObject() : chat;
    
    // For one-on-one chats, set chat name as other user's name
    if (!chatObj.isGroupChat && chatObj.users?.length === 2) {
        const otherUser = chatObj.users.find(user => 
            user._id.toString() !== currentUserId.toString()
        );
        if (otherUser) {
            chatObj.chatName = `${otherUser.firstName} ${otherUser.lastName}`;
        }
    }
    
    return chatObj;
};

/**
 * Validate message content
 * @param {string} content - Message content
 * @param {string} type - Message type
 * @returns {boolean} - True if valid
 */
export const validateMessageContent = (content, type = 'text') => {
    if (!content || typeof content !== 'string') {
        return false;
    }
    
    // Basic validation rules
    const maxLength = type === 'text' ? 5000 : 200; // URLs or file names can be shorter
    
    return content.trim().length > 0 && content.length <= maxLength;
};

/**
 * Generate chat room name for Socket.IO
 * @param {string} chatId - Chat ID
 * @returns {string} - Room name
 */
export const getChatRoomName = (chatId) => {
    return `chat_${chatId}`;
};

/**
 * Generate user room name for Socket.IO
 * @param {string} userId - User ID
 * @returns {string} - Room name
 */
export const getUserRoomName = (userId) => {
    return `user_${userId}`;
};

/**
 * Sanitize message content to prevent XSS
 * @param {string} content - Raw content
 * @returns {string} - Sanitized content
 */
export const sanitizeMessageContent = (content) => {
    if (typeof content !== 'string') return '';
    
    // Basic HTML escaping
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .trim();
};

/**
 * Check rate limit for messaging
 * @param {string} userId - User ID
 * @param {number} maxMessages - Max messages per minute
 * @returns {Promise<boolean>} - True if within limit
 */
export const checkMessageRateLimit = async (userId, maxMessages = 30) => {
    try {
        const oneMinuteAgo = new Date(Date.now() - 60000);
        const recentMessages = await Message.countDocuments({
            sender: userId,
            createdAt: { $gte: oneMinuteAgo }
        });
        
        return recentMessages < maxMessages;
    } catch (error) {
        return true; // Allow on error
    }
};

/**
 * Get online users in a chat (would need Redis or similar for production)
 * @param {string} chatId - Chat ID
 * @returns {Array} - Array of online user IDs
 */
export const getOnlineUsersInChat = (chatId) => {
    // This is a placeholder - in production, you'd store active users in Redis
    // and track their online status
    return [];
};

/**
 * Format user for chat response
 * @param {Object} user - User object
 * @returns {Object} - Formatted user data
 */
export const formatUserForChat = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    
    return {
        _id: userObj._id,
        firstName: userObj.firstName,
        lastName: userObj.lastName,
        email: userObj.email,
        profileImage: userObj.profileImage,
        isActive: userObj.isActive || false
    };
};

/**
 * Build chat aggregation pipeline for user chats
 * @param {string} userId - User ID
 * @returns {Array} - Aggregation pipeline
 */
export const buildUserChatsPipeline = (userId) => {
    return [
        {
            $match: {
                users: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "users",
                foreignField: "_id",
                as: "users"
            }
        },
        {
            $lookup: {
                from: "messages",
                localField: "lastMessage",
                foreignField: "_id",
                as: "lastMessage"
            }
        },
        {
            $addFields: {
                lastMessage: { $arrayElemAt: ["$lastMessage", 0] }
            }
        },
        {
            $project: {
                chatName: 1,
                isGroupChat: 1,
                users: {
                    _id: 1,
                    firstName: 1,
                    lastName: 1,
                    profileImage: 1,
                    email: 1
                },
                lastMessage: 1,
                createdAt: 1,
                updatedAt: 1
            }
        },
        {
            $sort: { updatedAt: -1 }
        }
    ];
};
