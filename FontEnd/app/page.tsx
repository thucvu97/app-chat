'use client'

import { useEffect, useState } from 'react'
import { Settings, MessageCircle, HelpCircle, Edit, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
Sheet,
SheetContent,
SheetHeader,
SheetTitle,
SheetTrigger,
} from '@/components/ui/sheet'
import { socket } from "@/lib/socket";
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { useToast } from "@/hooks/use-toast"

// Initialize socket connection


interface Message {
text: string
sent: boolean
timestamp: Date
sender?: string
}


export default function Component() {
const router = useRouter()
const [messages, setMessages] = useState<Message[]>([])
const [inputMessage, setInputMessage] = useState('')
const [isConnected, setIsConnected] = useState(false)
const [isLoading, setIsLoading] = useState(true)
const [username, setUsername] = useState<any>({
  name :'Anonymous',
  userId :''
})
const [isMatching, setIsMatching] = useState(false)
const [isMatched, setIsMatched] = useState(false)
const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
const { toast } = useToast()
const [isLoadingMessages, setIsLoadingMessages] = useState(false);

useEffect(() => {
  // Khởi tạo socket connection ngay khi component mount
  if (!socket.connected) {
    socket.connect();
  }

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    setIsConnected(true);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    setIsConnected(false);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    toast({
      title: "Lỗi kết nối",
      description: "Không thể kết nối đến server. Vui lòng thử lại sau.",
      variant: "destructive",
    });
  });

  const unsubscribe = auth.onAuthStateChanged((user: any) => {
    console.log("current-user", user);
    if (!user) {
      router.push('/login')
      return
    }
    
    setIsLoading(false)
    setUsername({
      name: user.displayName || 'Anonymous',
      userId: user.uid
    })

    // Chỉ emit user_login khi socket đã connected
    if (socket.connected) {
      socket.emit('user_login', {
        userId: user.uid,
        username: user.displayName || 'Anonymous'
      })
    }
  })

  return () => {
    unsubscribe()
    socket.off("connect")
    socket.off("disconnect")
    socket.off("connect_error")
    socket.disconnect()
  }
}, [router, toast])

// Thêm một useEffect riêng để handle user_login khi socket vừa connected
useEffect(() => {
  if (isConnected && username.userId) {
    socket.emit('user_login', {
      userId: username.userId,
      username: username.name
    })
  }
}, [isConnected, username])

useEffect(() => {
  const loadMessages = async () => {
    try {
      if (!currentRoomId) return;
      
      setIsLoadingMessages(true);
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('roomId', '==', currentRoomId),
        orderBy('timestamp', 'asc')
      );
      
      const snapshot = await getDocs(q);

      const loadedMessages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          text: data.message,
          sent: data.userId === username.userId,
          timestamp: new Date(data.timestamp),
          sender: data.userId,
          status: data.status,
          messageId: doc.id
        };
      });

      setMessages(loadedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải tin nhắn. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMessages(false);
    }
  };

  if (username.userId && currentRoomId) {
    loadMessages();
  }
}, [username.userId, currentRoomId]);

useEffect(() => {
  socket.on('waiting_match', (data) => {
    console.log("Received waiting_match:", data);
    setIsMatching(true);
  });

  socket.on('chat_matched', (data) => {
    console.log("Received chat_matched:", data);
    setIsMatching(false);
    setIsMatched(true);
    setCurrentRoomId(data.roomId);
    setMessages([]);
  });

  return () => {
    socket.off('waiting_match');
    socket.off('chat_matched');
  };
}, []);

useEffect(() => {
  // Xử lý khi người chat còn lại disconnect
  socket.on('user_disconnected', (data) => {
    console.log('Chat partner disconnected:', data);
    // Reset states
    setIsMatched(false);
    setCurrentRoomId(null);
    setMessages([]);
    // Hiển thị thông báo
    toast({
      title: "Thông báo",
      description: "Người chat đã ngắt kết nối",
      status: "info",
    });
  });

  // Xử lý khi người chat rời phòng
  socket.on('user_left', (data) => {
    console.log('Chat partner left:', data);
    // Reset states
    setIsMatched(false);
    setCurrentRoomId(null);
    setMessages([]);
    // Hiển thị thông báo
    toast({
      title: "Thông báo",
      description: "Người chat đã rời phòng",
      status: "info",
    });
  });

  return () => {
    socket.off('user_disconnected');
    socket.off('user_left');
  };
}, []);

useEffect(() => {
  socket.on('receive_message', (data) => {
    console.log("Received message:", data);
    setMessages(prev => [...prev, {
      text: data.text,
      sent: false,
      timestamp: new Date(data.timestamp),
      sender: data.sender
    }]);
  });

  return () => {
    socket.off('receive_message');
  };
}, []);

