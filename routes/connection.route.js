import { Router } from "express";
import {
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
    getMutualConnections
} from "../controllers/connection.controller.js";
import { userAuthentication } from "../middlewares/auth.middleware.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(userAuthentication);

// Connection request management routes
router.route("/send-request").post(sendConnectionRequest);
router.route("/accept-request").post(acceptConnectionRequest);
router.route("/reject-request").post(rejectConnectionRequest);
router.route("/cancel-request").post(cancelConnectionRequest);

// Connection management routes
router.route("/remove-connection").post(removeConnection);
router.route("/block-user").post(blockUser);
router.route("/unblock-user").post(unblockUser);

// Get connection requests and connections
router.route("/received-requests").get(getReceivedConnectionRequests);
router.route("/sent-requests").get(getSentConnectionRequests);
router.route("/my-connections").get(getUserConnections);

// Connection status and statistics
router.route("/status/:userId").get(getConnectionStatus);
router.route("/stats").get(getConnectionStats);
router.route("/mutual/:userId").get(getMutualConnections);

export default router;
