"use client";

import {
  Plus,
  FolderOpen,
  Grid3x3,
  Sparkles,
  Settings,
  ChevronRight,
  X,
} from "lucide-react";
import { savedReports } from "@/lib/mockData";
import { SavedReport } from "@/lib/types";

type View = "chat" | "matrix" | "report";

const statusStyles: Record<SavedReport["status"], string> = {
  draft: "bg-slate-500/15 text-slate-400",
  ready: "bg-electric/15 text-electric-soft",
  shared: "bg-accent/15 text-accent-soft",
};

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ activeView, onNavigate, onNewChat, open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed z-40 flex h-full w-72 flex-col border-r border-ink-700/60 bg-ink-900 transition-transform duration-300 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-white">Meridian</p>
              <p className="text-[11px] leading-tight text-slate-500">Sales Copilot</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-700/60 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* New chat */}
        <div className="px-3">
          <button
            onClick={onNewChat}
            className="group flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-deep px-3.5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-5 space-y-1 px-3">
          <NavItem
            icon={<FolderOpen className="h-[18px] w-[18px]" />}
            label="Saved Reports"
            active={false}
            badge={savedReports.length}
          />
          <NavItem
            icon={<Grid3x3 className="h-[18px] w-[18px]" />}
            label="Solution Matrix"
            active={activeView === "matrix"}
            onClick={() => onNavigate("matrix")}
          />
        </nav>

        {/* Saved reports list */}
        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Recent
          </p>
          <div className="scroll-thin -mr-1 flex-1 space-y-1 overflow-y-auto pr-1">
            {savedReports.map((r) => (
              <button
                key={r.id}
                onClick={() => onNavigate("report")}
                className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-700/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">{r.client}</p>
                  <p className="truncate text-xs text-slate-500">{r.title}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] text-slate-600">{r.date}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusStyles[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* User profile */}
        <div className="border-t border-ink-700/60 p-3">
          <button className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-ink-700/50">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-electric to-electric-soft text-sm font-semibold text-white">
              JR
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-white">Jordan Reyes</p>
              <p className="truncate text-xs text-slate-500">Sales Engineer</p>
            </div>
            <Settings className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-ink-700/70 text-white"
          : "text-slate-400 hover:bg-ink-700/40 hover:text-slate-200"
      }`}
    >
      <span className={active ? "text-accent-soft" : ""}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined ? (
        <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
          {badge}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
