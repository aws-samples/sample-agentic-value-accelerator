/**
 * SetupGuidanceCard — Shows guidance when an AWS service is not configured.
 *
 * Displays:
 * - Service name and status
 * - Setup steps
 * - CLI command (copyable)
 * - Link to AWS docs
 */

import { useState } from 'react';
import type { SetupGuidance } from '../../api/client';

interface Props {
  guidance: SetupGuidance;
  compact?: boolean;
}

export function SetupGuidanceCard({ guidance, compact = false }: Props) {
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    if (guidance.cli_command) {
      await navigator.clipboard.writeText(guidance.cli_command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-amber-800">{guidance.title}</div>
          <div className="text-[10px] text-amber-600">{guidance.service} not configured</div>
        </div>
        <a
          href={guidance.docs_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
        >
          Setup →
        </a>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200/60 p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-amber-900">{guidance.title}</h4>
          <p className="text-xs text-amber-700 mt-0.5">{guidance.service}</p>
        </div>
      </div>

      {guidance.description && (
        <p className="text-xs text-amber-800 mb-4">{guidance.description}</p>
      )}

      <div className="mb-4">
        <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-2">Setup Steps</div>
        <ol className="space-y-1.5">
          {guidance.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="font-mono text-[11px]">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {guidance.cli_command && (
        <div className="mb-4">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Quick Start Command</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[10px] bg-slate-900 text-emerald-400 px-3 py-2 rounded-lg font-mono overflow-x-auto">
              {guidance.cli_command}
            </code>
            <button
              onClick={copyCommand}
              className="px-2 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
              title="Copy command"
            >
              {copied ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {guidance.benefits && guidance.benefits.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Benefits</div>
          <ul className="space-y-1">
            {guidance.benefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-amber-200/60">
        <a
          href={guidance.docs_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          AWS Documentation
        </a>
      </div>
    </div>
  );
}

export default SetupGuidanceCard;
