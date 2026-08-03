"use client";

import { PanelRightClose, Highlighter } from "lucide-react";
import { HighlightsBlock } from "@/lib/types";
import { HighlightsView } from "./HighlightsView";

interface ReportPreviewPanelProps {
  highlights: HighlightsBlock | null;
  onClose: () => void;
}

export function ReportPreviewPanel({
  highlights,
  onClose,
}: ReportPreviewPanelProps) {
  return (
    <aside className="scroll-thin flex h-full w-full flex-col overflow-y-auto border-l border-ink-700/60 bg-ink-900">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-700/60 bg-ink-900/90 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent-soft">
            <Highlighter className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
              Live Preview
            </p>
            <h2 className="text-sm font-semibold leading-tight text-white">
              Highlights
              {highlights?.points.length ? (
                <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft">
                  {highlights.points.length}
                </span>
              ) : null}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-700/60 hover:text-white"
          aria-label="Close highlights panel"
        >
          <PanelRightClose className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 p-5">
        {highlights ? <HighlightsView block={highlights} /> : <HighlightsEmpty />}
      </div>
    </aside>
  );
}

function HighlightsEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-ink-700/60 bg-ink-850/30 px-4 py-10 text-center">
      <Highlighter className="mx-auto h-8 w-8 text-slate-600" />
      <p className="mt-3 text-sm font-semibold text-slate-300">No highlights yet</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        When Meridian shares a recommendation, the customer-facing highlights
        appear here — what the client gains, how it&apos;s different, and the
        questions worth surfacing.
      </p>
    </div>
  );
}
