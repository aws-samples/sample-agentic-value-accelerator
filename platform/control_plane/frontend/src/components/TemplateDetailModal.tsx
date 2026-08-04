import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { downloadTemplate } from '../api/client';
import type { Template } from '../types';

interface TemplateDetailModalProps {
  template: Template;
  onClose: () => void;
}

export default function TemplateDetailModal({ template, onClose }: TemplateDetailModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const blob = await downloadTemplate(template.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.id}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const tier = template.tier || 'starter';
  const includes = template.includes || { infra: true, agent_code: false, ui: false, tests: false };
  const frameworkNames: string[] = template.frameworks_list || [];
  const iacOptions: string[] = template.iac_options || [];

  const tierColors: Record<string, string> = {
    starter: 'bg-blue-100 text-blue-700',
    infrastructure: 'bg-slate-100 text-slate-600',
    code: 'bg-purple-100 text-purple-700',
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200/60">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-100 px-6 py-5 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${tierColors[tier] || tierColors.starter}`}>
                  {tier}
                </span>
                {template.category && (
                  <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                    {template.category.replace(/_/g, ' ').toUpperCase()}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-slate-900">{template.name}</h2>
            </div>
            <button onClick={onClose} className="ml-4 p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Description */}
            <p className="text-slate-600 leading-relaxed">{template.description}</p>

            {/* Pattern (for starters) */}
            {template.pattern_description && (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-2">Pattern</h3>
                <p className="text-sm text-blue-900 leading-relaxed">{template.pattern_description}</p>
              </div>
            )}

            {/* Includes */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Includes</h3>
              <div className="flex gap-4">
                {([['infra', 'Infrastructure'], ['agent_code', 'Agent Code'], ['ui', 'UI'], ['tests', 'Tests']] as const).map(([key, label]) => (
                  <div key={key} className={`flex items-center gap-1.5 text-sm font-medium ${
                    includes[key] ? 'text-emerald-600' : 'text-slate-300'
                  }`}>
                    {includes[key] ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>
                    )}
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resources Created */}
            {template.resources && template.resources.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Resources Created</h3>
                <div className="space-y-2">
                  {template.resources.map(resource => (
                    <div key={resource.name} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{resource.name}</div>
                        <div className="text-xs text-slate-500">{resource.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frameworks + IaC in one row */}
            {(frameworkNames.length > 0 || iacOptions.length > 0) && (
              <div className="flex gap-8">
                {frameworkNames.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Frameworks</h3>
                    <div className="flex flex-wrap gap-2">
                      {frameworkNames.map(name => (
                        <span key={name} className="inline-block px-2.5 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg border border-blue-200 font-medium capitalize">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {iacOptions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">IaC</h3>
                    <div className="flex flex-wrap gap-2">
                      {iacOptions.map(name => (
                        <span key={name} className="inline-block px-2.5 py-1 text-sm bg-slate-50 text-slate-600 rounded-lg border border-slate-200 font-medium capitalize">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AWS Services */}
            {template.aws_services && template.aws_services.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AWS Services</h3>
                <div className="flex flex-wrap gap-2">
                  {template.aws_services.map(service => (
                    <span key={service} className="inline-block px-2.5 py-1 text-xs bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                      {service}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Built With */}
            {template.built_with && template.built_with.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Built With</h3>
                <div className="flex flex-wrap gap-2">
                  {template.built_with.map(item => (
                    <span key={item} className="inline-block px-2.5 py-1 text-sm bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Learn More / References */}
            {template.learn_more && template.learn_more.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Learn More</h3>
                <div className="space-y-2">
                  {template.learn_more.map((link: {title: string; url: string}) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
                    >
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      <span className="text-sm text-slate-700 group-hover:text-blue-700 font-medium">{link.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {template.tags && template.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map(tag => (
                    <span key={tag} className="inline-block px-2 py-0.5 text-xs bg-slate-50 text-slate-500 rounded border border-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">Close</button>
            <button onClick={handleDownload} className="btn-primary">
              <svg className="w-4 h-4 mr-1.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
