"use client";

import { useState } from "react";
import { Check, Pencil, Send } from "lucide-react";
import { ChoiceBlockData, ChoiceOption } from "@/lib/types";

/**
 * Interactive answer chooser rendered below an assistant message that
 * contained a fenced ```choices``` block.
 *
 *  - Single choice (multi=false)              → click to send the option's `label`.
 *  - Multi choice  (multi=true)               → toggle + Submit; sends comma-joined labels.
 *  - allow_free_text=true                     → "Other — type your own answer" pill that
 *                                               expands an inline input. Also activates
 *                                               automatically when an option's `id` is "other".
 *
 * Once answered, the block becomes read-only: the chosen option(s) stay
 * highlighted with a check, and other buttons are disabled. This preserves
 * the intent in the conversation history.
 */
export interface ChoiceBlockProps {
  data: ChoiceBlockData;
  /** Pre-recorded answer (e.g., from message state) — disables the block. */
  answered?: string;
  /** Disable interaction (e.g., while a previous reply is still streaming). */
  disabled?: boolean;
  /** Called with the text to send back as the user's next message. */
  onSubmit: (value: string) => void;
}

export function ChoiceBlock({
  data,
  answered,
  disabled,
  onSubmit,
}: ChoiceBlockProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFreeText, setShowFreeText] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [localAnswer, setLocalAnswer] = useState<string | undefined>(answered);

  const isAnswered = Boolean(localAnswer);
  const isLocked = isAnswered || disabled;

  const submit = (value: string) => {
    if (isLocked) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setLocalAnswer(trimmed);
    onSubmit(trimmed);
  };

  const handlePick = (opt: ChoiceOption) => {
    if (isLocked) return;
    if (data.multi) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(opt.id)) next.delete(opt.id);
        else next.add(opt.id);
        return next;
      });
      return;
    }
    // Single-choice: an option marked as "other" expands the free-text input
    // (only when the block actually allows free text).
    if (data.allow_free_text && /^other$/i.test(opt.id)) {
      setShowFreeText(true);
      return;
    }
    submit(opt.label);
  };

  const handleSubmitMulti = () => {
    const labels = data.options
      .filter((o) => selected.has(o.id))
      .map((o) => o.label)
      .join(", ");
    submit(labels);
  };

  const isOptionSelected = (opt: ChoiceOption): boolean => {
    if (isAnswered && localAnswer) {
      // Highlight option(s) whose label appears in the answer string.
      return localAnswer.split(",").map((s) => s.trim()).includes(opt.label);
    }
    return selected.has(opt.id);
  };

  return (
    <div className="mt-3 rounded-xl border border-ink-700/60 bg-ink-850/40 p-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {data.multi ? "Select one or more" : "Choose an option"}
      </p>

      <div className="flex flex-wrap gap-2">
        {data.options.map((opt) => {
          const picked = isOptionSelected(opt);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handlePick(opt)}
              disabled={isLocked}
              className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                picked
                  ? "border-accent/60 bg-accent/15 text-accent-soft"
                  : isLocked
                    ? "border-ink-700/60 bg-ink-900/40 text-slate-500"
                    : "border-ink-700 bg-ink-900 text-slate-300 hover:border-accent/40 hover:bg-accent/10 hover:text-accent-soft active:scale-[0.98]"
              } ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {data.multi && (
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    picked
                      ? "border-accent bg-accent text-white"
                      : "border-slate-500 bg-transparent"
                  }`}
                >
                  {picked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              )}
              {!data.multi && picked && (
                <Check className="h-3.5 w-3.5 text-accent-soft" strokeWidth={3} />
              )}
              <span>{opt.label}</span>
            </button>
          );
        })}

        {/* "Type your own answer" pill — for single-choice blocks that allow
            free text but don't already have an explicit `other` option that
            triggers the input. */}
        {data.allow_free_text &&
          !data.multi &&
          !data.options.some((o) => /^other$/i.test(o.id)) &&
          !showFreeText && (
            <button
              type="button"
              onClick={() => !isLocked && setShowFreeText(true)}
              disabled={isLocked}
              className={`flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm font-medium transition-all ${
                isLocked
                  ? "cursor-not-allowed border-ink-700/60 text-slate-500"
                  : "cursor-pointer border-slate-600 text-slate-400 hover:border-accent/40 hover:text-accent-soft"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Type your own answer
            </button>
          )}
      </div>

      {/* Inline free-text editor */}
      {showFreeText && !isAnswered && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 p-1.5 focus-within:border-accent/50">
          <input
            type="text"
            autoFocus
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(freeText);
              }
            }}
            placeholder="Type your answer…"
            className="flex-1 bg-transparent px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            disabled={isLocked}
          />
          <button
            type="button"
            onClick={() => submit(freeText)}
            disabled={isLocked || !freeText.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send answer"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Multi-choice submit button */}
      {data.multi && !isAnswered && selected.size > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleSubmitMulti}
            disabled={isLocked}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent to-accent-deep px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
              {selected.size}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
