import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

// Socket.IO instance (will be initialized in app.js)
let io;

// Initialize Socket.IO
export const initializeSocket = (socketIO) => {
    io = socketIO;
    
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        
        // Join user to their own room for direct messaging
        socket.on('join', (userData) => {
            socket.join(userData.userId);
            socket.userId = userData.userId;
            console.log(`User ${userData.userId} joined their room`);
        });
        
        // Join user to their notification room for connection updates
        socket.on('join_notifications', (userData) => {
            socket.join(`notifications_${userData.userId}`);
            console.log(`User ${userData.userId} joined notification room`);
        });
        
        // Join a specific chat room
        socket.on('join_chat', (chatId) => {
            socket.join(chatId);
            console.log(`User ${socket.userId} joined chat ${chatId}`);
        });
        
        // Leave a specific chat room
        socket.on('leave_chat', (chatId) => {
            socket.leave(chatId);
            console.log(`User ${socket.userId} left chat ${chatId}`);
        });
        
        // Leave notification room
        socket.on('leave_notifications', (userData) => {
            socket.leave(`notifications_${userData.userId}`);
            console.log(`User ${userData.userId} left notification room`);
        });
        
        // Handle typing indicator
        socket.on('typing', (data) => {
            socket.to(data.chatId).emit('user_typing', {
                userId: socket.userId,
                chatId: data.chatId,
                isTyping: data.isTyping
            });
        });
        
        // Handle message status updates
        socket.on('message_delivered', (data) => {
            updateMessageStatus(data.messageId, 'delivered');
            socket.to(data.chatId).emit('message_status_updated', {
                messageId: data.messageId,
                status: 'delivered'
            });
        });
        
        socket.on('message_read', (data) => {
            updateMessageStatus(data.messageId, 'read');
            socket.to(data.chatId).emit('message_status_updated', {
                messageId: data.messageId,
                status: 'read'
            });
        });
        
        // Handle connection request acknowledgment
        socket.on('connection_request_seen', (data) => {
            console.log(`Connection request ${data.requestId} seen by user ${socket.userId}`);
        });
        
        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
};

// Helper function to update message status
const updateMessageStatus = async (messageId, status) => {
    try {
        await Message.findByIdAndUpdate(messageId, { status });
    } catch (error) {
        console.error('Error updating message status:', error);
    }
};

// Create or get existing one-on-one chat
const createOrGetChat = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    if (userId === currentUserId.toString()) {
        throw new ApiError(400, "Cannot create chat with yourself");
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
        throw new ApiError(404, "User not found");
    }

    // Find existing chat between these two users
    let chat = await Chat.findOne({
        isGroupChat: false,
        users: {
            $all: [currentUserId, userId],
            $size: 2
        }
    }).populate('users', 'firstName lastName profileImage email')
      .populate('lastMessage');

    if (chat) {
        return res.status(200).json(
            new ApiResponse(200, { chat }, "Chat retrieved successfully")
        );
    }

    // Create new chat if doesn't exist
    const newChat = await Chat.create({
        users: [currentUserId, userId],
        isGroupChat: false
    });

    const populatedChat = await Chat.findById(newChat._id)
        .populate('users', 'firstName lastName profileImage email')
        .populate('lastMessage');

    return res.status(201).json(
        new ApiResponse(201, { chat: populatedChat }, "Chat created successfully")
    );
});

// Create group chat
const createGroupChat = asyncHandler(async (req, res) => {
    const { users, chatName } = req.body;
    const currentUserId = req.user._id;

    if (!users || !Array.isArray(users) || users.length < 2) {
        throw new ApiError(400, "At least 2 users are required for group chat");
    }

    if (!chatName || chatName.trim() === "") {
        throw new ApiError(400, "Group chat name is required");
    }

    // Add current user to the group if not already included
    const allUsers = [...new Set([...users, currentUserId.toString()])];

    // Verify all users exist
    const existingUsers = await User.find({ _id: { $in: allUsers } });
    if (existingUsers.length !== allUsers.length) {
        throw new ApiError(400, "One or more users not found");
    }

    const groupChat = await Chat.create({
        chatName: chatName.trim(),
        users: allUsers,
        isGroupChat: true,
        createdBy: currentUserId,
        admins: [currentUserId]
    });

    const populatedGroupChat = await Chat.findById(groupChat._id)
        .populate('users', 'firstName lastName profileImage email')
        .populate('admins', 'firstName lastName profileImage email')
        .populate('createdBy', 'firstName lastName profileImage email')
        .populate('lastMessage');

    return res.status(201).json(
        new ApiResponse(201, { chat: populatedGroupChat }, "Group chat created successfully")
    );
});

