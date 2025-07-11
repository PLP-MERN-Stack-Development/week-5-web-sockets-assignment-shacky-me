// // server.js - Main server file for Socket.io chat application

// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const path = require("path");

// // Load environment variables
// dotenv.config();

// // Initialize Express app
// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: process.env.CLIENT_URL || "http://localhost:5174",
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });

// // io.on("connection", (socket) => {
// //   console.log(`Socket connected: ${socket.id}`);
// //   socket.on("current-ev", (name, age, arr) => {
// //     console.log(`Name: ${name}, Age: ${age}, Array: ${arr}`);
// //   });
// // });
// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.static(path.join(__dirname, "public")));

// // Store connected users and messages
// const users = {};
// const messages = [];
// const typingUsers = {};

// // Socket.io connection handler
// io.on("connection", (socket) => {
//   console.log(`User connected: ${socket.id}`);

//   // Handle user joining
//   socket.on("user_join", (username) => {
//     users[socket.id] = { username, id: socket.id };
//     io.emit("user_list", Object.values(users));
//     io.emit("user_joined", { username, id: socket.id });
//     console.log(`${username} joined the chat`);
//   });

//   // Handle chat messages
//   socket.on("send_message", (messageData) => {
//     const message = {
//       ...messageData,
//       id: Date.now(),
//       sender: users[socket.id]?.username || "Anonymous",
//       senderId: socket.id,
//       timestamp: new Date().toISOString(),
//     };

//     messages.push(message);

//     // Limit stored messages to prevent memory issues
//     if (messages.length > 100) {
//       messages.shift();
//     }

//     io.emit("receive_message", message);
//   });

//   // Handle typing indicator
//   socket.on("typing", (isTyping) => {
//     if (users[socket.id]) {
//       const username = users[socket.id].username;

//       if (isTyping) {
//         typingUsers[socket.id] = username;
//       } else {
//         delete typingUsers[socket.id];
//       }

//       io.emit("typing_users", Object.values(typingUsers));
//     }
//   });

//   // Handle private messages
//   socket.on("private_message", ({ to, message }) => {
//     const messageData = {
//       id: Date.now(),
//       sender: users[socket.id]?.username || "Anonymous",
//       senderId: socket.id,
//       message,
//       timestamp: new Date().toISOString(),
//       isPrivate: true,
//     };

//     socket.to(to).emit("private_message", messageData);
//     socket.emit("private_message", messageData);
//   });

//   // Handle disconnection
//   socket.on("disconnect", () => {
//     if (users[socket.id]) {
//       const { username } = users[socket.id];
//       io.emit("user_left", { username, id: socket.id });
//       console.log(`${username} left the chat`);
//     }

//     delete users[socket.id];
//     delete typingUsers[socket.id];

//     io.emit("user_list", Object.values(users));
//     io.emit("typing_users", Object.values(typingUsers));
//   });
// });

// // API routes
// app.get("/api/messages", (req, res) => {
//   res.json(messages);
// });

// app.get("/api/users", (req, res) => {
//   res.json(Object.values(users));
// });

// // Root route
// app.get("/", (req, res) => {
//   res.send("Socket.io Chat Server is running");
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// module.exports = { app, server, io };

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

app.use(cors());

let users = {}; // socket.id => username
let userSockets = {}; // username => socket.id
let rooms = {}; // room => [usernames]
let chatHistory = {}; // room/private => messages array

io.on('connection', (socket) => {
  let username = '';

  socket.on('set_username', (uname) => {
    username = uname;
    users[socket.id] = username;
    userSockets[username] = socket.id;
    io.emit('user_list', Object.values(users));
    socket.broadcast.emit('notification', `${username} joined the chat.`);
    io.emit('user_status', { username, status: 'online' });
  });

  socket.on('send_message', (data) => {
    const payload = {
      ...data,
      timestamp: new Date().toLocaleTimeString(),
      id: uuidv4()
    };
    const target = data.private ? `${data.sender}-${data.receiver}` : data.room || 'global';
    if (!chatHistory[target]) chatHistory[target] = [];
    chatHistory[target].push(payload);

    if (data.private) {
      const toSocketId = userSockets[data.receiver];
      socket.to(toSocketId).emit('receive_message', payload);
      socket.emit('receive_message', payload);
      socket.to(toSocketId).emit('new_message_notification', { from: data.sender });
    } else if (data.room) {
      io.to(data.room).emit('receive_message', payload);
      socket.to(data.room).emit('new_message_notification', { from: data.sender });
    } else {
      io.emit('receive_message', payload);
    }
    socket.emit('delivery_ack', payload.id);
  });

  socket.on('get_history', ({ target, offset }) => {
    const history = chatHistory[target] || [];
    const slice = history.slice(Math.max(history.length - offset - 20, 0), history.length - offset);
    socket.emit('chat_history', slice);
  });

  socket.on('typing', (data) => {
    if (data.room) {
      socket.to(data.room).emit('typing', data.message);
    } else if (data.receiver) {
      const toSocketId = userSockets[data.receiver];
      socket.to(toSocketId).emit('typing', data.message);
    } else {
      socket.broadcast.emit('typing', data.message);
    }
  });

  socket.on('join_room', (room) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(users[socket.id]);
    io.to(room).emit('notification', `${users[socket.id]} joined room ${room}`);
  });

  socket.on('send_file', (data) => {
    const payload = { ...data, timestamp: new Date().toLocaleTimeString() };
    if (data.room) {
      io.to(data.room).emit('receive_file', payload);
    } else if (data.receiver) {
      const toSocketId = userSockets[data.receiver];
      socket.to(toSocketId).emit('receive_file', payload);
    }
  });

  socket.on('send_reaction', (data) => {
    if (data.room) {
      io.to(data.room).emit('receive_reaction', data);
    } else if (data.receiver) {
      const toSocketId = userSockets[data.receiver];
      socket.to(toSocketId).emit('receive_reaction', data);
    }
  });

  socket.on('disconnect', () => {
    const name = users[socket.id];
    delete users[socket.id];
    delete userSockets[name];
    io.emit('user_list', Object.values(users));
    io.emit('notification', `${name} left the chat.`);
    io.emit('user_status', { username: name, status: 'offline' });
  });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));