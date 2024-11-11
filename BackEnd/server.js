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

// Thêm biến để quản lý waiting room và socket rooms
let waitingRoom = null;
const userRooms = new Map();

// Cấu hình Socket.IO đơn giản nhất
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ['websocket', 'polling'], // Thêm option này
    credentials: true
  }
});

// Thêm helper function để tạo roomId từ 2 userID
const createRoomId = (userId1, userId2) => {
  // Sắp xếp userID để đảm bảo thứ tự nhất quán
  const sortedIds = [userId1, userId2].sort();
  return `${sortedIds[0]}-${sortedIds[1]}`;
};

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

  socket.on('check_existing_room', async (userData) => {
    try {
      console.log('Checking existing room for user:', userData.userId);
      const roomsRef = db.collection('rooms');
      const snapshot = await roomsRef
        .where('users', 'array-contains', userData.userId)
        .where('active', '==', true)
        .get();
      
      if (!snapshot.empty) {
        // Lấy room đầu tiên tìm thấy
        const roomDoc = snapshot.docs[0];
        const roomData = roomDoc.data();
        const roomId = roomDoc.id;
        
        console.log('Found room:', roomId, 'with users:', roomData.users);

        // Kiểm tra xem room có đủ 2 người không
        if (roomData.users.length === 2) {
          // Join socket vào room
          socket.join(roomId);
          userRooms.set(socket.id, roomId);
          
          // Thông báo cho client
          socket.emit('existing_room_found', {
            roomId,
            users: roomData.users,
            partnerLeft: false
          });

          console.log('User', userData.userId, 'rejoined room:', roomId);
          
          // Thông báo cho user còn lại trong room
          socket.to(roomId).emit('partner_rejoined', {
            userId: userData.userId,
            username: userData.username
          });
        } else {
          console.log('Room found but missing partner');
          socket.emit('existing_room_found', {
            roomId,
            partnerLeft: true
          });
        }
      } else {
        console.log('No existing room found for user:', userData.userId);
        socket.emit('no_room_found');
      }
    } catch (error) {
      console.error('Error checking existing room:', error);
      socket.emit('error', { message: 'Error checking existing room' });
    }
  });

  // Xử lý sự kiện Start Chat
  socket.on('start_chat', async (userData) => {
    console.log('User requesting chat:', userData);

    if (!waitingRoom) {
      waitingRoom = {
        user1: {
          socket: socket,
          userData: userData
        }
      };
      socket.emit('waiting_match', { message: 'Đang chờ người khác...' });
    } else {
      const user1 = waitingRoom.user1;
      const roomId = createRoomId(user1.userData.userId, userData.userId);
      
      user1.socket.join(roomId);
      socket.join(roomId);
      
      userRooms.set(user1.socket.id, roomId);
      userRooms.set(socket.id, roomId);
      
      io.to(roomId).emit('chat_matched', {
        roomId: roomId,
        message: 'Đã tìm thấy người chat!',
      });

      waitingRoom = null;

      await db.collection('rooms').doc(roomId).set({
        users: [user1.userData.userId, userData.userId],
        createdAt: new Date().toISOString(),
        active: true
      });
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

  // Thêm xử lý khi user chủ động rời phòng
  socket.on('leave_room', async (data) => {
    try {
      const { roomId, userId } = data;
      
      const roomRef = db.collection('rooms').doc(roomId);
      const roomDoc = await roomRef.get();
      
      if (roomDoc.exists) {
        const roomData = roomDoc.data();
        // Remove user khỏi mảng users
        const updatedUsers = roomData.users.filter(id => id !== userId);
        
        if (updatedUsers.length === 0) {
          // Nếu không còn user nào, deactivate room
          await roomRef.update({
            active: false,
            deactivatedAt: new Date().toISOString()
          });
        } else {
          // Update mảng users mới
          await roomRef.update({
            users: updatedUsers,
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      socket.to(roomId).emit('user_left', {
        message: 'Người chat đã rời phòng'
      });
      
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