// Get all chats for current user
const getUserChats = asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;

    const chats = await Chat.find({
        users: currentUserId
    })
    .populate('users', 'firstName lastName profileImage email')
    .populate('lastMessage')
    .sort({ updatedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, { chats }, "User chats retrieved successfully")
    );
});

// Send message
const sendMessage = asyncHandler(async (req, res) => {
    const { chatId, content, type = "text" } = req.body;
    const senderId = req.user._id;

    if (!chatId || !content) {
        throw new ApiError(400, "Chat ID and content are required");
    }

    // Verify chat exists and user is part of it
    const chat = await Chat.findOne({
        _id: chatId,
        users: senderId
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found or you're not a member");
    }

    // Create message
    const message = await Message.create({
        chat: chatId,
        sender: senderId,
        content,
        type,
        status: "sent"
    });

    // Update chat's last message
    await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
    });

    // Populate message details
    const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'firstName lastName profileImage email')
        .populate('chat');

    // Emit message to all users in the chat via Socket.IO
    if (io) {
        io.to(chatId).emit('new_message', populatedMessage);
        
        // Also emit to individual user rooms for offline users
        chat.users.forEach(userId => {
            if (userId.toString() !== senderId.toString()) {
                io.to(userId.toString()).emit('new_message', populatedMessage);
            }
        });
    }

    return res.status(201).json(
        new ApiResponse(201, { message: populatedMessage }, "Message sent successfully")
    );
});

// Get messages for a chat with pagination
const getChatMessages = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const currentUserId = req.user._id;

    // Verify user is part of the chat
    const chat = await Chat.findOne({
        _id: chatId,
        users: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found or you're not a member");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({ chat: chatId })
        .populate('sender', 'firstName lastName profileImage email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments({ chat: chatId });
    const totalPages = Math.ceil(totalMessages / parseInt(limit));

    return res.status(200).json(
        new ApiResponse(200, {
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalMessages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        }, "Messages retrieved successfully")
    );
});

// Delete message (only sender can delete)
const deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findOne({
        _id: messageId,
        sender: currentUserId
    });

    if (!message) {
        throw new ApiError(404, "Message not found or you can't delete this message");
    }

    await Message.findByIdAndDelete(messageId);

    // Emit message deletion via Socket.IO
    if (io) {
        io.to(message.chat.toString()).emit('message_deleted', {
            messageId,
            chatId: message.chat
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Message deleted successfully")
    );
});

// Add user to group chat (admin only)
const addUserToGroupChat = asyncHandler(async (req, res) => {
    const { chatId, userId } = req.body;
    const currentUserId = req.user._id;

    // Verify chat exists and current user is admin
    const chat = await Chat.findOne({
        _id: chatId,
        isGroupChat: true,
        admins: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    // Check if user exists
    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
        throw new ApiError(404, "User to add not found");
    }

    // Check if user is already in the chat
    if (chat.users.includes(userId)) {
        throw new ApiError(400, "User is already in the chat");
    }

    // Add user to chat
    const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { $push: { users: userId } },
        { new: true }
    ).populate('users', 'firstName lastName profileImage email')
     .populate('admins', 'firstName lastName profileImage email');

    // Emit user added event via Socket.IO
    if (io) {
        io.to(chatId).emit('user_added_to_chat', {
            chat: updatedChat,
            addedUser: userToAdd,
            addedBy: req.user
        });
        
        // Notify the added user
        io.to(userId).emit('added_to_chat', updatedChat);
    }

    return res.status(200).json(
        new ApiResponse(200, { chat: updatedChat }, "User added to group chat successfully")
    );
});

// Remove user from group chat (admin only)
const removeUserFromGroupChat = asyncHandler(async (req, res) => {
    const { chatId, userId } = req.body;
    const currentUserId = req.user._id;

    // Verify chat exists and current user is admin
    const chat = await Chat.findOne({
        _id: chatId,
        isGroupChat: true,
        admins: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    // Can't remove chat creator
    if (chat.createdBy.toString() === userId) {
        throw new ApiError(400, "Cannot remove chat creator");
    }

    // Check if user is in the chat
    if (!chat.users.includes(userId)) {
        throw new ApiError(400, "User is not in the chat");
    }

    // Remove user from chat and admins
    const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { 
            $pull: { 
                users: userId,
                admins: userId 
            }
        },
        { new: true }
    ).populate('users', 'firstName lastName profileImage email')
     .populate('admins', 'firstName lastName profileImage email');

    // Emit user removed event via Socket.IO
    if (io) {
        io.to(chatId).emit('user_removed_from_chat', {
            chat: updatedChat,
            removedUserId: userId,
            removedBy: req.user
        });
        
        // Notify the removed user
        io.to(userId).emit('removed_from_chat', { chatId });
    }

    return res.status(200).json(
        new ApiResponse(200, { chat: updatedChat }, "User removed from group chat successfully")
    );
});

// Leave group chat
const leaveGroupChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const currentUserId = req.user._id;

    const chat = await Chat.findOne({
        _id: chatId,
        isGroupChat: true,
        users: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Group chat not found or you're not a member");
    }

    // If user is the creator, they can't leave (they need to transfer ownership first)
    if (chat.createdBy.toString() === currentUserId.toString()) {
        throw new ApiError(400, "Chat creator cannot leave. Transfer ownership first or delete the chat.");
    }

    // Remove user from chat and admins
    const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { 
            $pull: { 
                users: currentUserId,
                admins: currentUserId 
            }
        },
        { new: true }
    ).populate('users', 'firstName lastName profileImage email')
     .populate('admins', 'firstName lastName profileImage email');

    // Emit user left event via Socket.IO
    if (io) {
        io.to(chatId).emit('user_left_chat', {
            chat: updatedChat,
            leftUserId: currentUserId,
            leftUser: req.user
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Left group chat successfully")
    );
});

// Update group chat details (admin only)
const updateGroupChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { chatName } = req.body;
    const currentUserId = req.user._id;

    if (!chatName || chatName.trim() === "") {
        throw new ApiError(400, "Chat name is required");
    }

    // Verify chat exists and current user is admin
    const chat = await Chat.findOne({
        _id: chatId,
        isGroupChat: true,
        admins: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Group chat not found or you're not an admin");
    }

    const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { chatName: chatName.trim() },
        { new: true }
    ).populate('users', 'firstName lastName profileImage email')
     .populate('admins', 'firstName lastName profileImage email');

    // Emit chat updated event via Socket.IO
    if (io) {
        io.to(chatId).emit('chat_updated', {
            chat: updatedChat,
            updatedBy: req.user
        });
    }

    return res.status(200).json(
        new ApiResponse(200, { chat: updatedChat }, "Group chat updated successfully")
    );
});

