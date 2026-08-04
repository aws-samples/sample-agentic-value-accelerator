import { useState, useRef, useEffect } from 'react';
import { downloadTemplate } from '../api/client';
import type { Template } from '../types';

interface TemplateCardProps {
  template: Template;
  onViewDetails: (template: Template) => void;
}

export default function TemplateCard({ template, onViewDetails }: TemplateCardProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = async (iac?: string) => {
    try {
      const blob = await downloadTemplate(template.id, iac);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = iac ? `${template.id}-${iac}.zip` : `${template.id}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const tier = template.tier || 'starter';
  const includes = template.includes || { infra: false, agent_code: false, ui: false, tests: false };

  const frameworkNames: string[] = template.frameworks_list || [];
  const iacNames: string[] = template.iac_options || [];

  return (
    <div className="card hover:border-blue-200 transition-all h-full flex flex-col group">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
          tier === 'infrastructure' ? 'bg-slate-100 text-slate-600' : tier === 'code' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {tier}
        </span>
        {template.category && (
          <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-slate-50 text-slate-600 border-slate-200">
            {template.category.replace('_', ' ').toUpperCase()}
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">
        {template.name}
      </h3>

      {/* Description */}
      <p className="text-slate-500 text-sm mb-4 line-clamp-2 leading-relaxed">
        {template.description}
      </p>

      {/* Includes row */}
      <div className="flex gap-3 mb-4">
        {([['infra', 'Infra'], ['agent_code', 'Agent'], ['ui', 'UI'], ['tests', 'Tests']] as const).map(([key, label]) => (
          <div key={key} className={`flex items-center gap-1 text-xs font-medium ${
            includes[key] ? 'text-emerald-600' : 'text-slate-300'
          }`}>
            {includes[key] ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>
            )}
            <span className="capitalize">{label}</span>
          </div>
        ))}
      </div>

      {/* Tags: frameworks + IaC */}
      <div className="flex flex-wrap gap-1.5 mt-auto mb-4">
        {frameworkNames.map(name => (
          <span key={name} className="inline-block px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md border border-blue-100 font-medium">
            {name}
          </span>
        ))}
        {iacNames.map(name => (
          <span key={name} className="inline-block px-2 py-0.5 text-xs bg-slate-50 text-slate-600 rounded-md border border-slate-200">
            {name}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onViewDetails(template)}
          className="flex-1 btn-secondary text-sm"
        >
          View Details
        </button>
        {iacNames.length === 0 ? (
          <button
            onClick={() => handleDownload()}
            className="flex-1 btn-primary text-sm"
          >
            <svg className="w-3.5 h-3.5 mr-1.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Download
          </button>
        ) : iacNames.length === 1 ? (
          <button
            onClick={() => handleDownload(iacNames[0])}
            className="flex-1 btn-primary text-sm"
          >
            <svg className="w-3.5 h-3.5 mr-1.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Download
          </button>
        ) : (
          <div className="relative flex-1" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full btn-primary text-sm flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-10">
                {iacNames.map(iac => (
                  <button
                    key={iac}
                    onClick={() => { handleDownload(iac); setShowDropdown(false); }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    {iac.charAt(0).toUpperCase() + iac.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
