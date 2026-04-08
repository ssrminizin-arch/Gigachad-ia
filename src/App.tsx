import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Shield, Zap, User, Image as ImageIcon, X, LogOut, Key, Copy, Check, Palette, Menu, Plus, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { geminiService } from "./services/gemini";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot, setDoc, addDoc, serverTimestamp, orderBy, limit, deleteDoc } from "firebase/firestore";
import { Auth } from "./components/Auth";
import { UserProfile, AccessCode, Chat, Message as MessageType } from "./types";
import { addDays, isAfter } from "date-fns";
import { cn } from "./lib/utils";

interface Message {
  id?: string;
  role: "user" | "model";
  content: string;
  imageData?: string;
  errorDetails?: string;
  createdAt?: any;
}

type Theme = 'original' | 'red-white' | 'white-black';

const themes = {
  original: {
    bg: "bg-gradient-to-t from-zinc-900 to-black",
    text: "text-zinc-400",
    header: "bg-black/60 border-zinc-800/40",
    headerText: "text-zinc-100",
    input: "bg-zinc-900/30 border-zinc-800/50 text-zinc-100",
    accent: "text-emerald-500",
    button: "bg-emerald-600 hover:bg-emerald-500 text-black",
    messageUser: "bg-emerald-600 text-black",
    messageModel: "bg-zinc-900 border-zinc-800 text-zinc-100"
  },
  'red-white': {
    bg: "bg-gradient-to-t from-red-600 to-white",
    text: "text-zinc-800",
    header: "bg-white/60 border-red-200",
    headerText: "text-zinc-900",
    input: "bg-white/50 border-red-200 text-zinc-900",
    accent: "text-red-600",
    button: "bg-red-600 hover:bg-red-500 text-white",
    messageUser: "bg-red-600 text-white",
    messageModel: "bg-white border-red-100 text-zinc-900"
  },
  'white-black': {
    bg: "bg-gradient-to-t from-white to-black",
    text: "text-zinc-300",
    header: "bg-black/60 border-zinc-800",
    headerText: "text-white",
    input: "bg-zinc-900/50 border-zinc-700 text-white",
    accent: "text-zinc-100",
    button: "bg-zinc-700 hover:bg-zinc-600 text-white",
    messageUser: "bg-zinc-700 text-white",
    messageModel: "bg-zinc-900 border-zinc-800 text-zinc-100"
  }
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [isIpVerified, setIsIpVerified] = useState(false);
  const [theme, setTheme] = useState<Theme>('original');
  
  const currentTheme = themes[theme];
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatTopic, setChatTopic] = useState("Novo Chat");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom(messages.length <= 1 ? "auto" : "smooth");
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [input]);

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setCurrentIp(data.ip);
      } catch (err) {
        console.error('Failed to fetch IP:', err);
      }
    };
    fetchIp();

    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (firebaseUser) {
        profileUnsubscribe = onSnapshot(doc(db, "users", firebaseUser.uid), (doc) => {
          if (doc.exists()) {
            const profileData = doc.data() as UserProfile;
            setUserProfile(profileData);
            
            const isOwner = firebaseUser.email === 'afizportapau@gmail.com';
            if (isOwner) {
              setIsIpVerified(true);
            }
          }
          setIsAuthReady(true);
        }, (error) => {
          console.error("Profile listener error:", error);
          setIsAuthReady(true);
        });
      } else {
        setUserProfile(null);
        setIsIpVerified(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  // Listen for user's chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setActiveChatId(null);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("userId", "==", user.uid),
      orderBy("lastMessageAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      setChats(chatList);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen for messages in active chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setChatTopic("Novo Chat");
      return;
    }

    const chat = chats.find(c => c.id === activeChatId);
    if (chat) setChatTopic(chat.title);

    const q = query(
      collection(db, "chats", activeChatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgList);
    });

    return () => unsubscribe();
  }, [activeChatId, chats]);

  useEffect(() => {
    if (user && userProfile) {
      const isOwner = user.email === 'afizportapau@gmail.com';
      if (isOwner) {
        setIsIpVerified(true);
      } else {
        const ipMatches = !currentIp || !userProfile.lastIp || userProfile.lastIp === currentIp;
        const accessExpired = userProfile.accessExpiresAt && isAfter(new Date(), new Date(userProfile.accessExpiresAt));
        
        if (accessExpired) {
          setIsIpVerified(false);
        } else if (ipMatches) {
          setIsIpVerified(true);
        } else {
          setIsIpVerified(false);
        }
      }
    }
  }, [user, userProfile, currentIp]);

  useEffect(() => {
    const checkExpiration = () => {
      if (user && userProfile && user.email !== 'afizportapau@gmail.com') {
        const accessExpired = userProfile.accessExpiresAt && isAfter(new Date(), new Date(userProfile.accessExpiresAt));
        if (accessExpired) {
          setIsIpVerified(false);
        }
      }
    };

    const interval = setInterval(checkExpiration, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [user, userProfile]);

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      const q = query(collection(db, "accessCodes"), where("used", "==", false));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const codes = snapshot.docs.map(doc => doc.data() as AccessCode);
        setAccessCodes(codes);
      });
      return () => unsubscribe();
    }
  }, [userProfile]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateCodes = async (quantity: number) => {
    if (userProfile?.role !== 'admin') return;
    
    setIsLoading(true);
    try {
      const newCodes: string[] = [];
      for (let i = 0; i < quantity; i++) {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        const createdAt = new Date().toISOString();
        const expiresAt = addDays(new Date(), 30).toISOString();
        
        await setDoc(doc(db, "accessCodes", code), {
          code,
          createdAt,
          expiresAt,
          used: false
        });
        newCodes.push(code);
      }
      
      setMessages(prev => [...prev, { 
        role: "model", 
        content: `✅ Geradas ${quantity} chaves de acesso de 30 dias:\n\n${newCodes.map(c => `\`${c}\``).join('\n')}` 
      }]);
    } catch (error) {
      console.error("Erro ao gerar códigos:", error);
      setMessages(prev => [...prev, { role: "model", content: "❌ Falha ao gerar códigos de acesso." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const syncKiwifyOrders = async () => {
    if (userProfile?.role !== 'admin' || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch('/api/admin/sync-kiwify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || "2011" })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ Sincronização concluída! ${data.processed} pedidos processados.`);
      } else {
        alert(`❌ Erro na sincronização: ${data.error}`);
      }
    } catch (error) {
      console.error("Erro ao sincronizar Kiwify:", error);
      alert("❌ Falha na conexão com o servidor.");
    } finally {
      setIsSyncing(false);
    }
  };

  const createNewChat = async () => {
    if (!user) return;
    setActiveChatId(null);
    setMessages([]);
    setChatTopic("Novo Chat");
    setIsSidebarOpen(false);
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await deleteDoc(doc(db, "chats", chatId));
      if (activeChatId === chatId) {
        createNewChat();
      }
    } catch (error) {
      console.error("Erro ao excluir chat:", error);
    }
  };

  const handleSend = async (retryMessage?: string, retryImage?: string) => {
    const userMessage = retryMessage || input.trim();
    const imageToUse = retryImage || selectedImage;
    
    if ((!userMessage && !imageToUse) || isLoading || !user) return;

    let currentChatId = activeChatId;

    // Create new chat if none active
    if (!currentChatId && !userMessage.startsWith("/")) {
      try {
        const title = userMessage.length > 30 ? userMessage.substring(0, 30) + "..." : userMessage;
        const chatDoc = await addDoc(collection(db, "chats"), {
          userId: user.uid,
          title: title,
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp()
        });
        currentChatId = chatDoc.id;
        setActiveChatId(currentChatId);
      } catch (error) {
        console.error("Erro ao criar chat:", error);
        return;
      }
    }

    // Handle /gerargiga command
    if (userMessage.startsWith("/gerargiga")) {
      setInput("");
      const parts = userMessage.split(" ");
      const quantity = parseInt(parts[1]) || 1;
      
      if (userProfile?.role !== 'admin') {
        setMessages(prev => [...prev, { role: "user", content: userMessage }, { role: "model", content: "❌ Apenas administradores podem gerar chaves." }]);
        return;
      }

      setMessages(prev => [...prev, { role: "user", content: userMessage }]);
      await generateCodes(quantity);
      return;
    }

    if (!retryMessage) {
      setInput("");
      setSelectedImage(null);
    }
    
    // Save User Message to Firestore
    if (!retryMessage && currentChatId) {
      try {
        await addDoc(collection(db, "chats", currentChatId, "messages"), {
          role: "user",
          content: userMessage,
          imageData: imageToUse?.split(',')[1] || null,
          createdAt: serverTimestamp()
        });
        
        await setDoc(doc(db, "chats", currentChatId), {
          lastMessageAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error("Erro ao salvar mensagem:", error);
      }
    }
    
    setIsLoading(true);

    try {
      const history = messages
        .filter(msg => !msg.errorDetails)
        .map((msg) => ({
          role: msg.role,
          parts: [
            ...(msg.imageData ? [{ inlineData: { data: msg.imageData, mimeType: "image/png" } }] : []),
            { text: msg.content }
          ],
        }));

      let assistantContent = "";
      let assistantImage = "";
      
      // We don't add the empty model message to Firestore yet, 
      // we'll save it only when finished to avoid partial writes
      setMessages((prev) => [...prev, { role: "model", content: "" }]);

      const stream = geminiService.sendMessageStream(userMessage, history, imageToUse || undefined);
      
      let lastUpdateTime = Date.now();
      
      for await (const chunk of stream) {
        if (chunk) {
          if (chunk.type === 'text') {
            assistantContent += chunk.value;
          } else if (chunk.type === 'image') {
            assistantImage = chunk.value;
          }
          
          const now = Date.now();
          if (now - lastUpdateTime > 60) {
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === "model") {
                newMessages[newMessages.length - 1] = {
                  role: "model",
                  content: assistantContent,
                  imageData: assistantImage || undefined
                };
              }
              return newMessages;
            });
            lastUpdateTime = now;
          }
        }
      }
      
      // Save Model Message to Firestore
      if (currentChatId) {
        await addDoc(collection(db, "chats", currentChatId, "messages"), {
          role: "model",
          content: assistantContent,
          imageData: assistantImage || null,
          createdAt: serverTimestamp()
        });
        
        await setDoc(doc(db, "chats", currentChatId), {
          lastMessageAt: serverTimestamp()
        }, { merge: true });
      }

    } catch (error: any) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [...prev, { role: "model", content: "Erro na conexão. Tente novamente." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const toggleTheme = () => {
    const themeKeys = Object.keys(themes) as Theme[];
    const currentIndex = themeKeys.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    setTheme(themeKeys[nextIndex]);
  };

  if (!isAuthReady) return null;
  if (!user || !user.emailVerified || !isIpVerified) {
    return <Auth onVerified={() => setIsIpVerified(true)} />;
  }

  return (
    <div className={`flex h-[100dvh] ${currentTheme.bg} ${currentTheme.text} font-sans selection:bg-zinc-800 selection:text-white overflow-hidden transition-colors duration-500`}>
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className={`fixed inset-y-0 left-0 w-[280px] ${currentTheme.header} border-r border-zinc-800/40 z-[70] flex flex-col transition-colors lg:relative lg:translate-x-0`}
            >
              <div className="p-4 border-b border-zinc-800/40">
                <button
                  onClick={createNewChat}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${currentTheme.button} font-bold transition-all shadow-lg active:scale-95`}
                >
                  <Plus className="w-5 h-5" />
                  Novo Chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 mb-2">Histórico</p>
                {chats.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <MessageSquare className="w-8 h-8 text-zinc-800 mx-auto mb-2 opacity-20" />
                    <p className="text-xs text-zinc-600 italic">Nenhum chat salvo.</p>
                  </div>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setActiveChatId(chat.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        activeChatId === chat.id 
                          ? 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-100' 
                          : 'hover:bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeChatId === chat.id ? currentTheme.accent : ''}`} />
                        <span className="text-sm font-medium truncate">{chat.title}</span>
                      </div>
                      <button
                        onClick={(e) => deleteChat(chat.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 transition-all rounded-lg hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-zinc-800/40">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-200 truncate">{user?.email}</p>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest">{userProfile?.role}</p>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className={`flex items-center justify-between px-4 sm:px-8 py-5 border-b ${currentTheme.header} backdrop-blur-2xl sticky top-0 z-50 transition-colors`}>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className={`hidden sm:flex w-12 h-12 rounded-2xl ${theme === 'red-white' ? 'bg-red-100 border-red-200' : 'bg-zinc-900 border-zinc-800'} items-center justify-center border ${currentTheme.headerText} shadow-[0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden group`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${theme === 'red-white' ? 'from-red-500/10' : 'from-emerald-500/10'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              <User className="w-6 h-6 relative z-10" />
            </div>
            <div className="min-w-0">
              <h1 className={`text-base sm:text-lg font-serif italic ${currentTheme.headerText} tracking-tight truncate max-w-[120px] sm:max-w-[300px]`}>
                {chatTopic}
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                {userProfile?.role === 'admin' ? 'Administrador' : 'Usuário'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={toggleTheme}
              className={`p-2 transition-colors rounded-lg text-zinc-500 hover:${currentTheme.headerText} hover:bg-zinc-900/20`}
              title="Trocar Tema"
            >
              <Palette className="w-4 h-4" />
            </button>
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setIsAdminMode(!isAdminMode)}
                className={`p-2 transition-colors rounded-lg ${isAdminMode ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900'}`}
                title="Chaves de Acesso"
              >
                <Key className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={createNewChat}
              className="p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
              title="Novo Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-zinc-500 hover:text-red-500 transition-colors rounded-lg hover:bg-zinc-900"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:px-8 max-w-4xl mx-auto w-full overscroll-contain"
      >
        <AnimatePresence mode="wait">
          {isAdminMode ? (
            <motion.div
              key="admin-codes"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <Key className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-zinc-100 uppercase italic">Chaves de Acesso Ativas</h2>
                    <p className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase">Gerencie os códigos de 30 dias</p>
                  </div>
                </div>
                <button
                  onClick={syncKiwifyOrders}
                  disabled={isSyncing}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-50",
                    theme === 'red-white' ? "bg-red-600 text-white" : "bg-emerald-600 text-black"
                  )}
                >
                  <Zap className={cn("w-4 h-4", isSyncing && "animate-pulse")} />
                  {isSyncing ? "Sincronizando..." : "Sincronizar Kiwify"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {accessCodes.length === 0 ? (
                  <div className="col-span-full py-12 text-center bg-zinc-900/30 border border-zinc-800 rounded-3xl border-dashed">
                    <p className="text-zinc-600 italic text-sm">Nenhuma chave ativa disponível.</p>
                    <p className="text-[10px] text-zinc-700 uppercase mt-2">Use /gerargiga no chat para criar novas</p>
                  </div>
                ) : (
                  accessCodes.map((code) => (
                    <div key={code.code} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                      <div>
                        <p className="font-mono text-emerald-500 font-bold text-lg">{code.code}</p>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">
                          Expira em: {new Date(code.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(code.code)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 rounded-xl transition-all"
                      >
                        {copiedCode === code.code ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : messages.length === 0 ? (
            <motion.div 
              key="empty-state"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-full flex flex-col items-center justify-center text-center space-y-6 px-4 py-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2 text-3xl">
                🗿
              </div>
              <div className="space-y-2">
                <h2 className={`text-2xl font-light ${currentTheme.headerText} tracking-tight`}>GigaChad AI</h2>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed italic">
                  "Fale o que quiser..."
                </p>
              </div>
              {userProfile?.role === 'admin' && (
                <div className={`p-4 ${theme === 'red-white' ? 'bg-red-500/5 border-red-500/10' : 'bg-emerald-500/5 border-emerald-500/10'} rounded-2xl max-w-xs`}>
                  <p className={`text-[10px] ${theme === 'red-white' ? 'text-red-500' : 'text-emerald-500'} font-bold uppercase tracking-widest`}>Comando Admin</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Digite <code className={theme === 'red-white' ? 'text-red-400' : 'text-emerald-400'}>/gerargiga 5</code> para gerar 5 chaves de acesso.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <div key="message-list" className="space-y-2">
              {messages.map((msg, idx) => (
                <ChatMessage 
                  key={msg.id || idx} 
                  role={msg.role} 
                  content={msg.content} 
                  imageData={msg.imageData}
                  errorDetails={msg.errorDetails}
                  theme={theme}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className={cn(
              "px-4 py-3 rounded-2xl rounded-tl-none border flex items-center gap-3",
              theme === 'red-white' ? "bg-white border-red-100" : "bg-zinc-900 border-zinc-800"
            )}>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                theme === 'red-white' ? "text-red-400" : "text-zinc-500"
              )}>Processando</span>
              <div className="flex gap-1">
                <span className={cn("w-1 h-1 rounded-full animate-bounce", theme === 'red-white' ? "bg-red-400" : "bg-zinc-600")} />
                <span className={cn("w-1 h-1 rounded-full animate-bounce [animation-delay:0.2s]", theme === 'red-white' ? "bg-red-400" : "bg-zinc-600")} />
                <span className={cn("w-1 h-1 rounded-full animate-bounce [animation-delay:0.4s]", theme === 'red-white' ? "bg-red-400" : "bg-zinc-600")} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Input Area */}
      <footer className={cn(
        "p-4 sm:p-8",
        theme === 'red-white' ? "bg-gradient-to-t from-white via-white/80 to-transparent" : "bg-gradient-to-t from-black via-black/80 to-transparent"
      )}>
        <div className="max-w-4xl mx-auto w-full relative">
          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className={cn(
                  "absolute bottom-full mb-6 left-0 p-3 rounded-2xl shadow-2xl flex items-center gap-4 z-20 backdrop-blur-xl border",
                  theme === 'red-white' ? "bg-white/90 border-red-200" : "bg-zinc-900/90 border-emerald-500/20"
                )}
              >
                <div className={cn(
                  "relative w-20 h-20 rounded-xl overflow-hidden border shadow-inner",
                  theme === 'red-white' ? "border-red-100" : "border-zinc-800"
                )}>
                  <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-black/80 text-white rounded-full hover:bg-red-500 transition-all shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-center gap-3">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "p-4 border rounded-2xl transition-all backdrop-blur-md group",
                theme === 'red-white' 
                  ? "bg-white/40 border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50/50 hover:border-red-300" 
                  : "bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/5 hover:border-emerald-500/20"
              )}
            >
              <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            
            <div className="relative flex-1 flex items-center group">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Fale o que quiser..."
                className={cn(
                  "w-full px-7 py-4 pr-16 rounded-3xl focus:outline-none transition-all text-sm backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] resize-none min-h-[60px] max-h-32 flex items-center overflow-y-auto",
                  currentTheme.input,
                  theme === 'red-white' ? "focus:ring-1 focus:ring-red-500/20 focus:border-red-500/30 placeholder:text-red-200" : "focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500/30 placeholder:text-zinc-700"
                )}
                rows={1}
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className={`absolute right-3 bottom-3 p-3.5 ${currentTheme.button} rounded-full transition-all disabled:opacity-10 disabled:grayscale shadow-lg active:scale-90`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
  );
}
