import { useState, useRef, useEffect, useCallback } from 'react';
import { deploymentsApi } from '../api/client';
import type { Deployment, AppUseCase, ScriptTestResponse, TestDeploymentResponse } from '../types';
import LoadingSpinner from './LoadingSpinner';

type TabId = 'cli' | 'script' | 'custom' | 'app';

interface Props {
  deployment: Deployment;
  useCase?: AppUseCase;
  onClose: () => void;
}

function getTestEntityInfo(useCase?: AppUseCase): { field: string; entities: string[] } {
  if (!useCase) return { field: 'entity_id', entities: ['ENTITY001'] };

  const idField = useCase.id_field || 'entity_id';
  const entities = useCase.test_entities || useCase.test_accounts || ['ENTITY001'];

  return { field: idField, entities };
}

/** Collapsible result display used across all three tabs. */
function ResultBlock({
  title,
  durationMs,
  content,
  expanded,
  onToggle,
  onCopy,
  copied,
}: {
  title: string;
  durationMs?: number | null;
  content: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 hover:text-slate-700 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
        {durationMs != null && (
          <span className="text-slate-400 font-normal normal-case">({durationMs}ms)</span>
        )}
      </button>
      {expanded && (
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
            {content}
          </pre>
          <button
            onClick={() => onCopy(content)}
            className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TestDeploymentDrawer({ deployment, useCase, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('cli');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState('full');
  const [copied, setCopied] = useState(false);

  // --- CLI tab state ---
  const [cliRunning, setCliRunning] = useState(false);
  const [cliElapsed, setCliElapsed] = useState(0);
  const [cliResponse, setCliResponse] = useState<TestDeploymentResponse | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliExpanded, setCliExpanded] = useState(true);
  const cliPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cliTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Script tab state ---
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scriptResponse, setScriptResponse] = useState<ScriptTestResponse | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptExpanded, setScriptExpanded] = useState(true);

  // --- Custom tab state ---
  const [assessmentType, setAssessmentType] = useState('full');
  const [customJson, setCustomJson] = useState('');
  const [jsonValid, setJsonValid] = useState(true);
  const [jsonErrorMsg, setJsonErrorMsg] = useState('');
  const [sampleLoading, setSampleLoading] = useState(false);
  const [customRunning, setCustomRunning] = useState(false);
  const [customElapsed, setCustomElapsed] = useState(0);
  const [customResponse, setCustomResponse] = useState<TestDeploymentResponse | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customExpanded, setCustomExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const customPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const customTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const jsonValidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Cleanup all polling intervals ---
  const clearCliPolling = useCallback(() => {
    if (cliPollRef.current) { clearInterval(cliPollRef.current); cliPollRef.current = null; }
    if (cliTickRef.current) { clearInterval(cliTickRef.current); cliTickRef.current = null; }
  }, []);

  const clearCustomPolling = useCallback(() => {
    if (customPollRef.current) { clearInterval(customPollRef.current); customPollRef.current = null; }
    if (customTickRef.current) { clearInterval(customTickRef.current); customTickRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCliPolling();
      clearCustomPolling();
    };
  }, [clearCliPolling, clearCustomPolling]);

  const outputs = deployment.outputs || {};
  const runtimeArn = outputs.agentcore_runtime_arn || outputs.runtime_arn || '<RUNTIME_ARN>';
  const region = deployment.aws_region || 'us-east-1';
  const { field: entityField, entities: testEntities } = getTestEntityInfo(useCase);
  const useCaseName = useCase?.use_case_name || deployment.template_id.replace('foundry-', '');

  const typeField = useCase?.type_field || 'assessment_type';
  const typeValues = useCase?.type_values || [];

  // Initialize selected entity and type on first render
  useEffect(() => {
    if (testEntities.length > 0 && !selectedEntity) {
      setSelectedEntity(testEntities[0]);
    }
    if (typeValues.length > 0 && !selectedAssessment) {
      setSelectedAssessment(typeValues[0]);
    }
    if (typeValues.length > 0 && !assessmentType) {
      setAssessmentType(typeValues[0]);
    }
  }, [testEntities, selectedEntity, typeValues, selectedAssessment, assessmentType]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Fetch sample data for custom tab ---
  useEffect(() => {
    if (activeTab !== 'custom') return;
    if (customJson) return; // already populated
    let cancelled = false;
    setSampleLoading(true);
    deploymentsApi
      .getSampleData(deployment.deployment_id)
      .then((data) => {
        if (!cancelled) {
          const formatted = JSON.stringify(data, null, 2);
          setCustomJson(formatted);
          setJsonValid(true);
          setJsonErrorMsg('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Provide a fallback template
          const fallback = JSON.stringify(
            { [entityField]: testEntities[0] || 'ENTITY001', [typeField]: 'full' },
            null,
            2,
          );
          setCustomJson(fallback);
          setJsonValid(true);
          setJsonErrorMsg('');
        }
      })
      .finally(() => {
        if (!cancelled) setSampleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, deployment.deployment_id, customJson, entityField, testEntities]);

  // --- JSON validation (debounced) ---
  const handleJsonChange = useCallback((value: string) => {
    setCustomJson(value);
    if (jsonValidateTimer.current) clearTimeout(jsonValidateTimer.current);
    jsonValidateTimer.current = setTimeout(() => {
      try {
        JSON.parse(value);
        setJsonValid(true);
        setJsonErrorMsg('');
      } catch (e: any) {
        setJsonValid(false);
        setJsonErrorMsg(e.message || 'Invalid JSON');
      }
    }, 500);
  }, []);

  // --- CLI command (reactive to selected entity and assessment type) ---
  const cliEntity = selectedEntity || testEntities[0] || 'ENTITY001';
  const cliCommand = `RUNTIME_ARN="${runtimeArn}"

PAYLOAD=$(echo -n '{
  "${entityField}": "${cliEntity}",
  "${typeField}": "${selectedAssessment}"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region ${region} \\
  output.json

cat output.json | jq '.'`;

  // --- Script display ---
  const scriptPath = `./applications/fsi_foundry/scripts/use_cases/${useCaseName}/test/test_agentcore.sh`;
  const scriptContent = `# Test script path:
${scriptPath}

# Required environment variables:
export USE_CASE_ID="${useCaseName}"
export FRAMEWORK="${deployment.framework_id || 'langchain_langgraph'}"
export AWS_REGION="${region}"
export RUNTIME_ARN="${runtimeArn}"

# Run the test:
bash ${scriptPath}`;

  // --- CLI Run handler (async with polling) ---
  const handleCliRun = async () => {
    setCliRunning(true);
    setCliError(null);
    setCliResponse(null);
    setCliElapsed(0);
    clearCliPolling();

    const payload: Record<string, any> = {
      [entityField]: selectedEntity || testEntities[0] || 'ENTITY001',
      [typeField]: selectedAssessment,
    };

    try {
      const { test_id } = await deploymentsApi.testDeployment(deployment.deployment_id, payload);

      // Tick elapsed counter every second
      cliTickRef.current = setInterval(() => {
        setCliElapsed((prev) => prev + 1);
      }, 1000);

      // Poll for result every 2 seconds
      cliPollRef.current = setInterval(async () => {
        try {
          const result = await deploymentsApi.getTestResult(deployment.deployment_id, test_id);
          if (result.status === 'completed') {
            clearCliPolling();
            setCliResponse(result);
            setCliExpanded(true);
            setCliRunning(false);
          }
        } catch (pollErr: any) {
          clearCliPolling();
          setCliError(pollErr.message || 'Failed to fetch test result');
          setCliRunning(false);
        }
      }, 2000);
    } catch (e: any) {
      clearCliPolling();
      setCliError(e.message || 'Test invocation failed');
      setCliRunning(false);
    }
  };

  // --- Script Run handler (async with polling) ---
  const scriptPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scriptElapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scriptElapsed, setScriptElapsed] = useState(0);

  const cleanupScriptPolling = useCallback(() => {
    if (scriptPollRef.current) { clearInterval(scriptPollRef.current); scriptPollRef.current = null; }
    if (scriptElapsedRef.current) { clearInterval(scriptElapsedRef.current); scriptElapsedRef.current = null; }
  }, []);

  const handleScriptRun = async () => {
    setScriptRunning(true);
    setScriptError(null);
    setScriptResponse(null);
    setScriptElapsed(0);
    cleanupScriptPolling();

    try {
      const start = await deploymentsApi.runTestScript(deployment.deployment_id, 'agentcore');
      const testId = start.test_id;

      scriptElapsedRef.current = setInterval(() => setScriptElapsed(s => s + 1), 1000);

      scriptPollRef.current = setInterval(async () => {
        try {
          const result = await deploymentsApi.getTestResult(deployment.deployment_id, testId);
          if (result.status === 'completed') {
            cleanupScriptPolling();
            setScriptResponse({ success: result.success ?? false, output: result.output || result.response || result.error || '', exit_code: result.exit_code ?? (result.success ? 0 : 1), duration_ms: result.duration_ms ?? 0 });
            setScriptExpanded(true);
            setScriptRunning(false);
          } else if (result.output) {
            // Show partial output while still running
            setScriptResponse({ success: true, output: result.output, exit_code: 0, duration_ms: 0 });
            setScriptExpanded(true);
          }
        } catch {
          cleanupScriptPolling();
          setScriptError('Lost connection while polling for results');
          setScriptRunning(false);
        }
      }, 2000);
    } catch (e: any) {
      cleanupScriptPolling();
      setScriptError(e.message || 'Script execution failed');
      setScriptRunning(false);
    }
  };

  // --- Custom Run handler (async with polling) ---
  const handleCustomRun = async () => {
    setCustomRunning(true);
    setCustomError(null);
    setCustomResponse(null);
    setCustomElapsed(0);
    clearCustomPolling();

    try {
      const parsed = JSON.parse(customJson);
      // Merge type field
      parsed[typeField] = assessmentType;
      const { test_id } = await deploymentsApi.testDeployment(deployment.deployment_id, parsed);

      // Tick elapsed counter every second
      customTickRef.current = setInterval(() => {
        setCustomElapsed((prev) => prev + 1);
      }, 1000);

      // Poll for result every 2 seconds
      customPollRef.current = setInterval(async () => {
        try {
          const result = await deploymentsApi.getTestResult(deployment.deployment_id, test_id);
          if (result.status === 'completed') {
            clearCustomPolling();
            setCustomResponse(result);
            setCustomExpanded(true);
            setCustomRunning(false);
          }
        } catch (pollErr: any) {
          clearCustomPolling();
          setCustomError(pollErr.message || 'Failed to fetch test result');
          setCustomRunning(false);
        }
      }, 2000);
    } catch (e: any) {
      clearCustomPolling();
      setCustomError(e.message || 'Test invocation failed');
      setCustomRunning(false);
    }
  };

  // --- Upload JSON to S3 ---
  const handleUploadJson = async () => {
    setUploading(true);
    setUploadError(null);
    setUploadedKey(null);

    try {
      const blob = new Blob([customJson], { type: 'application/json' });
      const file = new File([blob], `test-data-${Date.now()}.json`, { type: 'application/json' });
      const result = await deploymentsApi.uploadTestData(deployment.deployment_id, file);
      setUploadedKey(result.s3_key);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // --- Clear results helpers ---
  const clearCliResults = () => {
    clearCliPolling();
    setCliRunning(false);
    setCliResponse(null);
    setCliError(null);
    setCliElapsed(0);
  };
  const clearScriptResults = () => {
    setScriptResponse(null);
    setScriptError(null);
  };
  const clearCustomResults = () => {
    clearCustomPolling();
    setCustomRunning(false);
    setCustomResponse(null);
    setCustomError(null);
    setCustomElapsed(0);
    setUploadedKey(null);
    setUploadError(null);
  };

  // Cleanup all polling on unmount
  useEffect(() => {
    return () => {
      cleanupScriptPolling();
    };
  }, [cleanupScriptPolling]);

  const frontendUrl = deployment.outputs?.ui_url || deployment.outputs?.app_url || deployment.outputs?.AmplifyUrl;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'cli', label: 'CLI' },
    { id: 'script', label: 'Script' },
    { id: 'custom', label: 'Custom' },
    ...(frontendUrl ? [{ id: 'app' as TabId, label: 'Open App' }] : []),
  ];

  // --- Format response for display ---
  const formatResponse = (resp: any): string => {
    if (!resp) return '';
    if (typeof resp.response === 'string') return resp.response;
    return JSON.stringify(resp.response ?? resp, null, 2);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-[560px] max-w-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
        style={{ animation: 'drawerSlideIn 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Test Deployment</h2>
            <p className="text-sm text-slate-500 mt-0.5">{useCase?.name || useCaseName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ===================== CLI Tab ===================== */}
          {activeTab === 'cli' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Run this AWS CLI command to invoke the deployed AgentCore runtime directly.
              </p>
              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {cliCommand}
                </pre>
                <button
                  onClick={() => copyToClipboard(cliCommand)}
                  className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Test Entity
                  </label>
                  <select
                    value={selectedEntity}
                    onChange={(e) => setSelectedEntity(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    {testEntities.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    {typeField.replace(/_/g, ' ')}
                  </label>
                  <select
                    value={selectedAssessment}
                    onChange={(e) => setSelectedAssessment(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    {typeValues.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Run button */}
              <button
                onClick={handleCliRun}
                disabled={cliRunning}
                className="w-full btn-primary text-sm py-2.5 justify-center gap-2 flex items-center"
              >
                {cliRunning ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {cliRunning ? `Invoking runtime... ${cliElapsed}s` : 'Run'}
              </button>

              {/* Error */}
              {cliError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-xs font-semibold text-red-700 mb-1">Error</div>
                  <div className="text-sm text-red-600">{cliError}</div>
                </div>
              )}

              {/* Response */}
              {cliResponse && (
                <>
                  <ResultBlock
                    title="Response"
                    durationMs={cliResponse.duration_ms}
                    content={formatResponse(cliResponse)}
                    expanded={cliExpanded}
                    onToggle={() => setCliExpanded(!cliExpanded)}
                    onCopy={copyToClipboard}
                    copied={copied}
                  />
                  <button
                    onClick={clearCliResults}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear Results
                  </button>
                </>
              )}
            </div>
          )}

          {/* ===================== Script Tab ===================== */}
          {activeTab === 'script' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Use the pre-built test script for this use case with the environment variables below.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Note:</span> The test script runs multiple sequential tests including full assessments, partial assessments, error handling, and load tests. This typically takes <span className="font-semibold">3-5 minutes</span> depending on the use case. Output streams in real-time below.
                </p>
              </div>
              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {scriptContent}
                </pre>
                <button
                  onClick={() => copyToClipboard(scriptContent)}
                  className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Run Script button */}
              <button
                onClick={handleScriptRun}
                disabled={scriptRunning}
                className="w-full btn-primary text-sm py-2.5 justify-center gap-2 flex items-center"
              >
                {scriptRunning ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {scriptRunning ? `Running test script... ${scriptElapsed}s` : 'Run Script'}
              </button>

              {/* Error */}
              {scriptError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-xs font-semibold text-red-700 mb-1">Error</div>
                  <div className="text-sm text-red-600">{scriptError}</div>
                </div>
              )}

              {/* Script output */}
              {scriptResponse && (
                <>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      Exit code:{' '}
                      <span className={scriptResponse.exit_code === 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {scriptResponse.exit_code}
                      </span>
                    </span>
                    {scriptResponse.duration_ms != null && (
                      <span>Duration: {scriptResponse.duration_ms}ms</span>
                    )}
                  </div>
                  <ResultBlock
                    title="Output"
                    durationMs={scriptResponse.duration_ms}
                    content={scriptResponse.output}
                    expanded={scriptExpanded}
                    onToggle={() => setScriptExpanded(!scriptExpanded)}
                    onCopy={copyToClipboard}
                    copied={copied}
                  />
                  <button
                    onClick={clearScriptResults}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear Results
                  </button>
                </>
              )}
            </div>
          )}

          {/* ===================== Custom Tab ===================== */}
          {activeTab === 'custom' && (
            <div className="space-y-5">
              {/* Assessment Type */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                  {typeField.replace(/_/g, ' ')}
                </label>
                <select
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                >
                  {typeValues.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {/* JSON Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Test Payload (JSON)
                  </label>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Editable</span>
                </div>
                {sampleLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                    <LoadingSpinner size="sm" />
                    Loading sample data...
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-colors">
                    <div className="flex">
                      {/* Line numbers */}
                      <div className="select-none bg-slate-800 text-slate-500 text-xs font-mono text-right py-3 px-2 leading-relaxed min-w-[2.5rem] border-r border-slate-700" aria-hidden="true">
                        {(customJson || '').split('\n').map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Editor */}
                      <textarea
                        value={customJson}
                        onChange={(e) => handleJsonChange(e.target.value)}
                        spellCheck={false}
                        className="w-full min-h-[200px] px-3 py-3 text-sm font-mono bg-slate-900 text-slate-100 focus:outline-none resize-y leading-relaxed"
                      />
                    </div>
                  </div>
                )}
                {/* Validation indicator */}
                {customJson && !sampleLoading && (
                  <div className={`mt-1.5 text-xs font-medium ${jsonValid ? 'text-emerald-600' : 'text-red-500'}`}>
                    {jsonValid ? 'Valid JSON' : `Invalid JSON: ${jsonErrorMsg}`}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleUploadJson}
                  disabled={uploading || !jsonValid || !customJson}
                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  )}
                  {uploading ? 'Uploading...' : 'Upload to S3'}
                </button>
                <button
                  onClick={handleCustomRun}
                  disabled={customRunning || !jsonValid || !customJson}
                  className="flex-1 btn-primary text-sm py-2.5 justify-center gap-2 flex items-center"
                >
                  {customRunning ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {customRunning ? `Invoking runtime... ${customElapsed}s` : 'Run Test'}
                </button>
              </div>

              {/* Upload result */}
              {uploadedKey && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-xs font-semibold text-emerald-700">Uploaded: </span>
                  <span className="text-xs font-mono text-emerald-600 break-all">{uploadedKey}</span>
                </div>
              )}
              {uploadError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-xs text-red-700">{uploadError}</span>
                </div>
              )}

              {/* Error */}
              {customError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-xs font-semibold text-red-700 mb-1">Error</div>
                  <div className="text-sm text-red-600">{customError}</div>
                </div>
              )}

              {/* Response */}
              {customResponse && (
                <>
                  <ResultBlock
                    title="Response"
                    durationMs={customResponse.duration_ms}
                    content={formatResponse(customResponse)}
                    expanded={customExpanded}
                    onToggle={() => setCustomExpanded(!customExpanded)}
                    onCopy={copyToClipboard}
                    copied={copied}
                  />
                  <button
                    onClick={clearCustomResults}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear Results
                  </button>
                </>
              )}
            </div>
          )}
          {activeTab === 'app' && frontendUrl && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Application Frontend</h3>
                <p className="text-sm text-slate-500 mb-4">
                  This deployment has a frontend application available via CloudFront. You can open it in a new tab to interact with the deployed use case through its web interface.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-3 bg-slate-900 text-slate-100 rounded-xl text-sm font-mono overflow-x-auto">
                    {frontendUrl}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(frontendUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="px-3 py-3 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copied ? (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={() => window.open(frontendUrl, '_blank')}
                className="w-full py-3 px-4 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2"
              >
                Open Application
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
