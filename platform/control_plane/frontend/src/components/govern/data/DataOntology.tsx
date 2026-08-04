/**
 * DataOntology — Enterprise ontology management for AI agents
 * Decision-centric semantic layer integrated with AVA platform
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { tooltipStyle } from './dataGovernanceData';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';

const OBJECT_TYPES = [
  { name: 'Customer', properties: ['id', 'name', 'segment', 'lifetime_value'], links: ['places → Order', 'assigned → Account Manager'] },
  { name: 'Order', properties: ['id', 'date', 'total', 'status'], links: ['contains → Product', 'placed_by → Customer'] },
  { name: 'Product', properties: ['sku', 'name', 'category', 'price'], links: ['part_of → Order', 'supplied_by → Vendor'] },
  { name: 'Agent', properties: ['id', 'type', 'capabilities', 'status'], links: ['accesses → Data Source', 'governed_by → Policy'] },
];

const AGENT_CAPABILITIES: { name: string; description: string; icon: IconName; color: string }[] = [
  { name: 'Query', description: 'Navigate and retrieve data across the ontology', icon: 'magnifying-glass', color: 'blue' },
  { name: 'Recommend', description: 'Surface solutions based on semantic relationships', icon: 'light-bulb', color: 'amber' },
  { name: 'Stage', description: 'Propose decisions in sandboxed scenarios', icon: 'viewfinder-circle', color: 'violet' },
  { name: 'Act', description: 'Execute within defined governance boundaries', icon: 'bolt', color: 'emerald' },
];

export default function DataOntology() {
  const dg = useDataGovernance();
  const [toast, setToast] = useState<string | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // Ontology structure metrics derived from OBJECT_TYPES
  const totalObjects = OBJECT_TYPES.length;
  const totalProperties = OBJECT_TYPES.reduce((acc, o) => acc + o.properties.length, 0);
  const totalLinks = OBJECT_TYPES.reduce((acc, o) => acc + o.links.length, 0);
  const objectChartData = OBJECT_TYPES.map(o => ({
    name: o.name,
    properties: o.properties.length,
    links: o.links.length,
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Ontology</h1>
              <span className="text-[9px] px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-medium">Semantic Layer</span>
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Build a decision-centric model of your enterprise. Define Objects, Properties, Links, and Actions that enable human-agent teaming.
            </p>
          </div>
        </div>

        {/* Live AVA Stats */}
        {!dg.loading && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Use Cases</div>
              <div className="text-2xl font-semibold mt-1 text-blue-600">{dg.useCaseRequirements.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Registered in AVA</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Agents</div>
              <div className="text-2xl font-semibold mt-1 text-violet-600">{dg.summary.totalAgents}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Deployed</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Data Sources</div>
              <div className="text-2xl font-semibold mt-1 text-emerald-600">{dg.agentProfiles.reduce((acc, p) => acc + p.dataSources.length, 0)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Connected</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Guardrails</div>
              <div className="text-2xl font-semibold mt-1 text-amber-600">{dg.summary.activeGuardrails}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Active policies</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">PII Types</div>
              <div className="text-2xl font-semibold mt-1 text-rose-600">{dg.summary.uniquePiiTypes.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Protected</div>
            </div>
          </div>
        )}

        {/* Ontology Structure KPIs (from defined object model) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Object Types" value={totalObjects} variant="info" sub="entities defined" />
          <StatCard label="Properties" value={totalProperties} variant="success" sub="across all objects" />
          <StatCard label="Links" value={totalLinks} variant="default" sub="semantic relationships" />
          <StatCard label="Agent Capabilities" value={AGENT_CAPABILITIES.length} variant="muted" sub="query · recommend · stage · act" />
        </div>

        {/* Ontology Structure Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Ontology Structure — Properties & Links per Object</h3>
            <MockDataBadge />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={objectChartData} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="properties" stackId="a" fill="#3b82f6" name="Properties" radius={[0, 0, 0, 0]} />
              <Bar dataKey="links" stackId="a" fill="#8b5cf6" name="Links" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />Properties</span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#8b5cf6' }} />Links</span>
          </div>
        </div>

        {/* Concept Explainer */}
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl border border-indigo-200/60 p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold text-indigo-900 mb-3">What is an Ontology?</h2>
              <p className="text-sm text-slate-700 mb-4">
                An ontology goes beyond data structure to capture the <strong>meaning</strong> behind your data.
                It defines not just what exists (Objects), but how things relate (Links), what properties they have,
                and what actions can be performed.
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold text-sm">Objects</span>
                  <span className="text-sm text-slate-600">— The nouns: Customer, Order, Product, Agent</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold text-sm">Properties</span>
                  <span className="text-sm text-slate-600">— Attributes: name, status, value, date</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold text-sm">Links</span>
                  <span className="text-sm text-slate-600">— Relationships: owns, contains, causes, governs</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold text-sm">Actions</span>
                  <span className="text-sm text-slate-600">— The verbs: create, approve, escalate, notify</span>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-indigo-900 mb-3">Why It Matters for AI Agents</h2>
              <p className="text-sm text-slate-700 mb-4">
                The ontology is the foundation for <strong>human-agent teaming</strong>. Agents operate on the same
                semantic model as humans, with the same governance. They can:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {AGENT_CAPABILITIES.map(cap => (
                  <div key={cap.name} className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name={cap.icon} className="w-4 h-4 text-slate-600" />
                      <span className="text-xs font-semibold text-slate-700">{cap.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-600">{cap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Connected Use Cases from AVA */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Connected Use Cases</h3>
              <LiveDataBadge />
            </div>
            <Link to="/use-cases" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View All →
            </Link>
          </div>
          {dg.useCaseRequirements.length === 0 ? (
            <div className="text-center py-6">
              <Icon name="clipboard-list" className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-medium text-slate-600">No use cases registered</div>
              <div className="text-xs text-slate-400 mb-3">Register use cases in AVA to map them to your ontology</div>
              <Link to="/use-cases" className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Create Use Case
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {dg.useCaseRequirements.slice(0, 6).map(uc => (
                <div key={uc.useCaseId} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900 truncate">{uc.useCaseName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      uc.status === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                      uc.status === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{uc.status}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-2">{uc.businessDomain}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400">Ontology Objects:</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Customer</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Order</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connected Agents */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Agents Using Ontology</h3>
              <LiveDataBadge />
            </div>
            <Link to="/govern/agents" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View Registry →
            </Link>
          </div>
          {dg.agentProfiles.length === 0 ? (
            <div className="text-center py-6">
              <Icon name="cpu-chip" className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-medium text-slate-600">No agents deployed</div>
              <div className="text-xs text-slate-400 mb-3">Deploy agents to see how they interact with your ontology</div>
              <Link to="/applications" className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Deploy Agent
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dg.agentProfiles.slice(0, 4).map(agent => (
                <div key={agent.deploymentId} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-900">{agent.deploymentName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      agent.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>{agent.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="text-slate-500">Data Sources: <span className="text-blue-600 font-medium">{agent.dataSources.length}</span></span>
                    <span className="text-slate-500">Guardrails: <span className="text-emerald-600 font-medium">{agent.guardrails.length}</span></span>
                    <span className="text-slate-500">PII: <span className="text-violet-600 font-medium">{agent.dataProtectionSummary.piiEntitiesProtected.length}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Object Types */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Object Types</h3>
            <MockDataBadge />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {OBJECT_TYPES.map(obj => (
              <div key={obj.name} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-sm font-semibold text-slate-900 mb-2">{obj.name}</div>
                <div className="mb-2">
                  <div className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Properties</div>
                  <div className="flex flex-wrap gap-1">
                    {obj.properties.map(prop => (
                      <span key={prop} className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{prop}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Links</div>
                  <div className="space-y-0.5">
                    {obj.links.map(link => (
                      <div key={link} className="text-[10px] text-slate-600">{link}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AWS Services */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-900">AWS Services for Ontology Management</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">AWS</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Neptune</div>
              <p className="text-[10px] text-slate-600 mb-2">Graph database for storing ontology as knowledge graph. Supports RDF and property graphs.</p>
              <a href="https://aws.amazon.com/neptune/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">AWS Glue Data Catalog</div>
              <p className="text-[10px] text-slate-600 mb-2">Centralized metadata repository. Integrates with ontology for data discovery.</p>
              <a href="https://aws.amazon.com/glue/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Bedrock Knowledge Bases</div>
              <p className="text-[10px] text-slate-600 mb-2">Semantic search powered by ontology relationships. Enables graph RAG patterns.</p>
              <a href="https://aws.amazon.com/bedrock/knowledge-bases/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon DataZone</div>
              <p className="text-[10px] text-slate-600 mb-2">Business glossary and data catalog. Aligns with ontology definitions.</p>
              <a href="https://aws.amazon.com/datazone/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
          </div>
        </div>

        {/* Get Started */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
              <Icon name="circle-stack" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Build Your Ontology</div>
              <div className="text-xs text-slate-500">Define the semantic model for your AI agents</div>
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-4">
            Start by identifying your core business objects and their relationships.
            The ontology will become the foundation for agent reasoning, scenario planning, and decision lineage.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => flashToast('Object type creation wizard coming soon')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Create Object Type
            </button>
            <button
              onClick={() => flashToast('Glue Catalog import will sync metadata from your AWS environment')}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Import from Glue Catalog
            </button>
            <Link
              to="/capabilities/knowledge"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Connect Knowledge Base
            </Link>
            <Link
              to="/use-cases"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Map Use Cases
            </Link>
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
