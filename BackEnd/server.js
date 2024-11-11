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

// Thêm function để cleanup room và messages
const cleanupRoomAndMessages = async (roomId) => {
  try {
    console.log(`Cleaning up room ${roomId} and related messages`);
    
    // Xóa messages của room
    const messagesRef = db.collection('messages');
    const messageSnapshot = await messagesRef
      .where('roomId', '==', roomId)
      .get();
    
    // Batch delete messages
    const batch = db.batch();
    messageSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Xóa room
    const roomRef = db.collection('rooms').doc(roomId);
    batch.delete(roomRef);
    
    // Thực hiện batch
    await batch.commit();
    console.log(`Cleaned up room ${roomId} and ${messageSnapshot.size} messages`);
  } catch (error) {
    console.error('Error cleaning up room and messages:', error);
  }
};

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
    console.log("send_message", data);
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

      // Gửi tin nhắn đến room
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
  socket.on('disconnect', async () => {
    try {
      console.log('User disconnected:', socket.id);
      
      // Tìm room active của user
      const roomsRef = db.collection('rooms');
      const snapshot = await roomsRef
        .where('status', '==', 'active')
        .where('users', 'array-contains', socket.id)
        .get();

      if (!snapshot.empty) {
        const roomDoc = snapshot.docs[0];
        const roomId = roomDoc.id;
        
        // Thông báo cho user còn lại trong room
        socket.to(roomId).emit('user_disconnected', {
          message: 'Người chat đã ngắt kết nối'
        });
        
        // Cleanup room và messages
        await cleanupRoomAndMessages(roomId);
      }
      
      // Xóa khỏi waiting room nếu đang đợi
      if (waitingRoom?.user1.socket.id === socket.id) {
        if (waitingRoom.roomId) {
          await cleanupRoomAndMessages(waitingRoom.roomId);
        }
        waitingRoom = null;
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  // Thêm xử lý khi user chủ động rời phòng
  socket.on('leave_room', async (data) => {
    try {
      const { roomId } = data;
      
      // Thông báo cho user còn lại
      socket.to(roomId).emit('user_left', {
        message: 'Người chat đã rời phòng'
      });
      
      // Cleanup room và messages
      await cleanupRoomAndMessages(roomId);
      
      // Rời khỏi room
      socket.leave(roomId);
    } catch (error) {
      console.error('Error handling leave room:', error);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 