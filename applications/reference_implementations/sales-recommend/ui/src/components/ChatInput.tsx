"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2, ArrowUp, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Tailwind max-width classes — should match the message column. */
  widthClass?: string;
}

export function ChatInput({ onSend, onClear, disabled, widthClass = "max-w-3xl" }: ChatInputProps) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  return (
    <div className="border-t border-ink-700/60 bg-ink-900/80 px-4 py-3.5 backdrop-blur-xl sm:px-6">
      <div className={`mx-auto ${widthClass}`}>
        <div className="rounded-2xl border border-ink-700/70 bg-ink-850 p-2 shadow-card transition-colors focus-within:border-accent/50">
          <textarea
            ref={taRef}
            value={value}
            onChange={autoGrow}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Describe the client, their pain point, or ask for a section of the report…"
            className="scroll-thin max-h-44 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1">
              <ActionButton icon={<Paperclip className="h-[18px] w-[18px]" />} label="Attach Context" />
              <ActionButton
                icon={<Trash2 className="h-[18px] w-[18px]" />}
                label="Clear Chat"
                onClick={onClear}
              />
              <ActionButton icon={<Mic className="h-[18px] w-[18px]" />} label="Voice" />
            </div>
            <button
              onClick={submit}
              disabled={!value.trim() || disabled}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-glow transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              aria-label="Send message"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-600">
          Meridian can make mistakes. Verify solution specs before sharing with clients.
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-ink-700/60 hover:text-slate-200"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
