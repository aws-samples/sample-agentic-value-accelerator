/**
 * RagSecurityControls — Security checklist for RAG implementations
 *
 * OWASP LLM08 aligned security controls for vector/embedding security:
 * - Vector store access controls
 * - Embedding model input validation
 * - Retrieval result filtering
 * - Source attribution tracking
 * - Injection attack detection
 * - Data poisoning monitoring
 * - Chunk size limits
 * - Metadata security
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../icons';

interface SecurityControl {
  id: string;
  name: string;
  description: string;
  owaspRef: string;
  category: 'access' | 'validation' | 'filtering' | 'monitoring';
  critical: boolean;
  icon: IconName;
}

const RAG_SECURITY_CONTROLS: SecurityControl[] = [
  {
    id: 'vector-access',
    name: 'Vector store access controls configured',
    description: 'IAM policies and VPC endpoints restrict vector store access to authorized services only',
    owaspRef: 'LLM08:2025',
    category: 'access',
    critical: true,
    icon: 'lock-closed',
  },
  {
    id: 'embedding-validation',
    name: 'Embedding model input validation',
    description: 'Input sanitization prevents malicious content from being embedded into vector stores',
    owaspRef: 'LLM08:2025',
    category: 'validation',
    critical: true,
    icon: 'shield-check',
  },
  {
    id: 'retrieval-filtering',
    name: 'Retrieval result filtering (PII, sensitive data)',
    description: 'Retrieved chunks are scanned and filtered for PII, PHI, PCI, and sensitive data before use',
    owaspRef: 'LLM08:2025',
    category: 'filtering',
    critical: true,
    icon: 'finger-print',
  },
  {
    id: 'source-attribution',
    name: 'Source attribution tracking',
    description: 'All retrieved content includes provenance metadata for audit and compliance',
    owaspRef: 'LLM08:2025',
    category: 'monitoring',
    critical: false,
    icon: 'link',
  },
  {
    id: 'injection-detection',
    name: 'Injection attack detection on queries',
    description: 'Queries are analyzed for prompt injection patterns before retrieval',
    owaspRef: 'LLM08:2025',
    category: 'validation',
    critical: true,
    icon: 'syringe',
  },
  {
    id: 'poisoning-monitoring',
    name: 'Data poisoning monitoring',
    description: 'Anomaly detection identifies suspicious changes to vector embeddings',
    owaspRef: 'LLM08:2025',
    category: 'monitoring',
    critical: false,
    icon: 'exclamation-triangle',
  },
  {
    id: 'chunk-limits',
    name: 'Chunk size limits enforced',
    description: 'Maximum chunk sizes prevent context overflow and resource exhaustion attacks',
    owaspRef: 'LLM08:2025',
    category: 'validation',
    critical: false,
    icon: 'document',
  },
  {
    id: 'metadata-security',
    name: 'Metadata security (no sensitive data in metadata)',
    description: 'Vector metadata fields are validated to exclude credentials, PII, and secrets',
    owaspRef: 'LLM08:2025',
    category: 'filtering',
    critical: true,
    icon: 'tag',
  },
];

// Custom scissors icon path (not in default set, use document as fallback)
const CATEGORY_INFO: Record<string, { label: string; color: string; bgColor: string }> = {
  access: { label: 'Access Control', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  validation: { label: 'Input Validation', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  filtering: { label: 'Data Filtering', color: 'text-violet-700', bgColor: 'bg-violet-50' },
  monitoring: { label: 'Monitoring', color: 'text-blue-700', bgColor: 'bg-blue-50' },
};

type ComplianceStatus = 'compliant' | 'partial' | 'non-compliant';

interface RagSecurityControlsProps {
  /** Optional: pre-set control states from external source */
  controlStates?: Record<string, boolean>;
  /** Optional: read-only mode (no checkboxes) */
  readOnly?: boolean;
}

