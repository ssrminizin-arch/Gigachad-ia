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
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isBlacklistPreview, setIsBlacklistPreview] = useState(false);
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any[]>([]);
  const [adminBlacklist, setAdminBlacklist] = useState<any[]>([]);
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

  const fetchAdminLogs = async (password: string) => {
    try {
      const response = await fetch("/api/admin/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        const data = await response.json();
        setAdminLogs(data.logs);
        setAdminStats(data.stats || []);
        setAdminBlacklist(data.blacklist || []);
        setIsAdminMode(true);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  };

  const handleBlacklist = async (ip: string) => {
    const reason = prompt("Motivo do blacklist:");
    if (!reason) return;
    
    try {
      const response = await fetch("/api/admin/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "2011", ip, reason }),
      });
      if (response.ok) {
        fetchAdminLogs("2011");
      }
    } catch (error) {
      console.error("Failed to blacklist:", error);
    }
  };

  const handleRemoveBlacklist = async (ip: string) => {
    try {
      const response = await fetch("/api/admin/blacklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "2011", ip }),
      });
      if (response.ok) {
        fetchAdminLogs("2011");
      }
    } catch (error) {
      console.error("Failed to remove blacklist:", error);
    }
  };

  const handleSend = async (retryMessage?: string, retryImage?: string) => {
    const userMessage = retryMessage || input.trim();
    const imageToUse = retryImage || selectedImage;
    
    if ((!userMessage && !imageToUse) || isLoading) return;

    // Secret keyword "aleph" to show logs
    if (userMessage.toLowerCase() === "aleph") {
      setInput("");
      setSelectedImage(null);
      
      const newUserMessage: Message = { role: "user", content: userMessage };
      setMessages(prev => [...prev, newUserMessage]);
      setIsLoading(true);

      try {
        const response = await fetch("/api/admin/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "2011" }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const logs = data.logs as any[];
          const stats = data.stats as any[];
          
          let logTable = "## PROTOCOLO ALEPH: REGISTRO DE VISITANTES ÚNICOS 🗿\n\n";
          logTable += "Abaixo estão todos os indivíduos únicos que acessaram o sistema. Sem repetições, apenas a elite.\n\n";
          
          logTable += "| IP | Localização | Acessos | Última Vez |\n";
          logTable += "| :--- | :--- | :--- | :--- |\n";
          
          stats.forEach(stat => {
            const location = (stat.city && stat.region) ? `${stat.city}, ${stat.region}` : "Desconhecido";
            logTable += `| \`${stat.ip}\` | ${location} | ${stat.count} | ${new Date(stat.last_seen).toLocaleString()} |\n`;
          });

          const aiMessage: Message = {
            role: "model",
            content: logTable
          };
          setMessages(prev => [...prev, aiMessage]);
        } else {
          const status = response.status;
          let errorMsg = "Acesso negado. O protocolo Aleph falhou.";
          
          if (status === 401) errorMsg = "Senha incorreta. Você não tem autoridade para o protocolo Aleph.";
          if (status === 500) errorMsg = "Erro interno no banco de dados. O protocolo Aleph está instável.";

          const aiMessage: Message = {
            role: "model",
            content: `## ERRO NO PROTOCOLO ALEPH ⚠️\n\n${errorMsg}\n\nStatus: ${status}`
          };
          setMessages(prev => [...prev, aiMessage]);
        }
      } catch (error) {
        console.error("Failed to fetch logs via aleph:", error);
        const aiMessage: Message = {
          role: "model",
          content: "## FALHA CRÍTICA NO PROTOCOLO ALEPH 🚨\n\nNão consegui estabelecer conexão com o servidor de logs. Verifique se o backend está rodando."
        };
        setMessages(prev => [...prev, aiMessage]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Admin Panel command
    if (userMessage.toLowerCase() === "painel2011") {
      setInput("");
      setSelectedImage(null);
      fetchAdminLogs("2011");
      return;
    }

    // Blacklist Preview command
    if (userMessage.toLowerCase() === "bteste") {
      setInput("");
      setSelectedImage(null);
      setIsBlacklistPreview(true);
      return;
    }

    // Direct Blacklist command: banir [ip] [reason]
    if (userMessage.toLowerCase().startsWith("banir ")) {
      const parts = userMessage.split(" ");
      if (parts.length >= 3) {
        const ip = parts[1];
        const reason = parts.slice(2).join(" ");
        
        setInput("");
        setSelectedImage(null);
        setIsLoading(true);

        try {
          const response = await fetch("/api/admin/blacklist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "2011", ip, reason }),
          });
          
          if (response.ok) {
            setMessages(prev => [...prev, { role: "user", content: userMessage }, { role: "model", content: `✅ IP \`${ip}\` foi banido com sucesso.\nMotivo: ${reason}` }]);
          } else {
            setMessages(prev => [...prev, { role: "user", content: userMessage }, { role: "model", content: "❌ Falha ao banir IP. Verifique se os dados estão corretos." }]);
          }
        } catch (error) {
          console.error("Failed to blacklist via chat:", error);
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

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
        <AnimatePresence mode="wait">
          {isBlacklistPreview ? (
            <motion.div
              key="blacklist-preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center text-center p-6"
            >
              <h1 className="text-[#f4f4f5] text-2xl sm:text-3xl font-bold mb-4 uppercase tracking-tight">
                VOCÊ FOI BLACKLISTADO DO GIGACHAD IA
              </h1>
              <p className="text-[#71717a] mb-8 text-sm sm:text-base">
                Motivo: <span className="text-[#ef4444] font-bold italic">TESTE DE SISTEMA (ADMIN)</span>
              </p>
              
              <div className="border-t border-[#27272a] pt-8 w-full max-w-xs">
                <p className="text-[#71717a] text-xs sm:text-sm mb-2 uppercase tracking-widest font-bold">Achou injusto? Entre em contato:</p>
                <p className="text-[#10b981] font-black text-xl sm:text-2xl tracking-tighter">82996109343</p>
              </div>
              
              <div className="mt-12 text-5xl sm:text-6xl animate-bounce">🗿</div>

              {/* Botão de Sair (Apenas para o Admin no teste) */}
              <button
                onClick={() => setIsBlacklistPreview(false)}
                className="mt-16 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold uppercase tracking-widest text-xs border border-zinc-700 transition-all"
              >
                Sair do Teste
              </button>
            </motion.div>
          ) : isAdminMode ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 pb-20"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <Shield className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-zinc-100 uppercase tracking-tighter italic">Painel de Controle GigaChad</h2>
                    <p className="text-xs text-zinc-500 font-medium tracking-widest uppercase">Protocolo de Segurança Ativo</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAdminMode(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-zinc-700"
                >
                  Fechar Painel
                </button>
              </div>

              {/* Blacklist Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" /> Blacklist Ativa
                  </h3>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-800/50 text-zinc-500 uppercase tracking-widest font-bold border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">IP</th>
                        <th className="px-6 py-4">Motivo</th>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {adminBlacklist.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-zinc-600 italic">Nenhum IP na blacklist</td>
                        </tr>
                      ) : (
                        adminBlacklist.map((item, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-4 font-mono text-emerald-500">{item.ip}</td>
                            <td className="px-6 py-4 text-zinc-300 font-medium">{item.reason}</td>
                            <td className="px-6 py-4 text-zinc-500">{new Date(item.timestamp).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleRemoveBlacklist(item.ip)}
                                className="text-red-500 hover:text-red-400 font-bold uppercase text-[10px] tracking-widest"
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stats Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" /> Visitantes Únicos
                </h3>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-800/50 text-zinc-500 uppercase tracking-widest font-bold border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">IP</th>
                        <th className="px-6 py-4">Localização</th>
                        <th className="px-6 py-4">Acessos</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {adminStats.map((stat, idx) => (
                        <tr key={idx} className="hover:bg-zinc-800/20 transition-colors">
                          <td className="px-6 py-4 font-mono text-emerald-500">{stat.ip}</td>
                          <td className="px-6 py-4 text-zinc-300">
                            {stat.city && stat.region ? `${stat.city}, ${stat.region}` : "Desconhecido"}
                          </td>
                          <td className="px-6 py-4 text-zinc-100 font-bold">{stat.count}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleBlacklist(stat.ip)}
                              className="px-3 py-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg border border-red-500/20 transition-all font-bold uppercase text-[10px] tracking-widest"
                            >
                              Blacklist
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* All Logs Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Atividade Recente</h3>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-800/50 text-zinc-500 uppercase tracking-widest font-bold border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-4">IP</th>
                        <th className="px-6 py-4">Data/Hora</th>
                        <th className="px-6 py-4">Dispositivo</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {adminLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                          <td className="px-6 py-4 font-mono text-emerald-500">{log.ip}</td>
                          <td className="px-6 py-4 text-zinc-500">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-6 py-4 text-zinc-600 truncate max-w-[150px]" title={log.user_agent}>{log.user_agent}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleBlacklist(log.ip)}
                              className="px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg border border-red-500/20 transition-all font-bold uppercase text-[9px] tracking-widest"
                            >
                              Banir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