// Delete chat (creator only for group chats, any participant for one-on-one)
const deleteChat = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const currentUserId = req.user._id;

    const chat = await Chat.findOne({
        _id: chatId,
        users: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found or you're not a member");
    }

    // For group chats, only creator can delete
    if (chat.isGroupChat && chat.createdBy.toString() !== currentUserId.toString()) {
        throw new ApiError(403, "Only chat creator can delete group chat");
    }

    // Delete all messages in the chat
    await Message.deleteMany({ chat: chatId });

    // Delete the chat
    await Chat.findByIdAndDelete(chatId);

    // Emit chat deleted event via Socket.IO
    if (io) {
        io.to(chatId).emit('chat_deleted', {
            chatId,
            deletedBy: req.user
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Chat deleted successfully")
    );
});

// Search messages in a chat
const searchMessages = asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { query, page = 1, limit = 20 } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.trim() === "") {
        throw new ApiError(400, "Search query is required");
    }

    // Verify user is part of the chat
    const chat = await Chat.findOne({
        _id: chatId,
        users: currentUserId
    });

    if (!chat) {
        throw new ApiError(404, "Chat not found or you're not a member");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({
        chat: chatId,
        content: { $regex: query, $options: 'i' }
    })
    .populate('sender', 'firstName lastName profileImage email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const totalResults = await Message.countDocuments({
        chat: chatId,
        content: { $regex: query, $options: 'i' }
    });

    return res.status(200).json(
        new ApiResponse(200, {
            messages,
            totalResults,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalResults / parseInt(limit))
        }, "Message search completed successfully")
    );
});

export {
    createOrGetChat,
    createGroupChat,
    getUserChats,
    sendMessage,
    getChatMessages,
    deleteMessage,
    addUserToGroupChat,
    removeUserFromGroupChat,
    leaveGroupChat,
    updateGroupChat,
    deleteChat,
    searchMessages
};
