import { useState } from 'react';
import { Link } from 'react-router-dom';
import { appFactoryApi } from '../api/client';

const STEPS = [
  { id: 'problem', label: 'The Problem' },
  { id: 'users', label: 'The Users' },
  { id: 'workflow', label: 'The Workflow' },
  { id: 'data', label: 'The Data' },
  { id: 'constraints', label: 'Constraints' },
];

const DOMAIN_OPTIONS = [
  'Retail Banking',
  'Lending',
  'Wealth Management',
  'Capital Markets',
  'Insurance',
  'Compliance & Risk',
  'Operations',
  'Customer Service',
  'Fraud & Security',
  'Other',
];

interface FormData {
  [key: string]: string;
  use_case_name: string;
  problem: string;
  domain: string;
  current_process: string;
  users: string;
  successful_interaction: string;
  workflow: string;
  human_in_loop: string;
  frequency: string;
  data_inputs: string;
  data_outputs: string;
  compliance: string;
  existing_systems: string;
}

const EMPTY: FormData = {
  use_case_name: '',
  problem: '',
  domain: '',
  current_process: '',
  users: '',
  successful_interaction: '',
  workflow: '',
  human_in_loop: '',
  frequency: '',
  data_inputs: '',
  data_outputs: '',
  compliance: '',
  existing_systems: '',
};

export default function AppFactory() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submissionId, setSubmissionId] = useState('');

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const canAdvance = () => {
    if (step === 0) return form.use_case_name.trim() && form.problem.trim() && form.domain && form.current_process.trim();
    if (step === 1) return form.users.trim() && form.successful_interaction.trim();
    if (step === 2) return form.workflow.trim() && form.frequency.trim();
    if (step === 3) return form.data_inputs.trim() && form.data_outputs.trim();
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await appFactoryApi.submit(form);
      setSubmissionId(result.submission_id);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Submission saved</h2>
        <p className="text-slate-500 text-sm mb-1">Your use case has been captured and stored.</p>
        <p className="text-xs text-slate-400 font-mono mb-8">{submissionId}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setForm(EMPTY); setStep(0); setSubmitted(false); setSubmissionId(''); }}
            className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Submit another
          </button>
          <Link to="/" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
    <div className="relative max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8 animate-fade-in">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Home</Link>
        <div className="flex items-center gap-3 mt-3">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">App Factory</h1>
          <span className="px-2.5 py-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full">Coming Soon</span>
        </div>
        <p className="text-slate-500 mt-2 max-w-2xl">Describe the application you want to build. We'll capture your requirements and use them to generate a complete blueprint. <span className="text-slate-400 italic">Blueprint generation is currently in development — submissions are saved for future processing.</span></p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 ${i <= step ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => i < step && setStep(i)}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i < step ? 'bg-blue-600 text-white' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-slate-100 text-slate-400'
              }`}>
                {i < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px w-6 ${i < step ? 'bg-blue-300' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Step 0: The Problem */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">The Problem</h2>
              <p className="text-sm text-slate-500">Tell us about the business problem you're trying to solve.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Give your use case a name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.use_case_name}
                onChange={set('use_case_name')}
                placeholder="e.g. Mortgage Pre-Approval Assistant"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Which part of the business does this affect? <span className="text-red-500">*</span></label>
              <select value={form.domain} onChange={set('domain')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors bg-white">
                <option value="">Select a domain...</option>
                {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">What business problem are you trying to solve? <span className="text-red-500">*</span></label>
              <textarea
                value={form.problem}
                onChange={set('problem')}
                rows={4}
                placeholder="Describe the problem in plain language. What's slow, manual, error-prone, or costly today?"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">How is this handled today? <span className="text-red-500">*</span></label>
              <textarea
                value={form.current_process}
                onChange={set('current_process')}
                rows={3}
                placeholder="Walk us through the current process step by step."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 1: The Users */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">The Users</h2>
              <p className="text-sm text-slate-500">Tell us who will use this application and what success looks like for them.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Who will use this application? <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.users}
                onChange={set('users')}
                placeholder="e.g. Loan officers (internal), mortgage applicants (customers)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">What does a successful interaction look like? <span className="text-red-500">*</span></label>
              <textarea
                value={form.successful_interaction}
                onChange={set('successful_interaction')}
                rows={4}
                placeholder="Describe the ideal outcome from the user's perspective. What did they do, what did they get back?"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 2: The Workflow */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">The Workflow</h2>
              <p className="text-sm text-slate-500">Help us understand the process from start to finish.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Walk us through the process step by step <span className="text-red-500">*</span></label>
              <textarea
                value={form.workflow}
                onChange={set('workflow')}
                rows={5}
                placeholder="1. Something goes in&#10;2. Something happens&#10;3. Something comes out"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Are there any human approvals or decisions involved?</label>
              <textarea
                value={form.human_in_loop}
                onChange={set('human_in_loop')}
                rows={2}
                placeholder="e.g. A manager reviews decisions above $500k. Otherwise leave blank."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">How often does this process run? <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.frequency}
                onChange={set('frequency')}
                placeholder="e.g. Triggered per customer request, ~500/day"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Step 3: The Data */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">The Data</h2>
              <p className="text-sm text-slate-500">What information does this application work with?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">What information does the application need to work with? <span className="text-red-500">*</span></label>
              <textarea
                value={form.data_inputs}
                onChange={set('data_inputs')}
                rows={3}
                placeholder="e.g. Customer documents (PDFs), a live database, an external API..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">What does the output look like? <span className="text-red-500">*</span></label>
              <textarea
                value={form.data_outputs}
                onChange={set('data_outputs')}
                rows={3}
                placeholder="e.g. A PDF report, an alert sent to a team, a decision stored in a database..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 4: Constraints */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Constraints</h2>
              <p className="text-sm text-slate-500">Any regulatory requirements or existing systems we need to know about?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Any regulatory or compliance requirements?</label>
              <textarea
                value={form.compliance}
                onChange={set('compliance')}
                rows={3}
                placeholder="e.g. GDPR, SOC 2, ECOA, FINRA... or leave blank if none."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Does this need to connect to any existing systems?</label>
              <textarea
                value={form.existing_systems}
                onChange={set('existing_systems')}
                rows={3}
                placeholder="e.g. Our core banking system, Salesforce CRM, an internal data warehouse..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save use case'}
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
