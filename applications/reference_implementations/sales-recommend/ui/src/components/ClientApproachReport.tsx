"use client";

import {
  ArrowLeft,
  Printer,
  Share2,
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  TrendingUp,
  Layers,
  Cpu,
  Database,
  Shield,
  Sparkles,
} from "lucide-react";
import { reportInsights } from "@/lib/mockData";

interface ClientApproachReportProps {
  onBack: () => void;
}

export function ClientApproachReport({ onBack }: ClientApproachReportProps) {
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-slate-100">
      {/* Sticky toolbar */}
      <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800">
              <Share2 className="h-4 w-4" />
              Share with client
            </button>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Cover */}
        <header className="print-surface relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-850 to-ink-800 p-8 text-white shadow-card sm:p-10">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-electric/15 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-soft">
              <Sparkles className="h-3.5 w-3.5" />
              Client Approach Report
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Northbridge Capital — Low-Latency Execution Stack
            </h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              A phased modernization plan that delivers sub-50µs order routing while
              preserving inline pre-trade risk controls and zero downtime to live trading.
            </p>

            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Meta icon={<Building2 className="h-4 w-4" />} label="Client" value="Northbridge Capital" />
              <Meta icon={<Calendar className="h-4 w-4" />} label="Prepared" value="Jun 8, 2026" />
              <Meta icon={<Sparkles className="h-4 w-4" />} label="Prepared by" value="Jordan Reyes" />
            </div>
          </div>
        </header>

        {/* Executive Summary */}
        <Section title="Executive Summary" eyebrow="01">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <p className="text-[17px] leading-relaxed text-slate-700">
              Northbridge&apos;s legacy in-house OMS is the structural bottleneck behind their
              execution latency. By co-locating <strong className="text-slate-900">VeloCore OMS</strong>{" "}
              in their primary exchange data center and pairing it with{" "}
              <strong className="text-slate-900">StreamGrid</strong> normalized market data and{" "}
              <strong className="text-slate-900">Sentinel RT</strong> inline risk, we can take
              round-trip routing latency from <strong className="text-slate-900">~280µs to under 50µs</strong>{" "}
              without compromising on pre-trade controls.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KPI label="Target Latency" value="<50µs" tone="emerald" />
              <KPI label="Migration Window" value="14 weeks" tone="blue" />
              <KPI label="Trading Downtime" value="0 hours" tone="emerald" />
            </div>
          </div>
        </Section>

        {/* Architecture Diagram */}
        <Section title="Technical Architecture" eyebrow="02">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <ArchitectureDiagram />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ArchPill icon={<Cpu className="h-4 w-4" />} label="Co-located OMS" value="VeloCore" />
              <ArchPill icon={<Database className="h-4 w-4" />} label="Data Feed" value="StreamGrid" />
              <ArchPill icon={<Shield className="h-4 w-4" />} label="Risk" value="Sentinel RT" />
              <ArchPill icon={<Layers className="h-4 w-4" />} label="Post-Trade" value="ClearPath" />
            </div>
          </div>
        </Section>

        {/* Impact Charts */}
        <Section title="Projected Impact" eyebrow="03">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <ChartCard title="Latency Reduction" subtitle="Round-trip µs">
              <BarChart
                bars={[
                  { label: "Today", value: 280, color: "bg-slate-300", text: "280µs" },
                  { label: "Phase 1", value: 110, color: "bg-electric", text: "110µs" },
                  { label: "Phase 2", value: 48, color: "bg-accent", text: "48µs" },
                ]}
                max={300}
              />
            </ChartCard>

            <ChartCard title="Efficiency Gains" subtitle="Across desks">
              <DonutChart pct={reportInsights.metrics[2].value} />
            </ChartCard>

            <ChartCard title="3-Year ROI" subtitle="vs. current run-rate">
              <ROIChart points={[18, 42, 76, 124, 178, 240]} />
            </ChartCard>
          </div>
        </Section>

        {/* Action items */}
        <Section title="Sales Action Items" eyebrow="04">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <ul className="space-y-2">
              {[
                { done: true, text: "Confirm exchange co-location requirements with Northbridge infra lead" },
                { done: true, text: "Share VeloCore latency benchmark whitepaper" },
                { done: false, text: "Schedule technical deep-dive with Northbridge engineering team" },
                { done: false, text: "Provision proof-of-concept environment in target data center" },
                { done: false, text: "Draft phased migration & shadow-mode timeline" },
                { done: false, text: "Loop in Sentinel RT product team for risk policy walk-through" },
              ].map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-300" />
                  )}
                  <span
                    className={`text-[15px] ${
                      item.done ? "text-slate-400 line-through" : "text-slate-700"
                    }`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          Prepared with Meridian · Financial Services Sales Copilot · Confidential
        </footer>
      </article>
    </div>
  );
}

