import { useState } from 'react';
import { downloadReport, type ReportDefinition } from '../lib/pdf';

type Variant = 'solid' | 'subtle' | 'link';

interface Props {
  /** Built lazily so the PDF is only assembled on click. */
  getDefinition: () => ReportDefinition;
  label?: string;
  variant?: Variant;
  className?: string;
  title?: string;
}

const VARIANTS: Record<Variant, string> = {
  solid:
    'px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0',
  subtle:
    'px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all disabled:opacity-60',
  link:
    'text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-100 disabled:opacity-60',
};

/**
 * Shared "Export PDF" action for Plan records. Works from list cards or a
 * detail drawer — pass a `getDefinition` that returns the record's
 * ReportDefinition (see each module's report.ts adapter).
 */
export default function ExportReportButton({
  getDefinition,
  label = 'Export PDF',
  variant = 'subtle',
  className = '',
  title = 'Download a PDF report',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    // Yield a frame so the busy label paints before the (synchronous) render.
    await new Promise((r) => setTimeout(r, 0));
    try {
      downloadReport(getDefinition());
    } catch (e) {
      console.error('PDF export failed:', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={error ? 'Export failed — try again' : title}
      className={`inline-flex items-center gap-1.5 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      )}
      {busy ? 'Generating…' : error ? 'Retry export' : label}
    </button>
  );
}
