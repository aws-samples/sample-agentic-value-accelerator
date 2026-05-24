'use client';

import { useState, useRef } from 'react';

interface ReviewResult {
  report_type: string;
  completeness_score: number;
  missing_sections: string[];
  missing_fields: string[];
  language_score: number;
  language_issues: string[];
  language_suggestions: string[];
  quality_score: number;
  quality_level: string;
  strengths: string[];
  revisions: string[];
  summary: string;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? 'text-green-600' : score >= 70 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function ReportReview() {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/review', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const qualityBadge: Record<string, string> = {
    pass: 'bg-green-100 text-green-800',
    needs_revision: 'bg-yellow-100 text-yellow-800',
    fail: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Regulatory Report Reviewer</h2>
        <p className="text-gray-500 text-sm mt-1">Upload a draft filing for AI-powered compliance review</p>
      </div>

      {/* Upload form */}
      <form onSubmit={handleUpload} className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,.json"
            className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Reviewing...' : 'Submit for Review'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Supports: SAR, CTR, SEC 10-K/10-Q, Call Reports (.txt, .md, .pdf, .docx, .json)</p>
      </form>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">{error}</div>}

      {result && (
        <>
          {/* Scores */}
          <div className="bg-white rounded-lg border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Review Results</h3>
                <p className="text-sm text-gray-500">{fileName} — detected as <span className="font-medium uppercase">{result.report_type}</span></p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${qualityBadge[result.quality_level] || ''}`}>
                {result.quality_level.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-8 py-4 border-t">
              <ScoreRing score={result.completeness_score} label="Completeness" />
              <ScoreRing score={result.language_score} label="Language" />
              <ScoreRing score={result.quality_score} label="Quality" />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-1">Summary</h3>
            <p className="text-blue-800 text-sm">{result.summary}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            {result.strengths?.length > 0 && (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-green-700 mb-2">✓ Strengths</h3>
                <ul className="text-sm space-y-1">
                  {result.strengths.map((s, i) => <li key={i} className="text-gray-700">• {s}</li>)}
                </ul>
              </div>
            )}

            {/* Revisions needed */}
            {result.revisions?.length > 0 && (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-red-700 mb-2">✗ Revisions Needed</h3>
                <ul className="text-sm space-y-1">
                  {result.revisions.map((r, i) => <li key={i} className="text-gray-700">• {r}</li>)}
                </ul>
              </div>
            )}

            {/* Language issues */}
            {result.language_issues?.length > 0 && (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-orange-700 mb-2">Language Issues</h3>
                <ul className="text-sm space-y-1">
                  {result.language_issues.map((l, i) => <li key={i} className="text-gray-700">• {l}</li>)}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {result.language_suggestions?.length > 0 && (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-blue-700 mb-2">Suggestions</h3>
                <ul className="text-sm space-y-1">
                  {result.language_suggestions.map((s, i) => <li key={i} className="text-gray-700">• {s}</li>)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Upload a regulatory filing to get an AI-powered compliance review</p>
        </div>
      )}
    </div>
  );
}
