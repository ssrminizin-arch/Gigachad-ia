import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Shield, Zap, User, Image as ImageIcon, X, LogOut, Key, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { geminiService } from "./services/gemini";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot, setDoc } from "firebase/firestore";
import { Auth } from "./components/Auth";
import { UserProfile, AccessCode } from "./types";
import { addDays } from "date-fns";

interface Message {
  role: "user" | "model";
  content: string;
  imageData?: string;
  errorDetails?: string;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatTopic, setChatTopic] = useState("Novo Chat");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data() as UserProfile);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleSend = async (retryMessage?: string, retryImage?: string) => {
    const userMessage = retryMessage || input.trim();
    const imageToUse = retryImage || selectedImage;
    
    if ((!userMessage && !imageToUse) || isLoading) return;

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
      
      if (messages.length === 0) {
        const topic = userMessage.length > 30 ? userMessage.substring(0, 30) + "..." : userMessage;
        setChatTopic(topic);
      }
    }
    
    if (!retryMessage) {
      setMessages((prev) => [...prev, { 
        role: "user", 
        content: userMessage,
        imageData: imageToUse?.split(',')[1]
      }]);
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

  if (!isAuthReady) return null;
  if (!user || !user.emailVerified) return <Auth />;

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-t from-zinc-900 to-black text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/40 bg-black/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-100 shadow-[0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <User className="w-6 h-6 relative z-10" />
          </div>
          <div>
            <h1 className="text-lg font-serif italic text-zinc-100 tracking-tight truncate max-w-[150px] sm:max-w-[300px]">
              {chatTopic}
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              {userProfile?.role === 'admin' ? 'Administrador' : 'Usuário'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
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
            onClick={() => setMessages([])}
            className="p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
            title="Limpar Chat"
          >
            <Trash2 className="w-4 h-4" />
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
        className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:px-8 max-w-4xl mx-auto w-full scroll-smooth overscroll-contain"
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
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                  <Key className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-100 uppercase italic">Chaves de Acesso Ativas</h2>
                  <p className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase">Gerencie os códigos de 30 dias</p>
                </div>
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-h-full flex flex-col items-center justify-center text-center space-y-6 px-4 py-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2 text-3xl">
                🗿
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-light text-zinc-100 tracking-tight">GigaChad AI</h2>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed italic">
                  "Fale o que quiser..."
                </p>
              </div>
              {userProfile?.role === 'admin' && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl max-w-xs">
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Comando Admin</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Digite <code className="text-emerald-400">/gerargiga 5</code> para gerar 5 chaves de acesso.</p>
                </div>
              )}
            </motion.div>
          ) : (
            messages.map((msg, idx) => (
              <ChatMessage 
                key={idx} 
                role={msg.role} 
                content={msg.content} 
                imageData={msg.imageData}
                errorDetails={msg.errorDetails}
              />
            ))
          )}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="bg-zinc-900 px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-800 flex items-center gap-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Processando</span>
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" />
                <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 sm:p-8 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-4xl mx-auto w-full relative">
          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full mb-6 left-0 p-3 bg-zinc-900/90 border border-emerald-500/20 rounded-2xl shadow-2xl flex items-center gap-4 z-20 backdrop-blur-xl"
              >
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-800 shadow-inner">
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
              className="p-4 bg-zinc-900/40 border border-zinc-800/50 text-zinc-400 rounded-2xl hover:text-emerald-500 transition-all hover:bg-emerald-500/5 hover:border-emerald-500/20 backdrop-blur-md group"
            >
              <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            
            <div className="relative flex-1 flex items-center group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Fale o que quiser..."
                className="w-full bg-zinc-900/30 border border-zinc-800/50 text-zinc-100 px-7 py-4 pr-16 rounded-3xl focus:outline-none focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500/30 transition-all placeholder:text-zinc-700 text-sm backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] resize-none min-h-[60px] max-h-32 flex items-center"
                rows={1}
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="absolute right-3 bottom-3 p-3.5 bg-emerald-600 text-black rounded-full hover:bg-emerald-500 transition-all disabled:opacity-10 disabled:grayscale shadow-lg active:scale-90"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
