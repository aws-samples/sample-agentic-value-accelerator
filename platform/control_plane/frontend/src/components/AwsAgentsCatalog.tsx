import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';

interface AgentCard {
  id: string;
  path: string;
  name: string;
  description: string;
  domain: string;
  domainColor: 'orange' | 'red' | 'violet';
  status: 'Available' | 'Coming Soon';
  logo: string;
  capabilities: string[];
  integrations: string[];
  deploymentPaths: string[];
}

const AWS_AGENTS: AgentCard[] = [
  {
    id: 'aws-devops',
    path: '/aaas/aws-agents/aws-devops',
    name: 'AWS DevOps Agent',
    description: 'Always-on autonomous agent that investigates incidents, correlates telemetry with code and deployments to identify root causes, and proposes targeted mitigations — on AWS, Azure, and on-premises.',
    domain: 'Incident Response & SRE',
    domainColor: 'orange',
    status: 'Available',
    logo: '/logos/aws-devops-agent.svg',
    capabilities: ['Autonomous incident investigation', 'Application topology mapping', 'Natural-language chat', 'On-demand SRE tasks', 'Multi-account coverage'],
    integrations: ['CloudWatch', 'Datadog', 'Dynatrace', 'Grafana', 'New Relic', 'Splunk', 'PagerDuty', 'ServiceNow', 'Slack', 'GitHub Actions', 'GitLab CI/CD', 'EventBridge'],
    deploymentPaths: ['CDK', 'CloudFormation', 'Terraform'],
  },
  {
    id: 'aws-security',
    path: '/aaas/aws-agents/aws-security',
    name: 'AWS Security Agent',
    description: 'Proactive, context-aware application security across the development lifecycle: design security review, code review on pull requests, and on-demand penetration testing that runs multi-step attack scenarios against live web apps and APIs.',
    domain: 'Application Security',
    domainColor: 'red',
    status: 'Coming Soon',
    logo: '/logos/aws-security-agent.svg',
    capabilities: ['Design security review', 'Code security review (PRs)', 'On-demand penetration testing', 'OWASP Top Ten + 13 risk categories', 'Ready-to-apply remediation PRs'],
    integrations: ['GitHub', 'IAM Identity Center', 'CloudTrail'],
    deploymentPaths: ['CDK', 'CloudFormation', 'Terraform'],
  },
  {
    id: 'kiro',
    path: '/aaas/aws-agents/kiro',
    name: 'Kiro',
    description: 'Amazon\'s agentic IDE for spec-driven development — turns high-level requirements into structured specs, then autonomously plans, generates code, runs tests, and updates docs. Installs locally and connects to your AWS workspaces.',
    domain: 'Developer Productivity',
    domainColor: 'violet',
    status: 'Coming Soon',
    logo: '/logos/kiro.svg',
    capabilities: ['Spec-driven development', 'Autonomous AI agents (plan → code → test → docs)', 'Steering files & hooks', 'Contextual code analysis', 'Local IDE with remote workspaces'],
    integrations: ['SageMaker Unified Studio', 'AWS MCP Servers', 'AWS Transform', 'IAM Identity Center'],
    deploymentPaths: [],
  },
];

const DOMAIN_STYLES: Record<string, string> = {
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

export default function AwsAgentsCatalog() {
  const navigate = useNavigate();
  // Keyed by agent.id — latest deployed deployment per agent, or null.
  const [latestByAgent, setLatestByAgent] = useState<Record<string, Deployment | null>>({});

  useEffect(() => {
    deploymentsApi
      .list()
      .then(deps => {
        const result: Record<string, Deployment | null> = {};
        for (const agent of AWS_AGENTS) {
          const tid = `frontier-agents-${agent.id}`;
          const matches = deps.filter(d => d.template_id === tid && d.status === 'deployed');
          matches.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
          result[agent.id] = matches[0] || null;
        }
        setLatestByAgent(result);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(254,215,170,0.5) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(219,234,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/aaas" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Agent-as-a-Service</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">AWS Frontier Agents</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Managed autonomous agents from AWS that run continuously in your accounts — deploy with the infrastructure-as-code tool your team already uses.
          </p>
        </div>

        {/* How it works */}
        <div className="card bg-orange-50/50 border-orange-200/60 mb-8 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-orange-900 font-semibold">How AWS Agent deployment works</p>
              <p className="text-sm text-orange-700/80 mt-1">
                Click <strong>View Deployment</strong> on any agent → pick a deployment path (<strong>CDK</strong>, <strong>CloudFormation</strong>, or <strong>Terraform</strong>) → copy the IaC snippets into your toolchain. Each agent ships with service-scoped IAM roles, an operator web app, and optional cross-account associations.
              </p>
            </div>
          </div>
        </div>

        {/* Agent grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in stagger-2">
          {AWS_AGENTS.map(agent => (
            <div key={agent.id} className="card hover:border-orange-200 transition-all flex flex-col group">
              <div className="flex items-start justify-between mb-4">
                <img src={agent.logo} alt="" className="w-14 h-14 rounded-xl shadow-md ring-1 ring-slate-200/60" />
                <span className={`text-xs font-semibold px-3 py-1 rounded-lg ${
                  agent.status === 'Available'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                }`}>
                  {agent.status}
                </span>
              </div>

              <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-lg border self-start mb-3 ${DOMAIN_STYLES[agent.domainColor]}`}>
                {agent.domain}
              </span>

              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-orange-700 transition-colors">{agent.name}</h3>
              <p className="text-sm text-slate-500 mb-5 flex-1 leading-relaxed">{agent.description}</p>

              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Capabilities</h4>
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map(c => (
                    <span key={c} className="text-xs px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg font-medium">{c}</span>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Integrations</h4>
                <div className="flex flex-wrap gap-1.5">
                  {agent.integrations.map(i => (
                    <span key={i} className="text-xs px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg border border-slate-200">{i}</span>
                  ))}
                </div>
              </div>

              {agent.deploymentPaths.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Deployment Paths</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.deploymentPaths.map(p => (
                      <span key={p} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-medium border border-blue-100">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const dep = latestByAgent[agent.id] || null;
                const operatorUrl = dep?.outputs?.operator_app_url || dep?.outputs?.operatorappurl || dep?.outputs?.OperatorAppUrl;
                return (
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    {dep && (
                      <div className={`grid gap-2 ${operatorUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                          type="button"
                          onClick={() => navigate(`/deployments/${dep.deployment_id}`)}
                          className="btn-secondary text-xs py-2"
                        >
                          View Deployment
                        </button>
                        {operatorUrl && (
                          <button
                            type="button"
                            onClick={() => window.open(operatorUrl, '_blank')}
                            className="text-xs py-2 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors inline-flex items-center justify-center gap-1.5"
                          >
                            Open Operator App
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => navigate(agent.path)}
                      disabled={agent.status !== 'Available'}
                      className={`w-full text-sm py-2 rounded-lg font-medium transition-colors ${
                        agent.status === 'Available'
                          ? 'bg-orange-600 text-white hover:bg-orange-700'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {agent.status !== 'Available' ? 'Coming Soon' : dep ? 'Redeploy →' : 'View Deployment Options →'}
                    </button>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
