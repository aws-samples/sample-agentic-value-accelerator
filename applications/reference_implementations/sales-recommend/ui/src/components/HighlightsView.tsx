"use client";

import {
  Search,
  TrendingUp,
  Zap,
  ShieldAlert,
  Users,
  Highlighter,
  Target,
  BadgeCheck,
  Scale,
  Tag,
} from "lucide-react";
import { Highlight, HighlightsBlock } from "@/lib/types";
import { groupHighlightsByCategory } from "@/lib/highlights";

/**
 * Renders a HighlightsBlock as a vertical, category-grouped stack of cards.
 * Lives inside the right ReportPreviewPanel.
 */
export function HighlightsView({ block }: { block: HighlightsBlock }) {
  const groups = groupHighlightsByCategory(block.points);

  return (
    <div className="space-y-5">
      {block.title && (
        <div className="rounded-xl border border-ink-700/60 bg-gradient-to-br from-ink-850 to-ink-900 p-4">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
            <Highlighter className="h-3.5 w-3.5" />
            Highlights
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-white">
            {block.title}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {block.points.length} highlight{block.points.length === 1 ? "" : "s"} ·{" "}
            {groups.length} categor{groups.length === 1 ? "y" : "ies"}
          </p>
        </div>
      )}

      {groups.map(({ category, points }) => (
        <CategoryGroup key={category} category={category} points={points} />
      ))}
    </div>
  );
}

/* --------------------------- Category styling --------------------------- */

interface CategoryStyle {
  icon: React.ReactNode;
  badge: string;
  border: string;
  blurb: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  // ---- Customer-facing vocabulary (current) ----
  Highlight: {
    icon: <Highlighter className="h-3.5 w-3.5" />,
    badge: "bg-accent/15 text-accent-soft",
    border: "border-l-accent/60",
    blurb: "Lead with this",
  },
  Outcome: {
    icon: <Target className="h-3.5 w-3.5" />,
    badge: "bg-electric/15 text-electric-soft",
    border: "border-l-electric/60",
    blurb: "What the customer gains",
  },
  Fact: {
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
    badge: "bg-cyan-500/15 text-cyan-300",
    border: "border-l-cyan-400/60",
    blurb: "Concrete proof point",
  },
  "Trade-off": {
    icon: <Scale className="h-3.5 w-3.5" />,
    badge: "bg-amber-500/15 text-amber-300",
    border: "border-l-amber-400/60",
    blurb: "Caveat or limitation",
  },

  // ---- Legacy sales-side vocabulary (kept for backwards compat) ----
  Discovery: {
    icon: <Search className="h-3.5 w-3.5" />,
    badge: "bg-electric/15 text-electric-soft",
    border: "border-l-electric/60",
    blurb: "What to learn about the customer",
  },
  Value: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    badge: "bg-accent/15 text-accent-soft",
    border: "border-l-accent/60",
    blurb: "What the customer gains",
  },
  Differentiator: {
    icon: <Zap className="h-3.5 w-3.5" />,
    badge: "bg-violet-500/15 text-violet-300",
    border: "border-l-violet-400/60",
    blurb: "What makes this different",
  },
  Objection: {
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    badge: "bg-amber-500/15 text-amber-300",
    border: "border-l-amber-400/60",
    blurb: "Concerns to address upfront",
  },
  Champion: {
    icon: <Users className="h-3.5 w-3.5" />,
    badge: "bg-cyan-500/15 text-cyan-300",
    border: "border-l-cyan-400/60",
    blurb: "Stakeholders who'll back this",
  },
};

const DEFAULT_STYLE: CategoryStyle = {
  icon: <Tag className="h-3.5 w-3.5" />,
  badge: "bg-slate-500/15 text-slate-300",
  border: "border-l-slate-400/60",
  blurb: "",
};

function styleFor(category: string): CategoryStyle {
  return (
    CATEGORY_STYLES[category] ??
    CATEGORY_STYLES[category.toLowerCase()] ??
    DEFAULT_STYLE
  );
}

function CategoryGroup({
  category,
  points,
}: {
  category: string;
  points: Highlight[];
}) {
  const style = styleFor(category);
  return (
    <section>
      <header className="mb-2 flex items-center gap-2 px-1">
        <span
          className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold uppercase tracking-wider ${style.badge}`}
        >
          {style.icon}
          {category}
        </span>
        {style.blurb && (
          <span className="text-[11px] text-slate-500">{style.blurb}</span>
        )}
        <span className="ml-auto text-[10px] text-slate-600">
          {points.length}
        </span>
      </header>
      <div className="space-y-2">
        {points.map((p) => (
          <PointCard key={p.id} point={p} style={style} />
        ))}
      </div>
    </section>
  );
}

function PointCard({
  point,
  style,
}: {
  point: Highlight;
  style: CategoryStyle;
}) {
  return (
    <article
      className={`rounded-xl border border-ink-700/60 bg-ink-850/60 p-3 pl-3.5 transition-colors hover:border-ink-600 hover:bg-ink-850 ${style.border} border-l-2`}
    >
      <h4 className="text-[13px] font-semibold leading-snug text-white">
        {point.label}
      </h4>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
        {point.detail}
      </p>
    </article>
  );
}
