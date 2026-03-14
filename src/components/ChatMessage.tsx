import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { AlertCircle, ChevronDown, ChevronUp, RefreshCcw, Copy, Check } from "lucide-react";
import { useRef } from "react";

interface ChatMessageProps {
  role: "user" | "model";
  content: string;
  imageData?: string;
  errorDetails?: string;
  onRetry?: () => void;
}

export const ChatMessage = ({ role, content, imageData, errorDetails, onRetry }: ChatMessageProps) => {
  const [showError, setShowError] = useState(false);
  const isUser = role === "user";
  const hasError = !!errorDetails;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full mb-8",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[90%] sm:max-w-[80%] px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-lg",
          isUser
            ? "bg-zinc-800 text-zinc-100 rounded-tr-none border border-zinc-700/50"
            : "bg-zinc-900/80 text-zinc-300 rounded-tl-none border border-zinc-800 backdrop-blur-sm",
          hasError && !isUser && "border-red-900/30 bg-red-950/10"
        )}
      >
        <div className="flex items-center justify-between mb-3 border-b border-zinc-800/50 pb-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[9px] font-black uppercase tracking-[0.2em]",
              isUser ? "text-zinc-400" : (hasError ? "text-red-500" : "text-emerald-500")
            )}>
              {isUser ? "USUÁRIO" : "GIGACHAD"}
            </span>
            {!isUser && !hasError && <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />}
            {!isUser && hasError && <AlertCircle className="w-2.5 h-2.5 text-red-500" />}
          </div>
          {!isUser && (
            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-tight sm:hidden whitespace-nowrap ml-2">
              Texto cortado? Use "Site para Computador"
            </span>
          )}
        </div>
        
        {imageData && (
          <div className="mb-4 rounded-xl overflow-hidden border border-zinc-800 bg-black/20">
            <img 
              src={`data:image/png;base64,${imageData}`} 
              alt={isUser ? "Imagem enviada" : "Geração do Chad"} 
              className="w-full h-auto object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="markdown-body space-y-1">
          <ReactMarkdown
            components={{
              pre: ({ node, children, ...props }: any) => {
                const [copied, setCopied] = useState(false);
                const preRef = useRef<HTMLPreElement>(null);

                const handleCopy = () => {
                  if (preRef.current) {
                    const codeElement = preRef.current.querySelector('code');
                    const text = codeElement ? codeElement.innerText : preRef.current.innerText;
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                };

                return (
                  <div className="relative group">
                    <button
                      onClick={handleCopy}
                      className="absolute right-3 top-3 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-500 hover:text-emerald-500 hover:border-emerald-500/30 transition-all opacity-0 group-hover:opacity-100 z-10 shadow-xl backdrop-blur-sm"
                      title="Copiar código"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <pre ref={preRef} {...props}>
                      {children}
                    </pre>
                  </div>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {hasError && (
          <div className="mt-4 pt-3 border-t border-zinc-800/50 space-y-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowError(!showError)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showError ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showError ? "Ocultar detalhes" : "Ver detalhes"}
              </button>
              
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  <RefreshCcw className="w-3 h-3" />
                  Tentar Novamente
                </button>
              )}
            </div>
            
            <AnimatePresence>
              {showError && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <pre className="mt-1 p-3 bg-black/40 rounded-lg text-[10px] font-mono text-red-400/80 whitespace-pre-wrap break-all border border-red-900/20">
                    {errorDetails}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};
