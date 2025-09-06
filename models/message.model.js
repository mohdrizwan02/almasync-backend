import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "chats",
        required: true
    },

    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },

    type: {
        type: String,
        enum: ["text", "image", "video", "file"],
        default: "text"
    },

    content: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent"
    }







}, {
    timestamps: true
})

export const Message = mongoose.model("messages", MessageSchema);