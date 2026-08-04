/**
 * GuardrailImportExport — Import and export guardrail configurations
 */

import { useState, useRef } from 'react';

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  extension: string;
}

interface GuardrailSummary {
  id: string;
  name: string;
  version?: string;
  controls: number;
}

interface Props {
  guardrails?: GuardrailSummary[];
  onImport?: (config: unknown, format: string) => void;
  onExport?: (guardrailIds: string[], format: string) => void;
  onClose?: () => void;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'bedrock-json', name: 'Bedrock Guardrails JSON', description: 'Native AWS Bedrock format for direct API deployment', extension: '.json' },
  { id: 'terraform', name: 'Terraform HCL', description: 'Infrastructure as Code for aws_bedrock_guardrail resources', extension: '.tf' },
  { id: 'cloudformation', name: 'CloudFormation YAML', description: 'AWS CFN template with AWS::Bedrock::Guardrail', extension: '.yaml' },
  { id: 'cdk', name: 'AWS CDK (TypeScript)', description: 'CDK construct code for programmatic deployment', extension: '.ts' },
];

const MOCK_GUARDRAILS: GuardrailSummary[] = [
  { id: 'gr-001', name: 'FSI Standard', version: 'v3', controls: 14 },
  { id: 'gr-002', name: 'AWS Best Practice', version: 'v1', controls: 12 },
  { id: 'gr-003', name: 'Retail Banking Support', version: 'v2', controls: 18 },
];

