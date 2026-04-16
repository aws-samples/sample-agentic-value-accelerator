import { useState, useEffect, useRef, useCallback } from 'react';
import { deploymentsApi } from '../api/client';
import LoadingSpinner from './LoadingSpinner';

interface Props {
  deploymentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LogsViewer({ deploymentId, isOpen, onClose }: Props) {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await deploymentsApi.getDeploymentLogs(deploymentId);
      setLogs(data.logs || '');
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchLogs();
  }, [isOpen, fetchLogs]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl  w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col border border-slate-200/60 animate-fade-in-scale" style={{ animationDuration: '0.2s' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">Build Logs</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 ${
                autoScroll
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => { setLoading(true); fetchLogs(); }}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Refresh
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-50">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Logs content */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto bg-slate-950 p-5 rounded-b-2xl"
        >
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm font-mono">{error}</div>
          ) : logs ? (
            <pre className="text-emerald-400 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
              {logs}
            </pre>
          ) : (
            <div className="text-slate-500 text-sm font-mono">No logs available yet.</div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
