import { Router } from "express";
import {
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
} from "../controllers/chat.controller.js";
import { userAuthentication } from "../middlewares/auth.middleware.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(userAuthentication);

// Chat management routes
router.route("/create-or-get").post(createOrGetChat);
router.route("/create-group").post(createGroupChat);
router.route("/user-chats").get(getUserChats);
router.route("/:chatId").delete(deleteChat);
router.route("/group/:chatId").patch(updateGroupChat);

// Message routes
router.route("/message").post(sendMessage);
router.route("/:chatId/messages").get(getChatMessages);
router.route("/message/:messageId").delete(deleteMessage);
router.route("/:chatId/search").get(searchMessages);

// Group chat management routes
router.route("/group/add-user").post(addUserToGroupChat);
router.route("/group/remove-user").post(removeUserFromGroupChat);
router.route("/group/:chatId/leave").post(leaveGroupChat);

export default router;