export default function GuardrailImportExport({ guardrails, onImport, onExport, onClose }: Props) {
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [selectedFormat, setSelectedFormat] = useState<string>('bedrock-json');
  const [selectedGuardrails, setSelectedGuardrails] = useState<Set<string>>(new Set());
  const [importContent, setImportContent] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableGuardrails = guardrails || MOCK_GUARDRAILS;

  const toggleGuardrail = (id: string) => {
    const newSet = new Set(selectedGuardrails);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedGuardrails(newSet);
  };

  const selectAll = () => {
    setSelectedGuardrails(new Set(availableGuardrails.map(g => g.id)));
  };

  const selectNone = () => {
    setSelectedGuardrails(new Set());
  };

  const generateExportPreview = () => {
    const selected = availableGuardrails.filter(g => selectedGuardrails.has(g.id));

    if (selectedFormat === 'bedrock-json') {
      const preview = {
        guardrails: selected.map(g => ({
          name: g.name,
          description: `Exported guardrail: ${g.name}`,
          blockedInputMessaging: 'This request cannot be processed due to content policy.',
          blockedOutputsMessaging: 'This response cannot be provided due to content policy.',
          contentPolicyConfig: {
            filtersConfig: [
              { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
              { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
            ],
          },
          sensitiveInformationPolicyConfig: {
            piiEntitiesConfig: [
              { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
            ],
          },
        })),
        exportedAt: new Date().toISOString(),
        format: 'bedrock-guardrails-v1',
      };
      setExportPreview(JSON.stringify(preview, null, 2));
    } else if (selectedFormat === 'terraform') {
      const tfCode = selected.map(g => `resource "aws_bedrock_guardrail" "${g.name.toLowerCase().replace(/\s+/g, '_')}" {
  name        = "${g.name}"
  description = "Exported guardrail: ${g.name}"

  blocked_input_messaging  = "This request cannot be processed."
  blocked_outputs_messaging = "This response cannot be provided."

  content_policy_config {
    filters_config {
      type            = "HATE"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
  }
}`).join('\n\n');
      setExportPreview(tfCode);
    } else if (selectedFormat === 'cloudformation') {
      const cfnYaml = `AWSTemplateFormatVersion: '2010-09-09'
Description: Exported Bedrock Guardrails

Resources:
${selected.map(g => `  ${g.name.replace(/\s+/g, '')}Guardrail:
    Type: AWS::Bedrock::Guardrail
    Properties:
      Name: ${g.name}
      Description: Exported guardrail
      BlockedInputMessaging: This request cannot be processed.
      BlockedOutputsMessaging: This response cannot be provided.`).join('\n\n')}
`;
      setExportPreview(cfnYaml);
    } else if (selectedFormat === 'cdk') {
      const cdkCode = `import * as bedrock from '@aws-cdk/aws-bedrock-alpha';
import { Construct } from 'constructs';

export class ExportedGuardrails extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

${selected.map(g => `    new bedrock.Guardrail(this, '${g.name.replace(/\s+/g, '')}', {
      name: '${g.name}',
      description: 'Exported guardrail',
      blockedInputMessaging: 'This request cannot be processed.',
      blockedOutputsMessaging: 'This response cannot be provided.',
    });`).join('\n\n')}
  }
}`;
      setExportPreview(cdkCode);
    }
  };

  const handleExport = () => {
    if (selectedGuardrails.size === 0) return;

    generateExportPreview();
    onExport?.(Array.from(selectedGuardrails), selectedFormat);

    // Trigger download
    const format = EXPORT_FORMATS.find(f => f.id === selectedFormat);
    const blob = new Blob([exportPreview || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guardrails-export${format?.extension || '.json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImportContent(event.target?.result as string);
      setImportError(null);
      setImportSuccess(false);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!importContent.trim()) {
      setImportError('Please provide configuration content to import');
      return;
    }

    try {
      const parsed = JSON.parse(importContent);
      if (!parsed.guardrails && !parsed.name) {
        setImportError('Invalid guardrail configuration format');
        return;
      }
      setImportError(null);
      setImportSuccess(true);
      onImport?.(parsed, 'bedrock-json');
    } catch {
      setImportError('Invalid JSON format. Please check the configuration syntax.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Import / Export</h2>
          <p className="text-sm text-slate-500 mt-1">Share guardrail configurations across environments</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
        <button
          onClick={() => setMode('export')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
            mode === 'export' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Export
          </span>
        </button>
        <button
          onClick={() => setMode('import')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
            mode === 'import' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Import
          </span>
        </button>
      </div>

      {mode === 'export' ? (
        <>
          {/* Format Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Export Format</label>
            <div className="grid grid-cols-2 gap-3">
              {EXPORT_FORMATS.map(format => (
                <button
                  key={format.id}
                  onClick={() => {
                    setSelectedFormat(format.id);
                    setExportPreview(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedFormat === format.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">{format.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{format.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Guardrail Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Select Guardrails</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">Select All</button>
                <span className="text-slate-300">|</span>
                <button onClick={selectNone} className="text-xs text-blue-600 hover:text-blue-800">Clear</button>
              </div>
            </div>
            <div className="space-y-2">
              {availableGuardrails.map(g => (
                <label
                  key={g.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedGuardrails.has(g.id)
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGuardrails.has(g.id)}
                    onChange={() => toggleGuardrail(g.id)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{g.name}</div>
                    <div className="text-xs text-slate-500">{g.version} • {g.controls} controls</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview Button */}
          <button
            onClick={generateExportPreview}
            disabled={selectedGuardrails.size === 0}
            className="w-full py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Preview Export
          </button>

          {/* Export Preview */}
          {exportPreview && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Preview</label>
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs overflow-auto max-h-64 font-mono">
                {exportPreview}
              </pre>
            </div>
          )}

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={selectedGuardrails.size === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Export ({selectedGuardrails.size} guardrail{selectedGuardrails.size !== 1 ? 's' : ''})
          </button>
        </>
      ) : (
        <>
          {/* File Upload */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Upload Configuration File</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-8 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors text-center"
            >
              <svg className="w-8 h-8 mx-auto text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-slate-600">Click to upload or drag and drop</p>
              <p className="text-xs text-slate-400 mt-1">Supports JSON, Terraform, CloudFormation, CDK</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.tf,.yaml,.yml,.ts"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Or Paste */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Or Paste Configuration</label>
            <textarea
              value={importContent}
              onChange={e => {
                setImportContent(e.target.value);
                setImportError(null);
                setImportSuccess(false);
              }}
              placeholder='{\n  "name": "My Guardrail",\n  "contentPolicyConfig": { ... }\n}'
              className="w-full h-48 px-4 py-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error/Success Message */}
          {importError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{importError}</p>
            </div>
          )}

          {importSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-emerald-700">Configuration validated successfully! Ready to import.</p>
            </div>
          )}

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={!importContent.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Validate & Import
          </button>
        </>
      )}
    </div>
  );
}
