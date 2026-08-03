import { useState, useEffect } from 'react';
import { policiesApi } from '../../api/client';
import CedarEditor from './CedarEditor';

interface Props {
  engineId: string;
  engineName: string;
  onComplete: () => void;
  onBack: () => void;
}

type Mode = 'choose' | 'template' | 'visual' | 'code';

interface PolicyRule {
  id: string;
  type: 'deny' | 'require';
  category: string;
  target: string;
  condition: string;
  value: string;
  action: 'enforce' | 'log';
}

const PRESETS = [
  {
    id: 'restricted-ops',
    name: 'Restricted Operations',
    description: 'Prevent agents from executing destructive tools — no shell commands, no file writes.',
    icon: '🔒',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_executor', condition: 'always', value: '', action: 'enforce' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'file_write', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  (context has tool_name && context.tool_name == "bash_executor")\n  || (context has tool_name && context.tool_name == "file_write")\n};`,
  },
  {
    id: 'model-restriction',
    name: 'Model Restriction',
    description: 'Deny access to high-cost model tiers.',
    icon: '🧠',
    color: 'amber',
    category: 'cost',
    rules: [
      { id: '1', type: 'deny' as const, category: 'models', target: 'model_id', condition: 'equals', value: 'opus', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  context has model_id && context.model_id like "*opus*"\n};`,
  },
  {
    id: 'guardrail-required',
    name: 'Require Guardrail',
    description: 'Deny all requests without a Bedrock Guardrail.',
    icon: '✅',
    color: 'blue',
    category: 'compliance',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'guardrail_attached', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  !(context has guardrail_attached) || context.guardrail_attached == false\n};`,
  },
  {
    id: 'deny-http',
    name: 'Block External Calls',
    description: 'Prevent agents from making HTTP requests to external services.',
    icon: '🌐',
    color: 'purple',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'http_request', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  context has tool_name && context.tool_name == "http_request"\n};`,
  },
  {
    id: 'read-only',
    name: 'Read-Only Mode',
    description: 'Allow only read operations — block writes, deletes, and shell execution.',
    icon: '👁️',
    color: 'slate',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'file_write', condition: 'always', value: '', action: 'enforce' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'bash_executor', condition: 'always', value: '', action: 'enforce' as const },
      { id: '3', type: 'deny' as const, category: 'tools', target: 'http_request', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  (context has tool_name && context.tool_name == "file_write")\n  || (context has tool_name && context.tool_name == "bash_executor")\n  || (context has tool_name && context.tool_name == "http_request")\n};`,
  },
  {
    id: 'deny-dangerous-tools',
    name: 'Deny Dangerous Tools',
    description: 'Block shell commands, file writes, and network egress in one policy.',
    icon: '🛡️',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_executor', condition: 'always', value: '', action: 'enforce' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'file_write', condition: 'always', value: '', action: 'enforce' as const },
      { id: '3', type: 'deny' as const, category: 'tools', target: 'http_request', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  (context has tool_name && context.tool_name == "bash_executor")\n  || (context has tool_name && context.tool_name == "file_write")\n  || (context has tool_name && context.tool_name == "http_request")\n};`,
  },
  {
    id: 's3-data-boundary',
    name: 'S3 Data Boundary',
    description: 'Restrict S3 retrieval to approved buckets (customer-data-prod prefix).',
    icon: '🗄️',
    color: 'blue',
    category: 'compliance',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 's3_retriever', condition: 'matches', value: 'customer-data-prod', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  context has s3_bucket && !(context.s3_bucket like "customer-data-prod-*")\n};`,
  },
  {
    id: 'fsi-trading',
    name: 'FSI Trading Agent Policy',
    description: 'Trading agents: block raw execution tools and require a guardrail.',
    icon: '📈',
    color: 'amber',
    category: 'fsi',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'guardrail_attached', condition: 'always', value: '', action: 'enforce' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'bash_executor', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  (!(context has guardrail_attached) || context.guardrail_attached == false)\n  || (context has tool_name && context.tool_name == "bash_executor")\n};`,
  },
  {
    id: 'fsi-kyc',
    name: 'FSI KYC/AML Agent Policy',
    description: 'KYC agents: require guardrail and block file writes on customer data.',
    icon: '🔍',
    color: 'blue',
    category: 'fsi',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'guardrail_attached', condition: 'always', value: '', action: 'enforce' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'file_write', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  (!(context has guardrail_attached) || context.guardrail_attached == false)\n  || (context has tool_name && context.tool_name == "file_write")\n};`,
  },
  // --- Ported from the Template Library, rewritten with valid AgentCore Cedar ---
  {
    id: 'healthcare-phi',
    name: 'Healthcare PHI Access Policy',
    description: 'HIPAA: only agents tagged role=clinical may invoke tools on PHI data.',
    icon: '🏥',
    color: 'blue',
    category: 'healthcare',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'clinical_role', condition: 'always', value: '', action: 'enforce' as const },
    ],
    // Deny unless the caller is a verified clinical agent (single statement —
    // AgentCore allows one statement per policy).
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) unless {\n  principal is AgentCore::OAuthUser &&\n  principal.hasTag("role") && principal.getTag("role") == "clinical"\n};`,
  },
  {
    id: 'network-egress-allowlist',
    name: 'Network Egress Allowlist',
    description: 'Block the outbound HTTP tool entirely (allowlist enforced at the tool layer).',
    icon: '🌐',
    color: 'purple',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'http_request', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  context has tool_name && context.tool_name == "http_request"\n};`,
  },
  // --- AWS best-practice patterns (tag/principal based — from AgentCore policy docs) ---
  {
    id: 'aws-verified-principal',
    name: 'Verified Principal Only',
    description: 'AWS pattern: deny unless the caller is a verified OAuth user (tag verified=true).',
    icon: '🪪',
    color: 'blue',
    category: 'security',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'verified', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) unless {\n  principal is AgentCore::OAuthUser &&\n  principal.hasTag("verified") && principal.getTag("verified") == "true"\n};`,
  },
  {
    id: 'aws-role-gated',
    name: 'Role-Gated Access',
    description: 'AWS pattern: only manager/director roles may call tools on this gateway.',
    icon: '👔',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'role', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) unless {\n  principal is AgentCore::OAuthUser &&\n  principal.hasTag("role") &&\n  ["manager", "director"].contains(principal.getTag("role"))\n};`,
  },
  {
    id: 'aws-scope-restriction',
    name: 'OAuth Scope Restriction',
    description: 'AWS pattern: require an OAuth scope tag matching payment:process.',
    icon: '🔑',
    color: 'amber',
    category: 'compliance',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'scope', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) unless {\n  principal is AgentCore::OAuthUser &&\n  principal.hasTag("scope") &&\n  principal.getTag("scope") like "*payment:process*"\n};`,
  },
  {
    id: 'aws-suspend-user',
    name: 'Block Suspended User',
    description: 'AWS pattern: deny all actions from a user tagged as suspended.',
    icon: '🚫',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'compliance', target: 'suspended', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(\n  principal is AgentCore::OAuthUser,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  principal.hasTag("status") && principal.getTag("status") == "suspended"\n};`,
  },
  {
    id: 'aws-emergency-shutdown',
    name: 'Emergency Shutdown',
    description: 'AWS pattern: break-glass — deny ALL tool calls through this gateway.',
    icon: '🛑',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'all', condition: 'always', value: '', action: 'enforce' as const },
    ],
    cedar: `forbid(principal, action, resource is AgentCore::Gateway);`,
  },
];

