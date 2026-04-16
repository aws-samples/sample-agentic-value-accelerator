import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Template } from '../types';

interface TemplateDetailModalProps {
  template: Template;
  onClose: () => void;
}

export default function TemplateDetailModal({ template, onClose }: TemplateDetailModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleUseTemplate = () => {
    onClose();
    navigate('/deployments/create', { state: { templateId: template.id } });
  };

  const patternTypeColors: Record<string, string> = {
    single_agent: 'bg-blue-50 text-blue-700 border-blue-200',
    orchestration: 'bg-violet-50 text-violet-700 border-violet-200',
    rag: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    tool_calling: 'bg-amber-50 text-amber-700 border-amber-200',
    conversational: 'bg-pink-50 text-pink-700 border-pink-200',
  };

  const patternTypeColor = patternTypeColors[template.pattern_type] || 'bg-slate-50 text-slate-700 border-slate-200';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative bg-white rounded-xl  max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200/60 animate-fade-in-scale" style={{ animationDuration: '0.2s' }}>
          {/* Header */}
          <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-5 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">{template.name}</h2>
                <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${patternTypeColor}`}>
                  {template.pattern_type.replace('_', ' ').toUpperCase()}
                </span>
                <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg">v{template.version}</span>
              </div>
              <p className="text-slate-500 leading-relaxed">{template.description}</p>
            </div>
            <button onClick={onClose} className="ml-4 p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {template.frameworks && template.frameworks.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Supported Frameworks</h3>
                <div className="space-y-2">
                  {template.frameworks.map(framework => (
                    <div key={framework.id} className="p-3.5 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                      <div className="font-semibold text-slate-900">{framework.name}</div>
                      <div className="text-sm text-slate-500 mt-1">{framework.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {template.deployment_patterns && template.deployment_patterns.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Deployment Options</h3>
                <div className="space-y-2">
                  {template.deployment_patterns.map(pattern => (
                    <div key={pattern.id} className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                      <div className="font-semibold text-slate-900">{pattern.name}</div>
                      <div className="text-sm text-slate-500 mt-1">{pattern.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Infrastructure Components</h3>
              <div className="p-4 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                <p className="text-sm font-semibold text-blue-900 mb-3">This template deploys the following AWS resources:</p>
                <div className="space-y-2.5">
                  {[
                    { icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2', name: 'AgentCore Gateway', desc: 'Managed API endpoint for agent invocation and routing', color: 'indigo' },
                    { icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z', name: 'AgentCore Runtime', desc: 'Managed container execution environment on AWS Bedrock', color: 'indigo' },
                    { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', name: 'IAM Roles & Policies', desc: 'Bedrock model access, S3, and CloudWatch Logs permissions', color: 'indigo' },
                  ].map((item) => (
                    <div key={item.name} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-xl bg-${item.color}-100 flex items-center justify-center`}>
                        <svg className={`w-4 h-4 text-${item.color}-700`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} /></svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                  {template.pattern_type === 'rag' && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">OpenSearch Domain</div>
                          <div className="text-xs text-slate-500">Vector store for document embeddings and similarity search</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">S3 Document Bucket</div>
                          <div className="text-xs text-slate-500">Versioned storage for source documents with encryption</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {template.example_use_cases && template.example_use_cases.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Example Use Cases</h3>
                <ul className="space-y-2">
                  {template.example_use_cases.map((useCase, index) => (
                    <li key={index} className="flex items-start text-slate-600">
                      <span className="text-blue-400 mr-3 mt-1">•</span>
                      <span>{useCase}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {template.parameters && template.parameters.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Configuration Parameters</h3>
                <div className="space-y-2">
                  {template.parameters.map(param => (
                    <div key={param.name} className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">
                            {param.name}
                            {param.required && <span className="ml-2 text-xs text-red-500 font-semibold">Required</span>}
                          </div>
                          {param.description && <div className="text-sm text-slate-500 mt-1">{param.description}</div>}
                        </div>
                        <span className="ml-3 text-xs font-semibold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200">{param.type}</span>
                      </div>
                      {param.default !== undefined && (
                        <div className="text-xs text-slate-400 mt-2">
                          Default: <span className="font-mono bg-white px-1.5 py-0.5 rounded-md border border-slate-200 text-slate-600">{String(param.default)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {template.tags && template.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map(tag => (
                    <span key={tag} className="inline-block px-3 py-1 text-sm bg-slate-50 text-slate-600 rounded-lg border border-slate-200">#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {template.architecture_diagram && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Architecture</h3>
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl">
                  <p className="text-sm text-slate-600">{template.architecture_diagram}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">Close</button>
            <button onClick={handleUseTemplate} className="btn-primary">Deploy This Template</button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
