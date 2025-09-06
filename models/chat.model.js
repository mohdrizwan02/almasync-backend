import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema({
    isGroupChat: {
        type: Boolean,
        default: false
    },
    chatName: {
        type: String,
        trim: true
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    }],
    admins: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users"
        }
    ],

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },

    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "messages"
    }



}, {
    timestamps: true
})



export const Chat = mongoose.model("chats", ChatSchema);