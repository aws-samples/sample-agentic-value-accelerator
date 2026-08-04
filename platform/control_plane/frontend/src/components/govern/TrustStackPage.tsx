/**
 * TrustStackPage — Three Lines of Defense visualization
 *
 * Dedicated page for the Trust Stack component showing Application,
 * Platform, and Enterprise layer controls.
 */

import { Link } from 'react-router-dom';
import TrustStack3Layer from './TrustStack3Layer';
import UnifiedGuide, { TRUST_STACK_GUIDE } from './UnifiedGuide';

export default function TrustStackPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Trust Stack</h1>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Classify every AI system on two AWS scoping matrices — GenAI sourcing scope (1–5, buy → build) and agentic agency (L1–L4) — then trace the build-side controls, AWS services, and Three Lines of Defense at each layer.
            </p>
          </div>
          <Link
            to="/govern/compliance"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View Compliance Center →
          </Link>
        </div>

        {/* How to Use Guide */}
        <UnifiedGuide {...TRUST_STACK_GUIDE} />

        <TrustStack3Layer />
      </div>
    </div>
  );
}
