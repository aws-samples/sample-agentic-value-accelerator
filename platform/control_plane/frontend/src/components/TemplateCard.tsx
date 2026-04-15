import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Template } from '../types';
import TemplateDetailModal from './TemplateDetailModal';
import { useUser } from '../contexts/UserContext';

interface TemplateCardProps {
  template: Template;
}

export default function TemplateCard({ template }: TemplateCardProps) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [showModal, setShowModal] = useState(false);

  const patternTypeColors: Record<string, string> = {
    single_agent: 'bg-blue-50 text-blue-700 border-blue-200',
    orchestration: 'bg-violet-50 text-violet-700 border-violet-200',
    rag: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    tool_calling: 'bg-amber-50 text-amber-700 border-amber-200',
    conversational: 'bg-pink-50 text-pink-700 border-pink-200',
  };

  const patternTypeColor = patternTypeColors[template.pattern_type] || 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <>
      <div className="card hover:border-blue-200 transition-all h-full flex flex-col group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900 mb-3 group-hover:text-blue-700 transition-colors">
              {template.name}
            </h3>
            <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${patternTypeColor}`}>
              {template.pattern_type.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg">v{template.version}</span>
        </div>

        {/* Dependency Warning — only show for foundation templates */}
        {template.type === 'foundation' && template.dependencies && template.dependencies.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 font-medium">
              Requires: {template.dependencies.map(d => d.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ')}
            </p>
          </div>
        )}

        {/* Description */}
        <p className="text-slate-500 text-sm mb-4 flex-grow line-clamp-3 leading-relaxed">
          {template.description}
        </p>

        {/* Frameworks */}
        {template.frameworks && template.frameworks.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Frameworks
            </div>
            <div className="flex flex-wrap gap-1.5">
              {template.frameworks.map(framework => (
                <span
                  key={framework.id}
                  className="inline-block px-2.5 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-100 font-medium"
                >
                  {framework.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Deployment Patterns */}
        {template.deployment_patterns && template.deployment_patterns.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Deployment
            </div>
            <div className="flex flex-wrap gap-1.5">
              {template.deployment_patterns.map(pattern => (
                <span
                  key={pattern.id}
                  className="inline-block px-2.5 py-1 text-xs bg-slate-50 text-slate-600 rounded-lg border border-slate-200"
                >
                  {pattern.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Use Cases */}
        {template.example_use_cases && template.example_use_cases.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Use Cases
            </div>
            <ul className="text-sm text-slate-500 space-y-1.5">
              {template.example_use_cases.slice(0, 3).map((useCase, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-blue-400 mr-2 mt-0.5">•</span>
                  <span className="flex-1">{useCase}</span>
                </li>
              ))}
              {template.example_use_cases.length > 3 && (
                <li className="text-slate-400 text-xs ml-4">
                  <button
                    onClick={() => setShowModal(true)}
                    className="hover:text-blue-600 hover:underline transition-colors"
                  >
                    +{template.example_use_cases.length - 3} more
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="mt-auto pt-4 border-t border-slate-100 mb-4">
            <div className="flex flex-wrap gap-1.5">
              {template.tags.slice(0, 4).map(tag => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 text-xs bg-slate-50 text-slate-500 rounded-md"
                >
                  #{tag}
                </span>
              ))}
              {template.tags.length > 4 && (
                <span className="inline-block px-2 py-0.5 text-xs text-slate-400">
                  +{template.tags.length - 4}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2.5 mt-auto">
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 btn-secondary text-sm"
          >
            View Details
          </button>
          <button
            onClick={() => navigate('/deployments/create', { state: { templateId: template.id } })}
            disabled={!user?.can_deploy}
            title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Deploy this template'}
            className="flex-1 btn-primary text-sm"
          >
            Deploy
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <TemplateDetailModal
          template={template}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
