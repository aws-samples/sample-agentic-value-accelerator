"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Users, Mail } from "lucide-react";
import { initialsFromEmail } from "@/lib/userIdentity";

interface Lead {
  email: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  source?: string;
  userAgent?: string;
}

interface LeadsResponse {
  enabled: boolean;
  count: number;
  leads: Lead[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VisitorsView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as LeadsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visitors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-700/60 hover:text-white"
            aria-label="Back to chat"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-electric to-electric-soft">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-white">
                Visitors
              </h1>
              <p className="text-[11px] leading-tight text-slate-500">
                People who shared their email
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-ink-700/50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Body */}
      <div className="scroll-thin flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && data && !data.enabled && (
          <div className="rounded-xl border border-ink-700/60 bg-ink-900 px-4 py-6 text-center text-sm text-slate-400">
            Visitor capture isn&rsquo;t configured for this environment
            (no <code className="text-slate-300">LEADS_TABLE_NAME</code>). Once
            deployed with the leads table, shared emails show up here.
          </div>
        )}

        {!loading && data && data.enabled && data.count === 0 && (
          <div className="rounded-xl border border-ink-700/60 bg-ink-900 px-4 py-6 text-center text-sm text-slate-400">
            No visitors have shared their email yet.
          </div>
        )}

        {data && data.count > 0 && (
          <>
            <p className="mb-3 text-xs text-slate-500">
              {data.count} visitor{data.count === 1 ? "" : "s"}
            </p>
            <div className="overflow-hidden rounded-xl border border-ink-700/60">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-900 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Email</th>
                    <th className="px-4 py-2.5 font-semibold">Visits</th>
                    <th className="px-4 py-2.5 font-semibold">First seen</th>
                    <th className="px-4 py-2.5 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/40">
                  {data.leads.map((lead) => (
                    <tr key={lead.email} className="bg-ink-950 hover:bg-ink-900/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-electric to-electric-soft text-[10px] font-semibold text-white">
                            {initialsFromEmail(lead.email)}
                          </div>
                          <span className="flex items-center gap-1.5 text-slate-200">
                            <Mail className="h-3.5 w-3.5 text-slate-500" />
                            {lead.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{lead.visits}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDate(lead.firstSeen)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDate(lead.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
