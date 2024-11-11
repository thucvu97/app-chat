import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './firebaseInit.js';
dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors());



// Cấu hình Socket.IO đơn giản nhất
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ['websocket', 'polling'], // Thêm option này
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Thêm event xử lý login
  socket.on('user_login', async (userData) => {
    try {
      // Lưu thông tin user vào Firestore
      await db.collection('users').doc(userData.userId).set({
        userId: userData.userId,
        username: userData.username,
        lastLogin: new Date().toISOString() 
      }, { merge: true });

      console.log('User logged in:', userData.username);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  });

  // Cập nhật event send_message để lưu tin nhắn
  socket.on('send_message', async (data) => {
    try {
      // Lưu tin nhắn vào Firestore
      await db.collection('messages').add({
        userId: data.userId,
        message: data.message,
        timestamp: new Date().toISOString() 

      });

      // Gửi tin nhắn đến client
      socket.emit('receive_message', {
        text: data.message,
        timestamp: new Date().toISOString()
      });

      console.log('Message saved and sent:', data);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 