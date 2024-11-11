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

// Thêm biến để quản lý waiting room
let waitingRoom = null;

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

  // Xử lý sự kiện Start Chat
  socket.on('start_chat', async (userData) => {
    console.log('User requesting chat:', userData);

    if (!waitingRoom) {
      // Nếu chưa có ai đang đợi, tạo waiting room mới
      waitingRoom = {
        roomId: `room_${Date.now()}`,
        user1: {
          socket: socket,
          userData: userData
        }
      };
      
      // Thông báo cho user đang đợi
      socket.emit('waiting_match', { message: 'Đang chờ người khác...' });
      
    } else {
      // Nếu có người đang đợi, ghép cặp họ lại
      const roomId = waitingRoom.roomId;
      const user1 = waitingRoom.user1;
      
      // Join cả 2 socket vào cùng room
      user1.socket.join(roomId);
      socket.join(roomId);
      
      // Thông báo cho cả 2 user về việc match thành công
      io.to(roomId).emit('chat_matched', {
        roomId: roomId,
        message: 'Đã tìm thấy người chat!',
      });

      // Reset waiting room
      waitingRoom = null;
    }
  });

  // Xử lý tin nhắn
  socket.on('send_message', async (data) => {
    try {
      const messageData = {
        userId: data.userId,
        message: data.message,
        timestamp: new Date().toISOString(),
        username: data.username,
        roomId: data.roomId
      };

      // Lưu tin nhắn vào database
      await db.collection('messages').add(messageData);

      // Gửi tin nhắn đến tất cả người dùng trong room, trừ người gửi
      socket.to(data.roomId).emit('receive_message', {
        text: data.message,
        timestamp: messageData.timestamp,
        sender: data.userId,
        username: data.username
      });

    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  // Xử lý disconnect
  socket.on('disconnect', () => {
    // Nếu user đang trong waiting room disconnect
    if (waitingRoom && waitingRoom.user1.socket.id === socket.id) {
      waitingRoom = null;
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 