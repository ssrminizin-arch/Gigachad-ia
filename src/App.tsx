import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Shield, Zap, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { geminiService } from "./services/gemini";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const userMsgId = crypto.randomUUID();
    const modelMsgId = crypto.randomUUID();

    setInput("");
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content || "" }],
      }));

      setMessages((prev) => [...prev, { id: modelMsgId, role: "model", content: "" }]);

      const stream = geminiService.sendMessageStream(userMessage, history);
      
      let accumulatedContent = "";
      let lastUpdate = Date.now();
      
      for await (const chunk of stream) {
        if (chunk) {
          accumulatedContent += chunk;
          
          // Throttle updates to improve mobile performance
          const now = Date.now();
          if (now - lastUpdate > 50) { 
            setMessages((prev) => 
              prev.map((msg) => 
                msg.id === modelMsgId ? { ...msg, content: accumulatedContent } : msg
              )
            );
            lastUpdate = now;
          }
        }
      }
      
      // Final update to ensure everything is rendered
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === modelMsgId ? { ...msg, content: accumulatedContent } : msg
        )
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "model", content: "Desculpe, tive um problema técnico. Tente novamente." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#050505] text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-bottom border-zinc-900/50 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
            <User className="w-5 h-5 text-zinc-100" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 tracking-tight uppercase">GigaChat</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={clearChat}
            className="p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
            title="Limpar Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:px-8 max-w-4xl mx-auto w-full scroll-smooth"
      >
        <AnimatePresence mode="popLayout">
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-center space-y-6 px-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2">
                <Zap className="w-8 h-8 text-zinc-100" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-light text-zinc-100 tracking-tight">GigaChad AI</h2>
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  Sem filtros. Sem desculpas. Apenas a verdade fria e pragmática.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mt-8">
                {[
                  "Como ser mais produtivo?",
                  "Dê-me um treino pesado.",
                  "O que é o sucesso?",
                  "Por que as pessoas falham?"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="p-4 text-xs text-left bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 rounded-xl transition-all hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((msg) => (
              <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
            ))
          )}
        </AnimatePresence>
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start mb-6">
            <div className="bg-zinc-900 px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-800">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 sm:p-6 bg-gradient-to-t from-[#050505] to-transparent">
        <div className="max-w-4xl mx-auto w-full relative">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Fale com o Chad..."
              className="w-full bg-zinc-900/80 border border-zinc-800 text-zinc-100 px-6 py-4 pr-16 rounded-2xl focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-600 text-sm backdrop-blur-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2.5 bg-zinc-100 text-black rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:hover:bg-zinc-100"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span>Unfiltered</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>High Performance</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
