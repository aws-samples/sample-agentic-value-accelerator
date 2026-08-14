import { Sparkles, User } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { Markdown } from "./Markdown";
import { ChoiceBlock } from "./ChoiceBlock";
import { extractChoices } from "@/lib/choices";
import { extractHighlights } from "@/lib/highlights";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** Called when the user picks an answer in an embedded choice block. */
  onChoiceSubmit?: (text: string) => void;
  /** Disable embedded interactions (e.g., a previous reply is still streaming). */
  interactionsDisabled?: boolean;
}

export function ChatMessageBubble({
  message,
  onChoiceSubmit,
  interactionsDisabled,
}: ChatMessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  // Extract any ```choices``` blocks from assistant messages. For user
  // messages, just render the text verbatim. ```highlights``` blocks are
  // ALSO stripped here so they don't appear inside the chat bubble — they
  // render in the right-side panel via state derived in page.tsx.
  let cleaned = message.content;
  let blocks: ReturnType<typeof extractChoices>["blocks"] = [];
  if (isAssistant) {
    const hl = extractHighlights(cleaned);
    cleaned = hl.cleaned;
    const ch = extractChoices(cleaned);
    cleaned = ch.cleaned;
    blocks = ch.blocks;
  }

  return (
    <div
      className={`flex animate-fade-up gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
          isAssistant
            ? "bg-gradient-to-br from-accent to-accent-deep shadow-glow"
            : "bg-ink-700"
        }`}
      >
        {isAssistant ? (
          <Sparkles className="h-4 w-4 text-white" />
        ) : (
          <User className="h-4 w-4 text-slate-300" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`flex min-w-0 max-w-[78%] flex-col ${
          isAssistant ? "items-start" : "items-end"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-slate-300">
            {isAssistant ? "Meridian" : "You"}
          </span>
          <span className="text-[11px] text-slate-600">{message.timestamp}</span>
        </div>

        {/* Prose surface — only render if there's actually prose to show.
            A message could be entirely a choice block (no surrounding text). */}
        {cleaned.trim() && (
          <div
            className={`min-w-0 max-w-full rounded-2xl px-4 py-3 ${
              isAssistant
                ? "rounded-tl-sm border border-ink-700/70 bg-ink-850/80 text-slate-200"
                : "rounded-tr-sm bg-gradient-to-br from-electric to-electric/80 text-white"
            }`}
          >
            {isAssistant ? (
              <Markdown content={cleaned} />
            ) : (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {cleaned}
              </p>
            )}
          </div>
        )}

        {/* Interactive choice blocks (assistant only) */}
        {isAssistant && blocks.length > 0 && (
          <div className="mt-1 w-full max-w-full space-y-2">
            {blocks.map((block, i) => {
              const key = `${message.id}-choice-${i}`;
              const answered = message.answeredChoices?.[String(i)];
              return (
                <ChoiceBlock
                  key={key}
                  data={block}
                  answered={answered}
                  disabled={interactionsDisabled || message.streaming}
                  onSubmit={(text) => onChoiceSubmit?.(text)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex animate-fade-up gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-deep shadow-glow">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="flex flex-col items-start">
        <div className="mb-1 px-1">
          <span className="text-xs font-semibold text-slate-300">Meridian</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-ink-700/70 bg-ink-850/80 px-4 py-4">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent [animation-delay:200ms]" />
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}
