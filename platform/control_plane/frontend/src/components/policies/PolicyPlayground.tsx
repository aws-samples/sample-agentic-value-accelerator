/**
 * PolicyPlayground — Test Cedar policies against sample requests before deployment.
 *
 * Similar to Guardrails Playground:
 * - Select policy to test
 * - Define test request (principal, action, resource, context)
 * - Execute evaluation and see detailed decision trace
 * - Save test cases for regression testing
 */

import { useState } from 'react';

interface TestRequest {
  principal: string;
  action: string;
  resource: string;
  context: Record<string, string | number | boolean>;
}

interface TestResult {
  decision: 'ALLOW' | 'DENY' | 'ERROR';
  reason: string;
  matchedPolicies: string[];
  evaluationPath: string[];
  latency: string;
}

const SAMPLE_POLICIES = [
  { id: 'restricted-ops', name: 'Restricted Operations', rules: 8 },
  { id: 'cost-control', name: 'Cost Control', rules: 4 },
  { id: 'data-boundary', name: 'Data Boundary', rules: 6 },
  { id: 'audit-everything', name: 'Full Audit', rules: 3 },
];

const PRESET_TESTS = [
  { name: 'Agent bash exec', principal: 'agent:fraud-detector', action: 'tools:bash_execute', resource: 'shell:*', expect: 'DENY' },
  { name: 'S3 read allowed bucket', principal: 'agent:kyc-agent', action: 's3:GetObject', resource: 's3:customer-data/*', expect: 'ALLOW' },
  { name: 'Opus model invoke', principal: 'agent:trading-assistant', action: 'bedrock:InvokeModel', resource: 'model:claude-opus-4', expect: 'DENY' },
  { name: 'Haiku model invoke', principal: 'agent:kyc-agent', action: 'bedrock:InvokeModel', resource: 'model:claude-haiku-4', expect: 'ALLOW' },
  { name: 'External egress', principal: 'agent:customer-service', action: 'network:egress', resource: 'external:api.stripe.com', expect: 'DENY' },
];

interface TestSuite {
  id: number;
  name: string;
  tests: number;
  lastRun: string;
  passing: number;
  isRunning?: boolean;
  results?: { passed: number; failed: number; duration: string }[];
}

const INITIAL_SUITES: TestSuite[] = [
  { id: 1, name: 'Core Security Tests', tests: 12, lastRun: '2 hours ago', passing: 12 },
  { id: 2, name: 'Cost Guardrails', tests: 8, lastRun: '1 day ago', passing: 8 },
  { id: 3, name: 'Data Access Boundary', tests: 15, lastRun: '3 hours ago', passing: 14 },
];

