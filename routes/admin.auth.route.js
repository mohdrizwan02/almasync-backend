import { Router } from "express";

import { adminAuthentication, adminRefreshTokenValidation } from "../middlewares/admin.auth.middlerware.js";
import {
  changePassword,
  loginAdmin,
  logoutAdmin,
  refreshAdminToken,
  registerAdmin,
} from "../controllers/admin.auth.controller.js";

const router = Router();

router.route("/signup").post(registerAdmin);

router.route("/login").post(loginAdmin);

router.route("/logout").post(adminAuthentication, logoutAdmin);

router.route("/refresh-token").post(adminRefreshTokenValidation, refreshAdminToken);

router.route("/change-password").post(changePassword);

export default router;
