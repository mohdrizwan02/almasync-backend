import { Router } from "express";
import {
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearOldNotifications,
    getNotificationStats,
    updateNotificationPreferences
} from "../controllers/notification.controller.js";
import { userAuthentication } from "../middlewares/auth.middleware.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(userAuthentication);






// Notification management routes
router.route("/").get(getUserNotifications);
router.route("/stats").get(getNotificationStats);
router.route("/mark-all-read").post(markAllNotificationsAsRead);
router.route("/clear-old").delete(clearOldNotifications);
router.route("/preferences").patch(updateNotificationPreferences);




// Individual notification routes
router.route("/:notificationId/read").patch(markNotificationAsRead);
router.route("/:notificationId").delete(deleteNotification);

export default router;
