import ReactMarkdown from "react-markdown";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface ChatMessageProps {
  role: "user" | "model";
  content: string;
}

export const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";

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
            : "bg-zinc-900/80 text-zinc-300 rounded-tl-none border border-zinc-800 backdrop-blur-sm"
        )}
      >
        <div className="flex items-center gap-2 mb-3 border-b border-zinc-800/50 pb-2">
          <span className={cn(
            "text-[9px] font-black uppercase tracking-[0.2em]",
            isUser ? "text-zinc-400" : "text-emerald-500"
          )}>
            {isUser ? "USUÁRIO" : "GIGACHAD"}
          </span>
          {!isUser && <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />}
        </div>
        <div className="markdown-body">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
};