export default function RagSecurityControls({ controlStates: externalStates, readOnly = false }: RagSecurityControlsProps) {
  const [localStates, setLocalStates] = useState<Record<string, boolean>>(() => {
    // Initialize from external states or empty
    return externalStates || {};
  });

  const controlStates = externalStates || localStates;

  const toggleControl = (id: string) => {
    if (readOnly || externalStates) return;
    setLocalStates(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Calculate compliance metrics
  const metrics = useMemo(() => {
    const checked = RAG_SECURITY_CONTROLS.filter(c => controlStates[c.id]);
    const critical = RAG_SECURITY_CONTROLS.filter(c => c.critical);
    const criticalChecked = critical.filter(c => controlStates[c.id]);

    const total = RAG_SECURITY_CONTROLS.length;
    const checkedCount = checked.length;
    const criticalCount = critical.length;
    const criticalCheckedCount = criticalChecked.length;

    let status: ComplianceStatus;
    if (checkedCount === total) {
      status = 'compliant';
    } else if (criticalCheckedCount < criticalCount) {
      status = 'non-compliant';
    } else {
      status = 'partial';
    }

    return {
      total,
      checked: checkedCount,
      critical: criticalCount,
      criticalChecked: criticalCheckedCount,
      percentage: Math.round((checkedCount / total) * 100),
      status,
    };
  }, [controlStates]);

  const statusConfig: Record<ComplianceStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: IconName }> = {
    compliant: {
      label: 'Compliant',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      icon: 'check-circle',
    },
    partial: {
      label: 'Partial Compliance',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: 'exclamation-triangle',
    },
    'non-compliant': {
      label: 'Critical Controls Missing',
      color: 'text-rose-700',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
      icon: 'x-circle',
    },
  };

  const currentStatus = statusConfig[metrics.status];

  // Group controls by category
  const groupedControls = useMemo(() => {
    const groups: Record<string, SecurityControl[]> = {};
    RAG_SECURITY_CONTROLS.forEach(control => {
      if (!groups[control.category]) {
        groups[control.category] = [];
      }
      groups[control.category].push(control);
    });
    return groups;
  }, []);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
              <Icon name="shield-exclamation" className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">RAG Security Controls</h3>
              <p className="text-[11px] text-slate-500">OWASP LLM08 aligned checklist for vector/embedding security</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${currentStatus.bgColor} ${currentStatus.borderColor}`}>
            <Icon name={currentStatus.icon} className={`w-4 h-4 ${currentStatus.color}`} />
            <span className={`text-xs font-semibold ${currentStatus.color}`}>{currentStatus.label}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">{metrics.checked}</span> of {metrics.total} controls implemented
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-600">
              <span className={`font-semibold ${metrics.criticalChecked === metrics.critical ? 'text-emerald-600' : 'text-rose-600'}`}>
                {metrics.criticalChecked}
              </span> of {metrics.critical} critical controls
            </span>
          </div>
          <span className={`text-sm font-bold ${metrics.percentage === 100 ? 'text-emerald-600' : metrics.percentage >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
            {metrics.percentage}%
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              metrics.percentage === 100 ? 'bg-emerald-500' : metrics.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${metrics.percentage}%` }}
          />
        </div>
      </div>

      {/* Controls Checklist */}
      <div className="px-5 py-4">
        <div className="space-y-4">
          {Object.entries(groupedControls).map(([category, controls]) => {
            const catInfo = CATEGORY_INFO[category];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${catInfo.bgColor} ${catInfo.color}`}>
                    {catInfo.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {controls.map(control => {
                    const isChecked = controlStates[control.id] || false;
                    return (
                      <div
                        key={control.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                          isChecked
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : control.critical
                            ? 'bg-rose-50/30 border-rose-200/60'
                            : 'bg-slate-50/50 border-slate-200/60'
                        } ${!readOnly && !externalStates ? 'cursor-pointer hover:shadow-sm' : ''}`}
                        onClick={() => toggleControl(control.id)}
                      >
                        {/* Checkbox */}
                        <div
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-500'
                              : control.critical
                              ? 'border-rose-300 bg-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Icon name="check" className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>

                        {/* Icon */}
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                            isChecked ? 'bg-emerald-100' : control.critical ? 'bg-rose-100' : 'bg-slate-100'
                          }`}
                        >
                          <Icon
                            name={control.icon}
                            className={`w-4 h-4 ${isChecked ? 'text-emerald-600' : control.critical ? 'text-rose-600' : 'text-slate-500'}`}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isChecked ? 'text-emerald-900' : 'text-slate-900'}`}>
                              {control.name}
                            </span>
                            {control.critical && !isChecked && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-bold uppercase">
                                Critical
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] mt-0.5 ${isChecked ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {control.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-400 font-mono">{control.owaspRef}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with remediation link */}
      <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="information-circle" className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-600">
              Configure knowledge sources and guardrails to implement these controls.
            </span>
          </div>
          <Link
            to="/capabilities/knowledge"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icon name="wrench-screwdriver" className="w-3.5 h-3.5" />
            Configure Sources
          </Link>
        </div>

        {/* OWASP Reference */}
        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Icon name="shield" className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-indigo-800">
                <strong>OWASP LLM08: Vector and Embedding Weaknesses</strong> addresses risks from
                improper handling of vector stores and embeddings in RAG systems, including unauthorized access,
                data poisoning, and information leakage through similarity searches.
              </p>
              <a
                href="https://genai.owasp.org/llmrisk/llm08-vector-and-embedding-weaknesses/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                View OWASP LLM08 Details
                <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