const TOOL_TARGETS = [
  { value: 'bash_executor', label: 'Bash/Shell Executor' },
  { value: 'file_write', label: 'File Write' },
  { value: 'file_read', label: 'File Read' },
  { value: 'http_request', label: 'HTTP Request' },
  { value: 's3_retriever', label: 'S3 Retriever' },
];

const MODEL_TARGETS = [
  { value: 'model_id', label: 'Model ID' },
];

const COMPLIANCE_TARGETS = [
  { value: 'guardrail_attached', label: 'Guardrail Attached' },
];

const TARGET_OPTIONS: Record<string, { value: string; label: string }[]> = {
  tools: TOOL_TARGETS,
  models: MODEL_TARGETS,
  compliance: COMPLIANCE_TARGETS,
};

export default function PolicyCreateFlow({ engineId, engineName, onComplete, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [cedarCode, setCedarCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('all');

  // Preload a template stashed by the Template Library ("Use Template" deep-link).
  // In the engine-first flow the user first picks an engine, then lands here.
  useEffect(() => {
    const stashed = sessionStorage.getItem('policyTemplate');
    if (!stashed) return;
    try {
      const t = JSON.parse(stashed);
      if (t.name) setName(t.name);
      if (t.description) setDescription(t.description);
      if (t.cedarPreview) {
        setCedarCode(t.cedarPreview);
        setMode('code');
      }
    } catch {
      // ignore malformed payload
    } finally {
      sessionStorage.removeItem('policyTemplate');
    }
  }, []);

  // Generate Cedar from visual rules
  const generateCedar = (ruleList: PolicyRule[]): string => {
    const enforceRules = ruleList.filter(r => r.action === 'enforce');
    if (enforceRules.length === 0) {
      return 'permit(principal, action, resource is AgentCore::Gateway);';
    }

    const conditions = enforceRules.map((rule) => {
      if (rule.type === 'deny') {
        if (rule.value) {
          return `context has ${rule.target} && context.${rule.target} like "*${rule.value}*"`;
        }
        return `context has tool_name && context.tool_name == "${rule.target}"`;
      }
      if (rule.type === 'require') {
        return `!(context has ${rule.target}) || context.${rule.target} == false`;
      }
      return `context has ${rule.target}`;
    });

    const combined = conditions.map(c => `  (${c})`).join('\n  || ');
    return `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n${combined}\n};`;
  };

  const addRule = (category: string) => {
    const targets = TARGET_OPTIONS[category] || [];
    setRules([...rules, {
      id: Date.now().toString(),
      type: 'deny',
      category,
      target: targets[0]?.value || '',
      condition: 'always',
      value: '',
      action: 'enforce',
    }]);
  };

  const updateRule = (id: string, updates: Partial<PolicyRule>) => {
    setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    setDescription(preset.description);
    setRules(preset.rules);
    setCedarCode(preset.cedar);
    // Land in code mode so the template's hand-authored Cedar is what gets
    // submitted (the visual builder would regenerate/oversimplify it). Users
    // can still review and edit the Cedar before creating.
    setMode('code');
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please provide a policy name'); return; }

    const finalCedar = mode === 'code' ? cedarCode : generateCedar(rules);
    if (!finalCedar.trim()) { setError('Policy must have Cedar content'); return; }

    setCreating(true);
    setError('');
    try {
      await policiesApi.create({
        name,
        description: description || undefined,
        resource_type: 'gateway',
        rules: mode === 'code' ? [] : rules,
        cedar_code: finalCedar,
        engine_id: engineId,
      });
      onComplete();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to create policy');
    } finally {
      setCreating(false);
    }
  };

  const typeColors = {
    deny: 'bg-red-100 text-red-700 border-red-200',
    require: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const actionColors = {
    enforce: 'bg-red-500 text-white',
    log: 'bg-slate-500 text-white',
  };

  // --- Choose mode ---
  if (mode === 'choose') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Policy</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Engine: <span className="font-mono text-indigo-600">{engineName}</span>
            </p>
          </div>
          <button onClick={onBack} className="btn-secondary text-sm">Back</button>
        </div>

        {/* Three creation modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Template */}
          <button
            onClick={() => setMode('template')}
            className="card text-left hover:border-indigo-200 hover:shadow-lg transition-all group p-6"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 mb-1">From Template</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Start with a pre-built policy for common scenarios like tool restrictions or compliance requirements.</p>
          </button>

          {/* Visual Builder */}
          <button
            onClick={() => setMode('visual')}
            className="card text-left hover:border-indigo-200 hover:shadow-lg transition-all group p-6"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 mb-1">Visual Builder</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Drag-and-drop rule builder — configure deny/require rules visually and auto-generate Cedar code.</p>
          </button>

          {/* Code Editor */}
          <button
            onClick={() => setMode('code')}
            className="card text-left hover:border-indigo-200 hover:shadow-lg transition-all group p-6"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 mb-1">Cedar Code Editor</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Write raw Cedar policy statements with full syntax highlighting, autocomplete, and validation.</p>
          </button>
        </div>
      </div>
    );
  }

  // --- Template selection ---
  if (mode === 'template') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Choose Template</h2>
            <p className="text-sm text-slate-500 mt-0.5">Select a preset — you can customize it after</p>
          </div>
          <button onClick={() => setMode('choose')} className="btn-secondary text-sm">Back</button>
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {['all', ...Array.from(new Set(PRESETS.map(p => p.category)))].map((cat) => (
            <button
              key={cat}
              onClick={() => setTemplateCategory(cat)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium capitalize transition-colors ${
                templateCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
              <span className="ml-1 opacity-60">
                {cat === 'all' ? PRESETS.length : PRESETS.filter(p => p.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRESETS.filter(p => templateCategory === 'all' || p.category === templateCategory).map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="card text-left hover:border-indigo-200 hover:shadow-lg transition-all group relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                preset.color === 'red' ? 'from-red-400 to-red-600' :
                preset.color === 'amber' ? 'from-amber-400 to-amber-600' :
                preset.color === 'blue' ? 'from-blue-400 to-blue-600' :
                preset.color === 'purple' ? 'from-purple-400 to-purple-600' :
                'from-slate-400 to-slate-600'
              }`} />
              <div className="flex items-start gap-3 pt-2">
                <span className="text-2xl">{preset.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{preset.name}</h3>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-500 capitalize">{preset.category}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{preset.description}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">{preset.rules.length} rules</span>
                    {preset.rules.map((r, i) => (
                      <span key={i} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${typeColors[r.type]}`}>
                        {r.type.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Start blank */}
        <button
          onClick={() => setMode('visual')}
          className="card w-full text-left hover:border-slate-300 transition-all border-dashed"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Blank Policy</h3>
              <p className="text-xs text-slate-500">Start with an empty rule set</p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // --- Visual Builder ---
  if (mode === 'visual') {
    const cedarPreview = generateCedar(rules);

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Visual Policy Builder</h2>
            <p className="text-sm text-slate-500 mt-0.5">Add rules and see the Cedar policy generated in real-time</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMode('choose')} className="btn-secondary text-sm">Back</button>
            <button
              onClick={() => { setCedarCode(cedarPreview); setMode('code'); }}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              Switch to Code
            </button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        {/* Policy metadata */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Policy Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Restrictions"
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this policy enforce?"
              className="input-field"
            />
          </div>
        </div>

        {/* Two-column: rules + preview */}
        <div className="grid grid-cols-5 gap-4">
          {/* Left: Rules */}
          <div className="col-span-3 space-y-3">
            {/* Category headers with add buttons */}
            {[
              { id: 'tools', label: 'Tool Access', icon: '🔧', desc: 'Control which tools agents can invoke' },
              { id: 'models', label: 'Model Access', icon: '🧠', desc: 'Restrict which models can be used' },
              { id: 'compliance', label: 'Compliance', icon: '✅', desc: 'Require guardrails or security attributes' },
            ].map(cat => {
              const catRules = rules.filter(r => r.category === cat.id);
              return (
                <div key={cat.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                        {catRules.length > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                            {catRules.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => addRule(cat.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Add
                    </button>
                  </div>

                  {catRules.length > 0 && (
                    <div className="px-4 pb-3 pt-2 space-y-2">
                      {catRules.map(rule => (
                        <div key={rule.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                          {/* Type */}
                          <select
                            value={rule.type}
                            onChange={(e) => updateRule(rule.id, { type: e.target.value as 'deny' | 'require' })}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold border cursor-pointer ${typeColors[rule.type]}`}
                          >
                            <option value="deny">DENY</option>
                            <option value="require">REQUIRE</option>
                          </select>

                          {/* Target */}
                          <select
                            value={rule.target}
                            onChange={(e) => updateRule(rule.id, { target: e.target.value })}
                            className="flex-1 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                          >
                            {(TARGET_OPTIONS[rule.category] || []).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>

                          {/* Value input for model_id */}
                          {rule.target === 'model_id' && (
                            <input
                              type="text"
                              value={rule.value}
                              onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                              placeholder="e.g., opus"
                              className="w-24 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                            />
                          )}

                          {/* Action */}
                          <select
                            value={rule.action}
                            onChange={(e) => updateRule(rule.id, { action: e.target.value as 'enforce' | 'log' })}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold border-0 cursor-pointer ${actionColors[rule.action]}`}
                          >
                            <option value="enforce">ENFORCE</option>
                            <option value="log">LOG</option>
                          </select>

                          {/* Remove */}
                          <button onClick={() => removeRule(rule.id)} className="p-1 text-slate-400 hover:text-red-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Live Cedar preview */}
          <div className="col-span-2">
            <div className="sticky top-0 rounded-xl border border-slate-700/50 overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e1e2e] border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${rules.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-[11px] text-slate-400 font-mono">Generated Cedar</span>
                </div>
                <span className="text-[10px] text-slate-500">{rules.filter(r => r.action === 'enforce').length} enforce / {rules.filter(r => r.action === 'log').length} log</span>
              </div>
              <div className="bg-[#1e1e2e] p-4 min-h-[200px]">
                <pre className="text-xs text-emerald-300 font-mono leading-relaxed whitespace-pre-wrap">
                  {cedarPreview}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Create button */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {rules.length} rules • {rules.filter(r => r.action === 'enforce').length} enforcing • Engine: {engineName}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || rules.length === 0}
            className="btn-primary text-sm px-6 disabled:opacity-50"
          >
            {creating ? 'Deploying...' : 'Deploy Cedar Policy'}
          </button>
        </div>
      </div>
    );
  }

  // --- Code Editor mode ---
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Cedar Code Editor</h2>
          <p className="text-sm text-slate-500 mt-0.5">Write Cedar policies directly — full language support with autocomplete</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode('choose')} className="btn-secondary text-sm">Back</button>
          <button
            onClick={() => setMode('visual')}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281" />
            </svg>
            Switch to Visual
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      {/* Policy metadata */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Policy Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Custom Cedar Policy"
            className="input-field"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this policy enforce?"
            className="input-field"
          />
        </div>
      </div>

      {/* Cedar Editor */}
      <CedarEditor
        value={cedarCode}
        onChange={setCedarCode}
        height="350px"
      />

      {/* Create button */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          Engine: {engineName} • Raw Cedar mode
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim() || !cedarCode.trim()}
          className="btn-primary text-sm px-6 disabled:opacity-50"
        >
          {creating ? 'Deploying...' : 'Deploy Cedar Policy'}
        </button>
      </div>
    </div>
  );
}
