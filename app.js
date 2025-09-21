import express from "express";
import cors from "cors";

import cookieParser from "cookie-parser";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

app.use(express.static("public"));

app.use(cookieParser());

import authRouter from "./routes/auth.route.js";

app.use("/api/v1/auth", authRouter);

import adminAuthRouter from "./routes/admin.auth.route.js";

app.use("/api/v1/admin/auth", adminAuthRouter);

import adminRouter from "./routes/admin.route.js";

app.use("/api/v1/admin", adminRouter);

import userRouter from "./routes/user.route.js"

app.use("/api/v1/users" , userRouter)

import chatRouter from "./routes/chat.route.js"

app.use("/api/v1/chat" , chatRouter)

import connectionRouter from "./routes/connection.route.js"

app.use("/api/v1/connections" , connectionRouter)

import notificationRouter from "./routes/notification.route.js"

app.use("/api/v1/notifications" , notificationRouter)

import opportunityRouter from "./routes/opportunity.route.js"

app.use("/api/v1/opportunities" , opportunityRouter)

export { app };
