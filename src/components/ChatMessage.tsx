import ReactMarkdown from "react-markdown";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface ChatMessageProps {
  role: "user" | "model";
  content: string;
}

export const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";

  if (content === undefined || content === null) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full mb-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed overflow-hidden",
          isUser
            ? "bg-zinc-800 text-zinc-100 rounded-tr-none border border-zinc-700/50"
            : "bg-zinc-900 text-zinc-300 rounded-tl-none border border-zinc-800"
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">
            {isUser ? "Você" : "GigaChad"}
          </span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none break-words">
          <ReactMarkdown>
            {content || ""}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
};
