"use client";

import { useEffect, useRef } from "react";
import { Menu, PanelRightOpen, FileText } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { ChatMessageBubble, TypingBubble } from "./ChatMessageBubble";
import { ChatInput } from "./ChatInput";

interface ChatViewProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  onOpenSidebar: () => void;
  onOpenPanel: () => void;
  onGenerateReport: () => void;
  panelOpen: boolean;
}

export function ChatView({
  messages,
  isTyping,
  onSend,
  onClear,
  onOpenSidebar,
  onOpenPanel,
  onGenerateReport,
  panelOpen,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Block embedded interactions (e.g. choice buttons) while a previous
  // reply is still streaming or the typing dots are showing.
  const interactionsDisabled =
    isTyping || messages.some((m) => m.streaming === true);

  // Center column width — widen on bigger screens, and widen even further
  // when the right report panel is collapsed so we don't leave empty space.
  // When the panel is open at xl+, push the chat to the LEFT instead of
  // centering, so it sits closer to the sidebar and the right-side cards
  // get visual breathing room.
  const columnWidth = panelOpen
    ? "max-w-3xl xl:ml-0 xl:mr-auto xl:max-w-4xl 2xl:max-w-5xl"
    : "max-w-3xl xl:max-w-5xl 2xl:max-w-6xl";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-ink-700/60 bg-ink-900/70 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-700/60 hover:text-white lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <h1 className="text-sm font-semibold text-white">New Conversation</h1>
              <span className="hidden rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium text-slate-400 sm:inline">
                Financial Services
              </span>
            </div>
            <p className="text-xs text-slate-500">Live · Auto-saved</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateReport}
            className="hidden items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-soft transition-all hover:bg-accent/20 sm:flex"
          >
            <FileText className="h-3.5 w-3.5" />
            View Report
          </button>
          {!panelOpen && (
            <button
              onClick={onOpenPanel}
              className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-ink-700 hover:text-white"
              aria-label="Open report preview"
            >
              <PanelRightOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Insights</span>
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto bg-grid">
        <div className={`mx-auto ${columnWidth} space-y-6 px-4 py-6 sm:px-6 sm:py-8`}>
          {messages.map((m) => (
            <ChatMessageBubble
              key={m.id}
              message={m}
              onChoiceSubmit={onSend}
              interactionsDisabled={interactionsDisabled}
            />
          ))}
          {isTyping && <TypingBubble />}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        onClear={onClear}
        disabled={isTyping}
        widthClass={columnWidth}
      />
    </div>
  );
}
