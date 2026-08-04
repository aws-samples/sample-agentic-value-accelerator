import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { serviceApprovalApi } from '../../api/client';
import type { ServiceApprovalFileEntry, ServiceApprovalFileTree } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer';

const PHASE_LABELS: Record<string, string> = {
  '01-assess': 'Assess',
  '02-research': 'Research',
  '03-validate': 'Validate',
  '04-map': 'Map',
  '05-generate': 'Generate',
  '06-test': 'Test',
  '07-summarize': 'Summarize',
  '08-evidence': 'Evidence',
};

function languageFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'md': return 'markdown';
    case 'json': return 'json';
    case 'py': return 'python';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'guard': return 'guard';
    case 'tf': return 'terraform';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js': return 'javascript';
    case 'sh': return 'bash';
    case 'rego': return 'rego';
    default: return 'text';
  }
}

function prettyPrintJson(content: string): string {
  try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
}

function CodeBlock({ content, language }: { content: string; language: string }) {
  return (
    <pre className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100 overflow-x-auto leading-relaxed font-mono whitespace-pre">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">{language}</div>
      <code>{content}</code>
    </pre>
  );
}

export default function ServiceOnboardingFileViewer() {
  const { slug, phase } = useParams<{ slug: string; phase: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileParam = searchParams.get('file');

  const [tree, setTree] = useState<ServiceApprovalFileTree | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(fileParam);
  const [content, setContent] = useState<string>('');
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load tree
  useEffect(() => {
    if (!slug || !phase) return;
    let cancelled = false;
    setLoadingTree(true);
    setError(null);
    serviceApprovalApi.listFiles(slug, phase)
      .then(t => {
        if (cancelled) return;
        setTree(t);
        const flat = t.groups.flatMap(g => g.files);
        if (!activeFile && flat.length > 0) setActiveFile(flat[0].path);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingTree(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, phase]);

  // Sync ?file= in URL with activeFile
  useEffect(() => {
    if (activeFile && fileParam !== activeFile) {
      setSearchParams({ file: activeFile }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // Load content
  useEffect(() => {
    if (!slug || !activeFile) { setContent(''); return; }
    let cancelled = false;
    setLoadingContent(true);
    serviceApprovalApi.getFile(slug, activeFile)
      .then(f => { if (!cancelled) setContent(f.content); })
      .catch(e => { if (!cancelled) { setContent(`Unable to load file.\n${e.message}`); } })
      .finally(() => { if (!cancelled) setLoadingContent(false); });
    return () => { cancelled = true; };
  }, [slug, activeFile]);

  const lang = useMemo(() => activeFile ? languageFor(activeFile) : 'text', [activeFile]);
  const displayContent = useMemo(() => lang === 'json' ? prettyPrintJson(content) : content, [content, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  if (!slug || !phase) {
    return <div className="p-6 text-sm text-slate-500">Missing run or phase.</div>;
  }

  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const totalFiles = tree?.groups.reduce((acc, g) => acc + g.files.length, 0) ?? 0;
  const isFlat = (tree?.groups.length ?? 0) <= 1;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between animate-fade-in">
          <div>
            <Link
              to={`/secure/service-onboarding/runs/${slug}`}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
            >
              &larr; Back to pipeline
            </Link>
            <div className="mt-1 flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Phase: {phaseLabel}</h1>
              <span className="text-xs font-mono text-slate-400">{slug}</span>
              <span className="text-xs text-slate-500">{totalFiles} file{totalFiles === 1 ? '' : 's'}</span>
            </div>
          </div>
          <a
            href={serviceApprovalApi.downloadPhaseUrl(slug, phase)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            Download Phase (.zip)
          </a>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 animate-fade-in stagger-1">
          {/* File list */}
          <aside className="card !p-0 overflow-hidden h-fit max-h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Files</div>
            </div>
            {loadingTree ? (
              <div className="p-4 text-xs text-slate-400">Loading…</div>
            ) : tree && totalFiles > 0 ? (
              <div className="py-1">
                {tree.groups.map(group => (
                  <div key={group.name} className="py-1">
                    {!isFlat && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {group.name || 'root'}/
                      </div>
                    )}
                    {group.files.map((f: ServiceApprovalFileEntry) => {
                      const baseName = f.path.split('/').pop() ?? f.path;
                      const active = f.path === activeFile;
                      return (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => setActiveFile(f.path)}
                          className={`w-full text-left text-xs px-3 py-1.5 truncate font-mono transition-colors ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                          title={f.path}
                        >
                          {!isFlat && <span className="opacity-50">  </span>}
                          {baseName}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-400">No files yet.</div>
            )}
          </aside>

          {/* Content */}
          <section className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="text-xs font-mono text-slate-700 truncate">{activeFile ?? '—'}</div>
              <div className="flex items-center gap-2">
                {activeFile && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={serviceApprovalApi.downloadFileUrl(slug, activeFile)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Download
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="p-4">
              {loadingContent ? (
                <div className="text-xs text-slate-400">Loading file…</div>
              ) : !activeFile ? (
                <div className="text-xs text-slate-400">Select a file to view its contents.</div>
              ) : lang === 'markdown' ? (
                <div className="prose prose-sm max-w-none">
                  <MarkdownRenderer markdown={displayContent} />
                </div>
              ) : (
                <CodeBlock content={displayContent} language={lang} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