export default function PolicyPlayground() {
  const [selectedPolicy, setSelectedPolicy] = useState(SAMPLE_POLICIES[0].id);
  const [request, setRequest] = useState<TestRequest>({
    principal: 'agent:fraud-detector',
    action: 'tools:bash_execute',
    resource: 'shell:*',
    context: { environment: 'production', region: 'us-east-1' },
  });
  const [result, setResult] = useState<TestResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [activeTab, setActiveTab] = useState<'test' | 'suites'>('test');
  const [testSuites, setTestSuites] = useState<TestSuite[]>(INITIAL_SUITES);
  const [suiteResults, setSuiteResults] = useState<{[key: number]: {
    passed: number;
    failed: number;
    total: number;
    duration: string;
    tests: {
      name: string;
      status: 'pass' | 'fail';
      duration: string;
      principal: string;
      action: string;
      resource: string;
      decision: 'ALLOW' | 'DENY';
      expectedDecision: 'ALLOW' | 'DENY';
      reason: string;
      cedarRule: string;
      evaluationTrace: string[];
    }[]
  }} | null>(null);
  const [runningSuiteId, setRunningSuiteId] = useState<number | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  const runEvaluation = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      const isDeny = request.action.includes('bash') || request.action.includes('execute') ||
                    (request.action.includes('InvokeModel') && request.resource.includes('opus')) ||
                    request.action.includes('egress');

      setResult({
        decision: isDeny ? 'DENY' : 'ALLOW',
        reason: isDeny
          ? `Explicit deny rule matched for action "${request.action}"`
          : `No deny rules matched; default allow`,
        matchedPolicies: [selectedPolicy],
        evaluationPath: [
          `Load policy: ${selectedPolicy}`,
          `Parse principal: ${request.principal}`,
          `Parse action: ${request.action}`,
          `Parse resource: ${request.resource}`,
          `Evaluate deny rules (8 rules)`,
          isDeny ? `Rule match: deny-dangerous-tools` : `No deny rule matched`,
          `Evaluate permit rules (${isDeny ? 'skipped' : '3 rules'})`,
          isDeny ? 'Decision: DENY' : 'Rule match: default-permit → Decision: ALLOW',
        ],
        latency: `${(1.5 + Math.random() * 2).toFixed(1)}ms`,
      });
      setIsEvaluating(false);
    }, 600);
  };

  const loadPreset = (preset: typeof PRESET_TESTS[0]) => {
    setRequest({
      principal: preset.principal,
      action: preset.action,
      resource: preset.resource,
      context: { environment: 'production', region: 'us-east-1' },
    });
    setResult(null);
  };

  const runTestSuite = (suiteId: number) => {
    const suite = testSuites.find(s => s.id === suiteId);
    if (!suite) return;

    setRunningSuiteId(suiteId);
    setSuiteResults(null);
    setExpandedTestId(null);

    // Detailed test cases with Cedar policies
    const testCases = [
      {
        name: 'Deny bash execution',
        principal: 'agent:fraud-detector',
        action: 'tools:bash_execute',
        resource: 'shell:*',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"tools:bash_execute",
  resource
);`,
        reason: 'Explicit deny rule blocks all bash/shell execution for safety',
      },
      {
        name: 'Deny file write operations',
        principal: 'agent:data-processor',
        action: 'tools:file_write',
        resource: 'fs:/etc/config',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"tools:file_write",
  resource
) unless {
  resource.path like "/tmp/*"
};`,
        reason: 'File writes blocked except to /tmp directory',
      },
      {
        name: 'Allow S3 read from approved bucket',
        principal: 'agent:kyc-agent',
        action: 's3:GetObject',
        resource: 's3:customer-data-prod/reports/*',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `permit (
  principal,
  action == Action::"s3:GetObject",
  resource
) when {
  resource.bucket like "customer-data-*"
};`,
        reason: 'S3 read permitted for buckets matching customer-data-* pattern',
      },
      {
        name: 'Deny external network egress',
        principal: 'agent:customer-service',
        action: 'network:egress',
        resource: 'external:api.unknown.com',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"network:egress",
  resource
) unless {
  resource.endpoint in [
    "api.stripe.com",
    "*.amazonaws.com"
  ]
};`,
        reason: 'External egress blocked - endpoint not in allowlist',
      },
      {
        name: 'Allow Haiku model invocation',
        principal: 'agent:kyc-agent',
        action: 'bedrock:InvokeModel',
        resource: 'model:claude-haiku-4',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `permit (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource
) when {
  resource.modelTier in ["haiku", "sonnet"]
};`,
        reason: 'Haiku tier models permitted for all agents',
      },
      {
        name: 'Deny Opus model for non-premium',
        principal: 'agent:trading-assistant',
        action: 'bedrock:InvokeModel',
        resource: 'model:claude-opus-4',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource
) when {
  resource.modelTier == "opus"
} unless {
  principal.costTier == "premium"
};`,
        reason: 'Opus tier restricted to premium cost tier principals',
      },
      {
        name: 'Require audit context present',
        principal: 'agent:compliance-bot',
        action: 'data:query',
        resource: 'db:transactions',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `forbid (
  principal,
  action,
  resource
) unless {
  context.traceId != "" &&
  context.spanId != ""
};`,
        reason: 'Audit context (traceId, spanId) present in request',
      },
      {
        name: 'Validate tenant boundary',
        principal: 'agent:customer-service',
        action: 'data:read',
        resource: 'tenant:acme-corp/customers',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `permit (
  principal,
  action in [Action::"data:read"],
  resource
) when {
  resource.tenantId == context.tenantId
};`,
        reason: 'Request tenant matches principal tenant context',
      },
      {
        name: 'Check token limits enforced',
        principal: 'agent:research-agent',
        action: 'bedrock:InvokeModel',
        resource: 'model:claude-sonnet-4',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource
) when {
  context.sessionTokens >= 100000
};`,
        reason: 'Session token limit (100k) exceeded - currently at 125,432',
      },
      {
        name: 'Verify PII handling rules',
        principal: 'agent:kyc-agent',
        action: 'data:AccessPII',
        resource: 'pii:ssn',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `permit (
  principal in AgentGroup::"kyc",
  action == Action::"data:AccessPII",
  resource
) when {
  principal.piiClearance == true
};`,
        reason: 'KYC agent group has PII clearance for SSN access',
      },
      {
        name: 'Test rate limiting',
        principal: 'agent:notification-sender',
        action: 'messaging:send',
        resource: 'channel:email',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"messaging:send",
  resource
) when {
  context.hourlyMessageCount >= 1000
};`,
        reason: 'Hourly message count (247) under limit (1000)',
      },
      {
        name: 'Validate approval workflow',
        principal: 'agent:trading-assistant',
        action: 'trading:ExecuteOrder',
        resource: 'order:12345',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action == Action::"trading:ExecuteOrder",
  resource
) when {
  context.orderValue > 10000
} unless {
  context.humanApproved == true
};`,
        reason: 'Order value ($45,000) exceeds threshold, human approval required',
      },
      {
        name: 'Check scope isolation',
        principal: 'agent:task-worker-1',
        action: 'agent:invoke',
        resource: 'agent:task-worker-2',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal in AgentGroup::"task-agents",
  action == Action::"agent:invoke",
  resource in AgentGroup::"task-agents"
);`,
        reason: 'Task agents cannot directly invoke other task agents (lateral movement blocked)',
      },
      {
        name: 'Deny IAM escalation attempt',
        principal: 'agent:admin-helper',
        action: 'iam:AttachRolePolicy',
        resource: 'role:AdminRole',
        expectedDecision: 'DENY' as const,
        cedarRule: `forbid (
  principal,
  action in [
    Action::"iam:AttachRolePolicy",
    Action::"iam:CreateRole",
    Action::"iam:PutRolePolicy"
  ],
  resource
);`,
        reason: 'IAM modification actions unconditionally blocked for all agents',
      },
      {
        name: 'Verify logging enabled',
        principal: 'agent:data-processor',
        action: 'logs:PutLogEvents',
        resource: 'log-group:agent-traces',
        expectedDecision: 'ALLOW' as const,
        cedarRule: `permit (
  principal,
  action == Action::"logs:PutLogEvents",
  resource
) when {
  context.loggingEnabled == true
};`,
        reason: 'Logging context flag enabled, write permitted',
      },
    ];

    // Simulate running tests with progress
    setTimeout(() => {
      const tests = Array.from({ length: suite.tests }, (_, i) => {
        const testCase = testCases[i % testCases.length];
        // Simulate occasional test failures (decision doesn't match expected)
        const actualMatchesExpected = Math.random() > 0.1;
        const actualDecision = actualMatchesExpected ? testCase.expectedDecision : (testCase.expectedDecision === 'ALLOW' ? 'DENY' : 'ALLOW');

        return {
          name: testCase.name + (i >= testCases.length ? ` (variant ${Math.floor(i / testCases.length) + 1})` : ''),
          status: actualMatchesExpected ? 'pass' as const : 'fail' as const,
          duration: `${(Math.random() * 50 + 5).toFixed(0)}ms`,
          principal: testCase.principal,
          action: testCase.action,
          resource: testCase.resource,
          decision: actualDecision,
          expectedDecision: testCase.expectedDecision,
          reason: actualMatchesExpected ? testCase.reason : `Expected ${testCase.expectedDecision} but got ${actualDecision}`,
          cedarRule: testCase.cedarRule,
          evaluationTrace: [
            `Load policy: ${selectedPolicy}`,
            `Parse principal: ${testCase.principal}`,
            `Parse action: ${testCase.action}`,
            `Parse resource: ${testCase.resource}`,
            `Evaluate forbid rules...`,
            actualDecision === 'DENY' ? `Match found in forbid rule` : `No forbid rules matched`,
            actualDecision === 'ALLOW' ? `Evaluate permit rules...` : `Skip permit evaluation (denied)`,
            `Decision: ${actualDecision}`,
          ],
        };
      });

      const passed = tests.filter(t => t.status === 'pass').length;
      const failed = tests.filter(t => t.status === 'fail').length;

      setSuiteResults({
        [suiteId]: {
          passed,
          failed,
          total: suite.tests,
          duration: `${(Math.random() * 2 + 0.5).toFixed(2)}s`,
          tests
        }
      });

      // Update the suite's last run time and passing count
      setTestSuites(prev => prev.map(s =>
        s.id === suiteId
          ? { ...s, lastRun: 'just now', passing: passed }
          : s
      ));

      setRunningSuiteId(null);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Tab Toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('test')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'test' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Interactive Test
        </button>
        <button
          onClick={() => setActiveTab('suites')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'suites' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Test Suites
        </button>
      </div>

      {activeTab === 'test' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Request Builder */}
          <div className="space-y-4">
            {/* Policy Selector */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Policy to Test</label>
              <select
                value={selectedPolicy}
                onChange={e => setSelectedPolicy(e.target.value)}
                className="mt-2 w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {SAMPLE_POLICIES.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.rules} rules)</option>
                ))}
              </select>
            </div>

            {/* Request Fields */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
              <div className="text-sm font-semibold text-slate-900">Authorization Request</div>

              <div>
                <label className="text-xs font-medium text-slate-500">Principal (who)</label>
                <input
                  type="text"
                  value={request.principal}
                  onChange={e => setRequest({ ...request, principal: e.target.value })}
                  className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  placeholder="agent:my-agent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Action (what)</label>
                <input
                  type="text"
                  value={request.action}
                  onChange={e => setRequest({ ...request, action: e.target.value })}
                  className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  placeholder="s3:GetObject"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Resource (on what)</label>
                <input
                  type="text"
                  value={request.resource}
                  onChange={e => setRequest({ ...request, resource: e.target.value })}
                  className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  placeholder="s3:my-bucket/*"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Context (JSON)</label>
                <textarea
                  value={JSON.stringify(request.context, null, 2)}
                  onChange={e => {
                    try {
                      setRequest({ ...request, context: JSON.parse(e.target.value) });
                    } catch { /* ignore parse errors while typing */ }
                  }}
                  rows={3}
                  className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={runEvaluation}
                disabled={isEvaluating}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isEvaluating ? 'Evaluating...' : 'Run Evaluation'}
              </button>
            </div>

            {/* Preset Tests */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Quick Tests</div>
              <div className="space-y-2">
                {PRESET_TESTS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => loadPreset(preset)}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-800 group-hover:text-blue-700">{preset.name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        preset.expect === 'ALLOW' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        Expect: {preset.expect}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{preset.action}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            {result ? (
              <>
                {/* Decision Badge */}
                <div className={`rounded-xl border-2 p-6 text-center ${
                  result.decision === 'ALLOW'
                    ? 'border-emerald-200 bg-emerald-50'
                    : result.decision === 'DENY'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-rose-200 bg-rose-50'
                }`}>
                  <div className={`text-4xl font-bold ${
                    result.decision === 'ALLOW' ? 'text-emerald-600' :
                    result.decision === 'DENY' ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {result.decision}
                  </div>
                  <div className="text-sm text-slate-600 mt-2">{result.reason}</div>
                  <div className="text-xs text-slate-500 mt-1">Evaluated in {result.latency}</div>
                </div>

                {/* Matched Policies */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Matched Policies</div>
                  <div className="flex flex-wrap gap-2">
                    {result.matchedPolicies.map(p => (
                      <span key={p} className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Evaluation Trace */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Evaluation Trace</div>
                  <div className="space-y-1.5">
                    {result.evaluationPath.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-slate-400 font-mono w-4 text-right">{i + 1}.</span>
                        <span className={`font-mono ${
                          step.includes('DENY') ? 'text-amber-600 font-medium' :
                          step.includes('ALLOW') ? 'text-emerald-600 font-medium' :
                          step.includes('match') ? 'text-blue-600' : 'text-slate-600'
                        }`}>
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => window.alert('Test case saved!')}
                    className="flex-1 py-2 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Save as Test Case
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(request, null, 2));
                      window.alert('Request copied to clipboard!');
                    }}
                    className="flex-1 py-2 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Export Request
                  </button>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="text-center text-slate-500">
                  <div className="text-5xl mb-3">⚡</div>
                  <div className="font-medium">Configure a request and run evaluation</div>
                  <div className="text-sm mt-1">Results will appear here</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'suites' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-600">Automated test suites for policy regression testing</div>
            <button
              onClick={() => window.alert('Create Suite functionality coming soon')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Create Suite
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {testSuites.map(suite => (
              <div key={suite.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{suite.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{suite.tests} tests · Last run {suite.lastRun}</div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    suite.passing === suite.tests ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {suite.passing}/{suite.tests}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                  <button
                    onClick={() => runTestSuite(suite.id)}
                    disabled={runningSuiteId === suite.id}
                    className="flex-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {runningSuiteId === suite.id ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Running...
                      </span>
                    ) : 'Run Suite'}
                  </button>
                  <button
                    onClick={() => window.alert(`Editing suite: ${suite.name}`)}
                    className="flex-1 py-1.5 text-xs text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Test Results Panel */}
          {suiteResults && Object.keys(suiteResults).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {Object.entries(suiteResults).map(([suiteId, results]) => {
                const suite = testSuites.find(s => s.id === Number(suiteId));
                return (
                  <div key={suiteId}>
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${results.failed === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="font-medium text-slate-900">{suite?.name} Results</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-600 font-medium">{results.passed} passed</span>
                        {results.failed > 0 && <span className="text-rose-600 font-medium">{results.failed} failed</span>}
                        <span className="text-slate-500">in {results.duration}</span>
                      </div>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
                      {results.tests.map((test, idx) => {
                        const testId = `${suiteId}-${idx}`;
                        const isExpanded = expandedTestId === testId;
                        return (
                          <div key={idx} className={`${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                            <button
                              onClick={() => setExpandedTestId(isExpanded ? null : testId)}
                              className="w-full px-4 py-3 flex items-center justify-between text-left"
                            >
                              <div className="flex items-center gap-3">
                                {test.status === 'pass' ? (
                                  <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                                <div>
                                  <span className={`text-sm font-medium ${test.status === 'pass' ? 'text-slate-800' : 'text-rose-700'}`}>
                                    {test.name}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                      test.decision === 'ALLOW' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {test.decision}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {test.action} on {test.resource}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{test.duration}</span>
                                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-4 border-t border-slate-200 pt-4 mx-4 mb-4 bg-white rounded-lg">
                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Authorization Request</div>
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="bg-slate-50 p-2 rounded-lg">
                                      <div className="text-[10px] text-slate-400 uppercase">Principal</div>
                                      <div className="font-mono text-slate-800 text-xs">{test.principal}</div>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg">
                                      <div className="text-[10px] text-slate-400 uppercase">Action</div>
                                      <div className="font-mono text-slate-800 text-xs">{test.action}</div>
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg">
                                      <div className="text-[10px] text-slate-400 uppercase">Resource</div>
                                      <div className="font-mono text-slate-800 text-xs">{test.resource}</div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4">
                                  <div className={`flex-1 p-3 rounded-lg ${
                                    test.decision === 'ALLOW' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
                                  }`}>
                                    <div className="text-[10px] text-slate-500 uppercase mb-1">Actual</div>
                                    <div className={`text-lg font-bold ${test.decision === 'ALLOW' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {test.decision}
                                    </div>
                                  </div>
                                  <div className={`flex-1 p-3 rounded-lg ${
                                    test.expectedDecision === 'ALLOW' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
                                  }`}>
                                    <div className="text-[10px] text-slate-500 uppercase mb-1">Expected</div>
                                    <div className={`text-lg font-bold ${test.expectedDecision === 'ALLOW' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {test.expectedDecision}
                                    </div>
                                  </div>
                                  <div className={`flex-1 p-3 rounded-lg ${
                                    test.status === 'pass' ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'
                                  }`}>
                                    <div className="text-[10px] text-slate-500 uppercase mb-1">Result</div>
                                    <div className={`text-lg font-bold ${test.status === 'pass' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {test.status === 'pass' ? 'PASS' : 'FAIL'}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reason</div>
                                  <div className={`p-3 rounded-lg text-sm ${
                                    test.status === 'pass' ? 'bg-slate-50 text-slate-700' : 'bg-rose-50 text-rose-700'
                                  }`}>
                                    {test.reason}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Matching Cedar Rule</div>
                                  <pre className="bg-slate-900 text-emerald-300 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                    {test.cedarRule}
                                  </pre>
                                </div>

                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Evaluation Trace</div>
                                  <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                                    {test.evaluationTrace.map((step, stepIdx) => (
                                      <div key={stepIdx} className="flex items-start gap-2 text-xs">
                                        <span className="text-slate-400 font-mono w-4 text-right flex-shrink-0">{stepIdx + 1}.</span>
                                        <span className={`font-mono ${
                                          step.includes('DENY') || step.includes('denied') ? 'text-amber-600 font-medium' :
                                          step.includes('ALLOW') || step.includes('Match found') ? 'text-emerald-600 font-medium' :
                                          step.includes('forbid') || step.includes('permit') ? 'text-blue-600' : 'text-slate-600'
                                        }`}>
                                          {step}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
