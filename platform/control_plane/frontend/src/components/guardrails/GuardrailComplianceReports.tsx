/**
 * GuardrailComplianceReports — Generate compliance reports for regulators
 */

import { useState } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  framework: string;
  sections: string[];
  estimatedPages: number;
}

interface GeneratedReport {
  id: string;
  templateId: string;
  templateName: string;
  generatedAt: string;
  generatedBy: string;
  period: { start: string; end: string };
  format: 'pdf' | 'csv' | 'xlsx';
  status: 'generating' | 'ready' | 'failed';
  downloadUrl?: string;
  size?: string;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'sr26-2',
    name: 'SR 26-2 Model Risk Management Report',
    description: 'Comprehensive report on AI guardrail effectiveness aligned with Federal Reserve SR 26-2 guidance',
    framework: 'SR 26-2',
    sections: ['Executive Summary', 'Guardrail Inventory', 'Effectiveness Metrics', 'Incident Analysis', 'Risk Assessment', 'Remediation Actions'],
    estimatedPages: 25,
  },
  {
    id: 'nist-ai-rmf',
    name: 'NIST AI RMF Compliance Report',
    description: 'AI risk management framework compliance assessment with guardrail mapping',
    framework: 'NIST AI RMF',
    sections: ['Govern', 'Map', 'Measure', 'Manage', 'Guardrail Controls', 'Gap Analysis'],
    estimatedPages: 30,
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act High-Risk System Report',
    description: 'Documentation for high-risk AI systems under EU AI Act requirements',
    framework: 'EU AI Act',
    sections: ['System Classification', 'Risk Assessment', 'Technical Documentation', 'Human Oversight', 'Guardrail Measures', 'Conformity Assessment'],
    estimatedPages: 40,
  },
  {
    id: 'sox-audit',
    name: 'SOX AI Controls Audit Report',
    description: 'Sarbanes-Oxley compliant audit trail for AI-assisted financial processes',
    framework: 'SOX',
    sections: ['Control Environment', 'AI Usage Inventory', 'Guardrail Controls', 'Access Logs', 'Change Management', 'Testing Results'],
    estimatedPages: 20,
  },
  {
    id: 'effectiveness',
    name: 'Guardrail Effectiveness Summary',
    description: 'Internal report on guardrail performance, coverage, and optimization opportunities',
    framework: 'Internal',
    sections: ['Coverage Analysis', 'Block/Anonymize Statistics', 'False Positive Analysis', 'Latency Impact', 'Recommendations'],
    estimatedPages: 15,
  },
];

const MOCK_GENERATED_REPORTS: GeneratedReport[] = [
  {
    id: 'rpt-001',
    templateId: 'sr26-2',
    templateName: 'SR 26-2 Model Risk Management Report',
    generatedAt: '2024-06-08T10:30:00Z',
    generatedBy: 'alex.rivera@example.com',
    period: { start: '2024-05-01', end: '2024-05-31' },
    format: 'pdf',
    status: 'ready',
    downloadUrl: '#',
    size: '2.4 MB',
  },
  {
    id: 'rpt-002',
    templateId: 'effectiveness',
    templateName: 'Guardrail Effectiveness Summary',
    generatedAt: '2024-06-07T14:15:00Z',
    generatedBy: 'alex.rivera@example.com',
    period: { start: '2024-06-01', end: '2024-06-07' },
    format: 'xlsx',
    status: 'ready',
    downloadUrl: '#',
    size: '845 KB',
  },
  {
    id: 'rpt-003',
    templateId: 'nist-ai-rmf',
    templateName: 'NIST AI RMF Compliance Report',
    generatedAt: '2024-06-08T15:00:00Z',
    generatedBy: 'compliance@example.com',
    period: { start: '2024-04-01', end: '2024-06-30' },
    format: 'pdf',
    status: 'generating',
  },
];

