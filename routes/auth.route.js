import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { userAuthentication } from "../middlewares/auth.middleware.js";
import { userRefreshTokenValidation } from "../middlewares/refresh.middleware.js";

import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  verifyUserAccountForPasswordChange,
  sendOtpForPasswordChange,
  verifyOtpForPasswordChange,
  changePasswordUsingOtp,
  changePasswordUsingOldPassword,
} from "../controllers/auth.controller.js";

const router = Router();

router.route("/signup").post(registerUser);

router.route("/login").post(loginUser);

router.route("/logout").post(userAuthentication, logoutUser);

router
  .route("/refresh-token")
  .post(userRefreshTokenValidation, refreshAccessToken);

router.route("/forgot-password/:email").get(verifyUserAccountForPasswordChange);

router
  .route("/forgot-password/:email/change-password-using-old-password")
  .post(changePasswordUsingOldPassword);

router.route("/forgot-password/:email/send-otp").get(sendOtpForPasswordChange);

router
  .route("/forgot-password/:email/verify-otp")
  .post(verifyOtpForPasswordChange);

router
  .route("/forgot-password/:email/otp-change-password/:token")
  .post(changePasswordUsingOtp);

export default router;
