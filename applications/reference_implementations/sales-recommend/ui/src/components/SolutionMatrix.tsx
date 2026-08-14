"use client";

import { Grid3x3, Search, ArrowLeft } from "lucide-react";
import { solutionMatrix } from "@/lib/mockData";
import { SolutionRow } from "@/lib/types";

const fitStyles: Record<SolutionRow["fit"], string> = {
  High: "bg-accent/15 text-accent-soft border-accent/30",
  Medium: "bg-electric/15 text-electric-soft border-electric/30",
  Exploratory: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export function SolutionMatrix({ onBack }: { onBack: () => void }) {
  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-ink-950">
      <header className="border-b border-ink-700/60 bg-ink-900/80 px-6 py-5 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to chat
        </button>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric-soft">
              <Grid3x3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Solution Matrix</h1>
              <p className="text-sm text-slate-400">
                Financial services product fit by capability
              </p>
            </div>
          </div>
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search products…"
              className="w-72 rounded-lg border border-ink-700 bg-ink-850 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-900 shadow-card">
          <table className="w-full">
            <thead className="bg-ink-850">
              <tr>
                {["Capability", "Recommended Product", "Latency", "Fit"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solutionMatrix.map((row, i) => (
                <tr
                  key={row.product}
                  className={`border-t border-ink-700/60 transition-colors hover:bg-ink-850/60 ${
                    i % 2 === 0 ? "" : "bg-ink-900"
                  }`}
                >
                  <td className="px-5 py-4 text-sm font-medium text-slate-200">
                    {row.capability}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-white">{row.product}</span>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-accent-soft">{row.latency}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${fitStyles[row.fit]}`}
                    >
                      {row.fit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
