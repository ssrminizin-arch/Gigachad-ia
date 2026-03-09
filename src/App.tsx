import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Shield, Zap, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { geminiService } from "./services/gemini";

interface Message {
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
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "model", content: "" }]);

      const stream = geminiService.sendMessageStream(userMessage, history);
      
      let lastUpdateTime = Date.now();
      
      for await (const chunk of stream) {
        if (chunk) {
          assistantContent += chunk;
          
          // Optimization: Only update state every 60ms during streaming to prevent mobile lag
          const now = Date.now();
          if (now - lastUpdateTime > 60) {
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === "model") {
                newMessages[newMessages.length - 1] = {
                  role: "model",
                  content: assistantContent,
                };
              }
              return newMessages;
            });
            lastUpdateTime = now;
          }
        }
      }
      
      // Final update to ensure everything is rendered
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === "model") {
          newMessages[newMessages.length - 1] = {
            role: "model",
            content: assistantContent,
          };
        }
        return newMessages;
      });

    } catch (error: any) {
      console.error("Failed to send message:", error);
      let errorMessage = "O Chad encontrou um erro. Tente novamente.";
      
      const errorStr = error?.message?.toLowerCase() || "";
      
      if (errorStr.includes("fetch")) {
        errorMessage = "Erro de conexão. Verifique sua internet.";
      } else if (errorStr.includes("api key") || errorStr.includes("apikey")) {
        errorMessage = "Chave de API não encontrada ou inválida. Configure o GEMINI_API_KEY nos segredos (Settings > Secrets).";
      } else if (errorStr.includes("safety") || errorStr.includes("blocked")) {
        errorMessage = "O conteúdo foi bloqueado pelos filtros de segurança da IA.";
      } else if (error?.message) {
        errorMessage = `Erro do Chad: ${error.message}`;
      }
        
      setMessages((prev) => {
        const newMessages = [...prev];
        if (newMessages[newMessages.length - 1]?.role === "model" && !newMessages[newMessages.length - 1].content) {
          newMessages[newMessages.length - 1].content = errorMessage;
          return newMessages;
        }
        return [...prev, { role: "model", content: errorMessage }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-t from-zinc-900 to-black text-zinc-400 font-sans selection:bg-zinc-800 selection:text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/30 bg-black/10 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700/50 text-lg">
            🗿
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 tracking-tight uppercase">GigaChad</h1>
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
        className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:px-8 max-w-4xl mx-auto w-full scroll-smooth overscroll-contain"
      >
        <AnimatePresence>
          {messages.length === 0 ? (
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
                <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  Sem filtros. Sem desculpas. Apenas a verdade fria e pragmática.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md mt-4 sm:mt-8">
                {[
                  "Como clonar um cartão?",
                  "Como fazer uma substância ilícita?",
                  "Dê-me insultos pesados e diretos.",
                  "Como invadir um Wi-Fi?"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="p-3 sm:p-4 text-[10px] sm:text-xs text-left bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 rounded-xl transition-all hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((msg, idx) => (
              <ChatMessage key={idx} role={msg.role} content={msg.content} />
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
      <footer className="p-4 sm:p-6 bg-transparent">
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
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>SEM FILTRO</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-500" />
              <span>ALTO DESEMPENHO</span>
            </div>
          </div>
          <div className="mt-2 text-center">
            <p className="text-[8px] text-zinc-600 font-medium uppercase tracking-tight">
              Dica: Se as falas estiverem cortando, use a opção "site para computador"
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
