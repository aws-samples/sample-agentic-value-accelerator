/**
 * CommandCenter — Aggregated governance view
 *
 * Single pane of glass for executives showing trust scores, compliance,
 * risk exposure, and real-time alerts.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GovernanceCommandCenter from './GovernanceCommandCenter';
import UnifiedGuide, { COMMAND_CENTER_GUIDE } from './UnifiedGuide';
import CoreBadge from './CoreBadge';

export default function CommandCenter() {
  // Genuinely-live clock so the "Live" indicator reflects real elapsed time
  // rather than freezing at mount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Command Center</h1>
              <CoreBadge pillar="see" />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Aggregated governance view — trust scores, compliance posture, risk exposure, and real-time alerts across your entire AI fleet.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Updated {now.toLocaleTimeString()} · <span className="text-emerald-600 font-medium">● Live</span>
          </div>
        </div>

        {/* How to Use / Go Live Guide */}
        <UnifiedGuide {...COMMAND_CENTER_GUIDE} />

        <GovernanceCommandCenter />
      </div>
    </div>
  );
}
