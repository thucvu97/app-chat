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
import { collection, getDocs, query, orderBy } from 'firebase/firestore'

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
  const [roomId, setRoomId] = useState('room1')
  const [isLoading, setIsLoading] = useState(true)
  const [username, setUsername] = useState<any>({
    name :'Anonymous',
    userId :''
  })
  const [isMatching, setIsMatching] = useState(false)
  const [isMatched, setIsMatched] = useState(false)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      console.log("current-user",user);
      if (!user) {
        router.push('/login')
        return
      }
      
      setIsLoading(false)
      setUsername({
        name : user.displayName || 'Anonymous',
        userId : user.uid
      })
      socket.emit('user_login', {
        userId: user.uid,
        username: user.displayName || 'Anonymous'
      })
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const messagesRef = collection(db, 'messages');
        const snapshot = await getDocs(query(messagesRef, orderBy('timestamp', 'asc')));

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
      }
    };

    if (username.userId) {
      loadMessages();
    }
  }, [username.userId]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

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
            </ScrollArea>

            <form onSubmit={sendMessage} className="border-t p-4">
              <div className="flex gap-2">
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