export default function GuardrailComplianceReports() {
  const [reports, setReports] = useState<GeneratedReport[]>(MOCK_GENERATED_REPORTS);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateConfig, setGenerateConfig] = useState({
    startDate: '',
    endDate: '',
    format: 'pdf' as 'pdf' | 'csv' | 'xlsx',
    includeRawData: false,
  });

  const handleGenerate = () => {
    if (!selectedTemplate) return;

    const newReport: GeneratedReport = {
      id: `rpt-${Date.now()}`,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      generatedAt: new Date().toISOString(),
      generatedBy: 'current.user@example.com',
      period: { start: generateConfig.startDate, end: generateConfig.endDate },
      format: generateConfig.format,
      status: 'generating',
    };

    setReports(prev => [newReport, ...prev]);
    setShowGenerateModal(false);
    setSelectedTemplate(null);

    // Simulate report generation
    setTimeout(() => {
      setReports(prev =>
        prev.map(r =>
          r.id === newReport.id
            ? { ...r, status: 'ready', downloadUrl: '#', size: '1.8 MB' }
            : r
        )
      );
    }, 5000);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFormatIcon = (format: string): IconName => {
    switch (format) {
      case 'pdf': return 'document-text';
      case 'csv': return 'chart-bar';
      case 'xlsx': return 'circle-stack';
      default: return 'folder';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ready': return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
      case 'generating': return { bg: 'bg-blue-100', text: 'text-blue-700' };
      case 'failed': return { bg: 'bg-red-100', text: 'text-red-700' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Compliance Reports</h2>
          <p className="text-sm text-slate-500 mt-1">Generate audit-ready reports for regulators and stakeholders</p>
        </div>
      </div>

      {/* Report Templates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Report Templates</h3>
        <div className="grid grid-cols-2 gap-4">
          {REPORT_TEMPLATES.map(template => (
            <div
              key={template.id}
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    {template.framework}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">~{template.estimatedPages} pages</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">{template.name}</h4>
              <p className="text-xs text-slate-500 mb-3">{template.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {template.sections.slice(0, 4).map(section => (
                  <span key={section} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                    {section}
                  </span>
                ))}
                {template.sections.length > 4 && (
                  <span className="text-[9px] text-slate-400">+{template.sections.length - 4} more</span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedTemplate(template);
                  setShowGenerateModal(true);
                }}
                className="w-full py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                Generate Report
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Generated Reports */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Generated Reports</h3>
        {reports.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
            <Icon name="clipboard-list" className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No reports generated yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(report => {
              const statusStyle = getStatusStyle(report.status);
              return (
                <div
                  key={report.id}
                  className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <Icon name={getFormatIcon(report.format)} className="w-6 h-6 text-slate-500" />
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">{report.templateName}</h4>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                        <span>Period: {formatDate(report.period.start)} - {formatDate(report.period.end)}</span>
                        <span>Generated: {formatDate(report.generatedAt)}</span>
                        <span>By: {report.generatedBy}</span>
                        {report.size && <span>{report.size}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                      {report.status === 'generating' && (
                        <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mr-1" />
                      )}
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </span>
                    {report.status === 'ready' && (
                      <a
                        href={report.downloadUrl}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule Reports */}
      <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Schedule Automated Reports</h3>
            <p className="text-xs text-slate-500 mt-1">
              Set up recurring compliance reports delivered to your inbox or S3 bucket
            </p>
          </div>
          <button className="px-4 py-2 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
            Configure Schedule
          </button>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerateModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Generate Report</h3>
            <p className="text-sm text-slate-500 mb-4">{selectedTemplate.name}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={generateConfig.startDate}
                    onChange={e => setGenerateConfig(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={generateConfig.endDate}
                    onChange={e => setGenerateConfig(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Format</label>
                <div className="flex gap-2">
                  {(['pdf', 'csv', 'xlsx'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setGenerateConfig(prev => ({ ...prev, format: fmt }))}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        generateConfig.format === fmt
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon name={getFormatIcon(fmt)} className="w-3.5 h-3.5 inline mr-1" />{fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateConfig.includeRawData}
                  onChange={e => setGenerateConfig(prev => ({ ...prev, includeRawData: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-600">Include raw data appendix</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowGenerateModal(false); setSelectedTemplate(null); }}
                className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!generateConfig.startDate || !generateConfig.endDate}
                className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Generate Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
