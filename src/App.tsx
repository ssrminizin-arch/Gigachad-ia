import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Shield, Zap, User, Image as ImageIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { geminiService } from "./services/gemini";

interface Message {
  role: "user" | "model";
  content: string;
  imageData?: string;
  errorDetails?: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSend = async (retryMessage?: string, retryImage?: string) => {
    const userMessage = retryMessage || input.trim();
    const imageToUse = retryImage || selectedImage;
    
    if ((!userMessage && !imageToUse) || isLoading) return;

    if (!retryMessage) {
      setInput("");
      setSelectedImage(null);
    }
    
    // If it's a retry, we don't want to add the user message again to the list
    if (!retryMessage) {
      setMessages((prev) => [...prev, { 
        role: "user", 
        content: userMessage,
        imageData: imageToUse?.split(',')[1] // Just the base64 part
      }]);
    }
    
    setIsLoading(true);

    try {
      // Filter out error messages from history for the API call
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
                  imageData: assistantImage || undefined
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
            imageData: assistantImage || undefined
          };
        }
        return newMessages;
      });

    } catch (error: any) {
      console.error("Failed to send message:", error);
      let errorMessage = "O Chad encontrou um erro. Tente novamente.";
      let technicalDetails = "";
      
      try {
        technicalDetails = typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
      } catch (e) {
        technicalDetails = String(error);
      }
      
      const errorStr = error?.message?.toLowerCase() || "";
      
      if (errorStr.includes("fetch")) {
        errorMessage = "Erro de conexão. Verifique sua internet.";
      } else if (errorStr.includes("api key") || errorStr.includes("apikey")) {
        errorMessage = "Chave de API não encontrada ou inválida. Configure o GEMINI_API_KEY nos segredos (Settings > Secrets).";
      } else if (errorStr.includes("safety") || errorStr.includes("blocked")) {
        errorMessage = "O conteúdo foi bloqueado pelos filtros de segurança da IA.";
      } else if (errorStr.includes("quota") || errorStr.includes("429") || errorStr.includes("exhausted")) {
        errorMessage = "Limite de uso excedido (Quota). Aguarde um minuto e tente novamente.";
      } else if (errorStr.includes("not found") || errorStr.includes("404")) {
        errorMessage = "Modelo da IA não encontrado ou indisponível no momento.";
      } else {
        errorMessage = "Falha ao entrar em contato com a Gemini API. Tente novamente em instantes.";
      }
        
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg?.role === "model" && !lastMsg.content) {
          newMessages[newMessages.length - 1] = { 
            role: "model", 
            content: errorMessage,
            errorDetails: technicalDetails
          };
          return newMessages;
        }
        return [...prev, { role: "model", content: errorMessage, errorDetails: technicalDetails }];
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
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isLoading ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
                {isLoading ? "Pensando..." : "Online"}
              </span>
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
              <ChatMessage 
                key={idx} 
                role={msg.role} 
                content={msg.content} 
                imageData={msg.imageData}
                errorDetails={msg.errorDetails}
                onRetry={idx === messages.length - 1 ? () => handleSend(messages[idx-1]?.content, messages[idx-1]?.imageData ? `data:image/png;base64,${messages[idx-1].imageData}` : undefined) : undefined}
              />
            ))
          )}
        </AnimatePresence>
        {isLoading && (messages[messages.length - 1]?.role === "user" || !messages[messages.length - 1]?.content) && (
          <div className="flex justify-start mb-6">
            <div className="bg-zinc-900 px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-800 flex items-center gap-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Pensando</span>
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
      <footer className="p-4 sm:p-6 bg-transparent">
        <div className="max-w-4xl mx-auto w-full relative">
          {/* Image Preview */}
          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 p-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex items-center gap-3 z-20"
              >
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-zinc-800">
                  <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-black transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="pr-4">
                  <p className="text-[10px] font-bold text-zinc-100 uppercase tracking-tight">Imagem Selecionada</p>
                  <p className="text-[8px] text-zinc-500 uppercase tracking-widest">O Chad vai analisar isso</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-center gap-2">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-4 bg-zinc-900/80 border border-zinc-800 text-zinc-400 rounded-2xl hover:text-zinc-100 transition-all hover:bg-zinc-800"
              title="Anexar Imagem"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={selectedImage ? "O que quer saber sobre a imagem?" : "Fale com o Chad..."}
                className="w-full bg-zinc-900/80 border border-zinc-800 text-zinc-100 px-6 py-4 pr-16 rounded-2xl focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-600 text-sm backdrop-blur-sm"
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="absolute right-2 p-2.5 bg-zinc-100 text-black rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:hover:bg-zinc-100"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
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
