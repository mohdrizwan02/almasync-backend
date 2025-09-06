import dotenv from "dotenv";

import dbConnect from "./db/index.js";

import { app } from "./app.js";

import { Server } from "socket.io";

import http from 'http';

import { initializeSocket } from "./controllers/chat.controller.js";

dotenv.config();

const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
})

app.get("/", (req, res) => {
  res.send("Realtime App Backend is running...");
});

// Initialize Socket.IO with chat controller
initializeSocket(io);




dbConnect().then(() => {
  server.listen(process.env.PORT, () => {
    console.log(`Server is running and listening on ${process.env.PORT}`);
  })
})
