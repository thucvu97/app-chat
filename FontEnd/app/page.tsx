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
import { auth } from '@/lib/firebase'

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
  const [username, setUsername] = useState<string>('Anonymous')

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      console.log("current-user",user);
      if (!user) {
        router.push('/login')
        return
      }
      
      setIsLoading(false)
      setUsername(user.displayName || 'Anonymous')
      socket.emit('user_login', {
        userId: user.uid,
        username: user.displayName || 'Anonymous'
      })
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (socket.connected) {
      onConnect();
      
    }

    function onConnect() {
      setIsConnected(true);
      socket.on('receive_message', (data: { text: string, sender: string, timestamp: Date }) => {
        console.log("receive_message", data);
        setMessages(prev => [...prev, {
          text: data.text,
          sent: false,
          timestamp: new Date(data.timestamp),
          sender: data.sender
        }]);
      });
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [roomId]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputMessage.trim()) {
      socket.emit('send_message', {
        message: inputMessage,
      });
      setMessages(prev => [...prev, {
        text: inputMessage,
        sent: true,
        timestamp: new Date(),
        sender: socket.id
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
              <h2 className="font-semibold">{username}</h2>
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
              placeholder="Ahihi..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
            />
            <Button type="submit">Send</Button>
          </div>
        </form>
      </div>
    </div>
  )
}