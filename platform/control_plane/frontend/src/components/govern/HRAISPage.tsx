/**
 * HRAISPage — Full HRAIS Risk Assessment page wrapper
 */

import { Link } from 'react-router-dom';
import HRAISAssessment from './HRAISAssessment';

export default function HRAISPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">EU AI Act Assessment</h1>
            <p className="text-slate-500 mt-1 max-w-2xl">
              High-Risk AI System (HRAIS) assessment methodology for agentic AI governance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-1 rounded bg-violet-100 text-violet-700 font-medium">
              EU AI Act Compliant
            </span>
            <span className="text-xs text-slate-400">
              Updated {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>

        <HRAISAssessment />
      </div>
    </div>
  );
}