// Add new useEffect to check existing room on initial load
useEffect(() => {
  if (isConnected && username.userId) {
    socket.emit('check_existing_room', {
      userId: username.userId,
      username: username.name
    });
  }
}, [isConnected, username]);

// Add socket listeners for existing room responses
useEffect(() => {
  socket.on('existing_room_found', (data) => {
    console.log('Existing room found:', data);
    if (data.partnerLeft) {
      // If partner left, show appropriate message
      toast({
        title: "Thông báo",
        description: "Người chat trước đã rời phòng",
        status: "info",
      });
    } else {
      // Rejoin the existing room
      setCurrentRoomId(data.roomId);
      setIsMatched(true);
    }
  });

  socket.on('no_room_found', () => {
    console.log('No existing room found');
  });

  socket.on('partner_rejoined', (data) => {
    toast({
      title: "Thông báo",
      description: `${data.username} đã quay lại phòng chat`,
      status: "info",
    });
  });

  return () => {
    socket.off('existing_room_found');
    socket.off('no_room_found');
    socket.off('partner_rejoined');
  };
}, []);

const handleStartChat = () => {
  console.log("Starting chat...");
  if (!isConnected) {
    console.log("Socket not connected!");
    return;
  }

  setIsMatching(true);
  socket.emit('start_chat', {
    userId: username.userId,
    username: username.name
  });
};

const sendMessage = (e: React.FormEvent) => {
  e.preventDefault()
  if (inputMessage.trim() && currentRoomId) {
    socket.emit('send_message', {
      message: inputMessage,
      userId: username.userId,
      username: username.name,
      roomId: currentRoomId
    });
    setMessages(prev => [...prev, {
      text: inputMessage,
      sent: true,
      timestamp: new Date(),
      sender: username.userId
    }]);
    setInputMessage('');
  }
}

const handleLogout = () => {
  auth.signOut()
  router.push('/login')
}

// Thêm function để rời phòng chủ động
const handleLeaveRoom = () => {
  if (currentRoomId) {
    socket.emit('leave_room', { roomId: currentRoomId });
    setIsMatched(false);
    setCurrentRoomId(null);
    setMessages([]);
  }
};

if (isLoading) {
  return <div className="flex h-screen items-center justify-center">Loading...</div>
}

return (
  <div className="flex h-screen bg-background">
    {/* Sidebar */}
    <div className="hidden md:flex w-64 flex-col border-r">
      <div className="p-4 border-b">
        <div className="flex items-center gap-4">
          <Avatar className="w-12 h-12">
            <img src="https://cvnl.app/images/avatar.png" alt="Profile" />
          </Avatar>
          <div>
            <h2 className="font-semibold">{username.name}</h2>
            <div className="flex gap-2 text-sm text-muted-foreground">
              <span>906</span>
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-2">
        <Button variant="ghost" className="w-full justify-start gap-2">
          <MessageCircle className="w-4 h-4" />
          Trò chuyện
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Edit className="w-4 h-4" />
          Confession
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Settings className="w-4 h-4" />
          Cài đặt
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <HelpCircle className="w-4 h-4" />
          Trợ giúp
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </Button>
      </nav>
    </div>

    {/* Main Chat Area */}
    <div className="flex-1 flex flex-col">
      <header className="h-14 border-b flex items-center px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <MessageCircle className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex-1 p-2">
              <Button variant="ghost" className="w-full justify-start gap-2">
                <MessageCircle className="w-4 h-4" />
                Trò chuyện
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <Edit className="w-4 h-4" />
                Confession
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <Settings className="w-4 h-4" />
                Cài đặt
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <HelpCircle className="w-4 h-4" />
                Trợ giúp
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Đăng xuất
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold ml-2">Chat với người lạ</h1>
      </header>

      {!isMatched ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            {!isMatching ? (
              <div className="space-y-4">
                <p className="text-lg text-gray-600">
                  Bắt đầu một cuộc trò chuyện mới
                </p>
                <Button 
                  onClick={handleStartChat} 
                  size="lg"
                  className="px-8"
                >
                  Bắt đầu chat
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
                <p className="text-lg text-gray-600">Đang tìm kiếm người chat...</p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsMatching(false);
                    socket.emit('cancel_matching', {
                      userId: username.userId
                    });
                  }}
                >
                  Hủy
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 p-4">
            {isLoadingMessages ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, i) => (
                  <div
                    key={i}
                    className={`flex ${message.sent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`rounded-lg px-4 py-2 max-w-[70%] ${
                        message.sent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <form onSubmit={sendMessage} className="border-t p-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-red-100"
                onClick={handleLeaveRoom}
              >
                <LogOut className="h-4 w-4 text-red-500" />
              </Button>
              <Input
                placeholder="Nhập tin nhắn..."
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
              />
              <Button type="submit">Gửi</Button>
            </div>
          </form>
        </>
      )}
    </div>
  </div>
)
}