/* ----- Sub-components ----- */

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-300">
      <span className="text-accent-soft">{icon}</span>
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-xs font-bold tracking-widest text-emerald-600">
          {eyebrow}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: "emerald" | "blue" }) {
  const map = {
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    blue: "from-blue-50 to-white border-blue-200 text-blue-700",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${map[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ArchPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-emerald-600 shadow-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  const Node = ({
    title,
    sub,
    tone,
  }: {
    title: string;
    sub: string;
    tone: "client" | "edge" | "core" | "out";
  }) => {
    const map = {
      client: "border-slate-300 bg-white text-slate-800",
      edge: "border-blue-300 bg-blue-50 text-blue-900",
      core: "border-emerald-300 bg-emerald-50 text-emerald-900",
      out: "border-slate-300 bg-slate-50 text-slate-700",
    };
    return (
      <div
        className={`flex min-w-[140px] flex-1 flex-col items-center rounded-xl border-2 px-3 py-3 text-center ${map[tone]}`}
      >
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] opacity-70">{sub}</p>
      </div>
    );
  };

  const Arrow = () => (
    <div className="flex flex-1 items-center justify-center">
      <div className="hidden h-px flex-1 border-t-2 border-dashed border-slate-300 sm:block" />
      <div className="my-2 h-6 w-px border-l-2 border-dashed border-slate-300 sm:hidden" />
    </div>
  );

  return (
    <div className="rounded-xl bg-slate-50 p-4 sm:p-6">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Node title="Northbridge" sub="Trading Desk" tone="client" />
        <Arrow />
        <Node title="VeloCore OMS" sub="Co-located · <40µs" tone="edge" />
        <Arrow />
        <Node title="Sentinel RT" sub="Inline Risk" tone="core" />
        <Arrow />
        <Node title="Exchange" sub="Matching Engine" tone="out" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Caption tone="bg-blue-100 text-blue-700">StreamGrid feed →</Caption>
        <Caption tone="bg-emerald-100 text-emerald-700">Pre-trade checks</Caption>
        <Caption tone="bg-slate-100 text-slate-700">FIX 5.0 / Binary</Caption>
        <Caption tone="bg-slate-100 text-slate-700">ClearPath ←</Caption>
      </div>
    </div>
  );
}

function Caption({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-md px-2 py-1 text-center text-[11px] font-medium ${tone}`}>
      {children}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <TrendingUp className="h-4 w-4 text-emerald-500" />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BarChart({
  bars,
  max,
}: {
  bars: { label: string; value: number; color: string; text: string }[];
  max: number;
}) {
  return (
    <div className="flex h-40 items-end gap-3">
      {bars.map((b, i) => {
        const h = Math.max(8, (b.value / max) * 100);
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-700">{b.text}</p>
            <div className="relative flex w-full flex-1 items-end">
              <div
                className={`w-full origin-bottom animate-grow-bar rounded-t-md ${b.color}`}
                style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{b.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ pct }: { pct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} stroke="#e2e8f0" strokeWidth="10" fill="none" />
          <circle
            cx="50"
            cy="50"
            r={r}
            stroke="url(#grad)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold text-slate-800">{pct}%</p>
          <p className="text-[11px] text-slate-500">across desks</p>
        </div>
      </div>
    </div>
  );
}

function ROIChart({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - (p / max) * 90;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  const area = `${path} L100,100 L0,100 Z`;
  return (
    <div className="relative h-40 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#area)" />
        <path d={path} stroke="#10b981" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => {
          const x = (i / (points.length - 1)) * 100;
          const y = 100 - (p / max) * 90;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.4"
              fill="#fff"
              stroke="#10b981"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-1 left-0 right-0 flex justify-between text-[10px] text-slate-500">
        <span>Q1</span>
        <span>Q2</span>
        <span>Q3</span>
        <span>Q4</span>
        <span>Y2</span>
        <span>Y3</span>
      </div>
    </div>
  );
}
