/**
 * GraphRAG — Knowledge Graph-Enhanced Retrieval
 *
 * Combines Amazon Neptune Analytics with Bedrock Knowledge Bases for
 * complex multi-hop reasoning over interconnected data.
 *
 * Reference: https://aws.amazon.com/blogs/machine-learning/build-graphrag-applications-using-amazon-bedrock-knowledge-bases/
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MockDataBadge } from '../DataSourceIndicator';
import { Icon, type IconName } from '../icons';

// Sample knowledge graph data for visualization
const SAMPLE_ENTITIES = [
  { id: 'customer-1', type: 'Customer', name: 'Acme Corp', properties: { industry: 'Manufacturing', tier: 'Enterprise' } },
  { id: 'product-1', type: 'Product', name: 'AI Platform', properties: { category: 'Software', risk: 'Medium' } },
  { id: 'product-2', type: 'Product', name: 'Data Pipeline', properties: { category: 'Infrastructure', risk: 'Low' } },
  { id: 'regulation-1', type: 'Regulation', name: 'SR 26-2', properties: { jurisdiction: 'US', domain: 'Banking' } },
  { id: 'regulation-2', type: 'Regulation', name: 'EU AI Act', properties: { jurisdiction: 'EU', domain: 'AI' } },
  { id: 'risk-1', type: 'Risk', name: 'Model Drift', properties: { severity: 'High', category: 'Operational' } },
  { id: 'control-1', type: 'Control', name: 'Guardrails', properties: { status: 'Active', type: 'Technical' } },
];

const SAMPLE_RELATIONSHIPS = [
  { from: 'customer-1', to: 'product-1', type: 'USES', properties: { since: '2024-01' } },
  { from: 'customer-1', to: 'product-2', type: 'USES', properties: { since: '2023-06' } },
  { from: 'product-1', to: 'regulation-1', type: 'SUBJECT_TO' },
  { from: 'product-1', to: 'regulation-2', type: 'SUBJECT_TO' },
  { from: 'product-1', to: 'risk-1', type: 'HAS_RISK' },
  { from: 'risk-1', to: 'control-1', type: 'MITIGATED_BY' },
  { from: 'control-1', to: 'regulation-1', type: 'SATISFIES' },
];

const SAMPLE_QUERIES = [
  {
    question: 'Which customers are affected by EU AI Act regulations?',
    type: 'Multi-hop traversal',
    hops: 3,
    description: 'Customer → Product → Regulation',
  },
  {
    question: 'What controls mitigate risks for Acme Corp products?',
    type: 'Relationship chain',
    hops: 4,
    description: 'Customer → Product → Risk → Control',
  },
  {
    question: 'Which regulations does our AI Platform need to comply with?',
    type: 'Direct relationship',
    hops: 2,
    description: 'Product → Regulation',
  },
];

const ARCHITECTURE_STEPS: { step: number; title: string; description: string; services: string[]; icon: IconName }[] = [
  {
    step: 1,
    title: 'Data Ingestion',
    description: 'Ingest documents into S3 and extract entities using Bedrock',
    services: ['Amazon S3', 'Amazon Bedrock'],
    icon: 'document-arrow-down',
  },
  {
    step: 2,
    title: 'Entity Extraction',
    description: 'Extract entities and relationships using LLM-powered NER',
    services: ['Amazon Bedrock', 'Claude/Titan'],
    icon: 'magnifying-glass',
  },
  {
    step: 3,
    title: 'Graph Construction',
    description: 'Build knowledge graph in Neptune Analytics',
    services: ['Amazon Neptune Analytics'],
    icon: 'circle-stack',
  },
  {
    step: 4,
    title: 'Hybrid Retrieval',
    description: 'Combine vector search with graph traversal',
    services: ['Bedrock Knowledge Bases', 'Neptune'],
    icon: 'sparkles',
  },
  {
    step: 5,
    title: 'Response Generation',
    description: 'Generate answers with retrieved context and graph paths',
    services: ['Amazon Bedrock'],
    icon: 'chat-bubble',
  },
];

export default function GraphRAG() {
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'queries' | 'setup'>('overview');

  const entityColors: Record<string, { bg: string; border: string; text: string }> = {
    Customer: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700' },
    Product: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
    Regulation: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
    Risk: { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700' },
    Control: { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700' },
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link to="/govern/data" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-purple-600 transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Data Governance
          </Link>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">GraphRAG</h1>
                  <MockDataBadge integration="Neptune Analytics" />
                </div>
                <p className="text-slate-500 text-sm mt-0.5">
                  Knowledge graph-enhanced retrieval for complex multi-hop reasoning
                </p>
              </div>
            </div>

            {/* AWS Services Badge */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <img src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35@2x.png" alt="AWS" className="h-5 opacity-80" style={{ filter: 'invert(1) brightness(0.3)' }} />
              <div className="text-xs">
                <div className="font-medium text-slate-700">Neptune Analytics</div>
                <div className="text-slate-400">+ Bedrock KB</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="GraphRAG tabs" className="flex items-center gap-2 mb-6 border-b border-slate-200">
          {([
            { id: 'overview', label: 'Overview', icon: 'clipboard-list' as IconName },
            { id: 'graph', label: 'Knowledge Graph', icon: 'circle-stack' as IconName },
            { id: 'queries', label: 'Sample Queries', icon: 'magnifying-glass' as IconName },
            { id: 'setup', label: 'Setup Guide', icon: 'wrench-screwdriver' as IconName },
          ]).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* What is GraphRAG */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">What is GraphRAG?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-slate-600 mb-4">
                    GraphRAG combines the power of <strong>knowledge graphs</strong> with <strong>retrieval-augmented generation</strong>
                    to enable complex reasoning over interconnected data. Unlike standard RAG which finds similar text chunks,
                    GraphRAG can traverse relationships to answer multi-hop questions.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Icon name="check-circle" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-600">Answer questions spanning multiple documents</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="check-circle" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-600">Discover non-obvious relationships between entities</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="check-circle" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-600">Provide explainable reasoning paths</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Icon name="check-circle" className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-600">Reduce hallucination with structured knowledge</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-lg p-4 border border-purple-100">
                  <h3 className="font-semibold text-purple-900 mb-3">Standard RAG vs GraphRAG</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-24 font-medium text-slate-600">Standard RAG</div>
                      <div className="flex-1 text-slate-600">Finds similar chunks — good for direct "what is X?" questions</div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-24 font-medium text-purple-700">GraphRAG</div>
                      <div className="flex-1 text-purple-700">Traverses relationships — essential for "how is X connected to Y?"</div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-24 font-medium text-emerald-700">Hybrid</div>
                      <div className="flex-1 text-emerald-700">Best of both — vector search + graph traversal for comprehensive answers</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Architecture</h2>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {ARCHITECTURE_STEPS.map((step, i) => (
                  <div key={step.step} className="flex items-center">
                    <div className="flex flex-col items-center min-w-[140px]">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 border border-purple-200 flex items-center justify-center mb-2">
                        <Icon name={step.icon} className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="text-xs font-semibold text-slate-700 text-center">{step.title}</div>
                      <div className="text-[10px] text-slate-500 text-center mt-1 max-w-[130px]">{step.description}</div>
                      <div className="flex flex-wrap gap-1 mt-2 justify-center">
                        {step.services.map(svc => (
                          <span key={svc} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>
                    {i < ARCHITECTURE_STEPS.length - 1 && (
                      <svg className="w-8 h-8 text-purple-300 flex-shrink-0 mx-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Use Cases */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                  <Icon name="building-office" className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Regulatory Compliance</h3>
                <p className="text-sm text-slate-600">
                  Map products to regulations, track control coverage, and answer "which regulations apply to X?"
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                  <Icon name="link" className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Impact Analysis</h3>
                <p className="text-sm text-slate-600">
                  Trace dependencies to understand "if X changes, what else is affected?" across your data landscape.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
                  <Icon name="magnifying-glass" className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Root Cause Analysis</h3>
                <p className="text-sm text-slate-600">
                  Navigate causal chains to find "why did this happen?" by traversing incident relationships.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="space-y-6">
            {/* Entity Legend */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">Sample Knowledge Graph</h3>
                <div className="flex items-center gap-3 text-xs">
                  {Object.entries(entityColors).map(([type, colors]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded ${colors.bg} ${colors.border} border`} />
                      <span className="text-slate-600">{type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Graph Visualization */}
              <div className="relative bg-slate-50 rounded-lg p-6 min-h-[400px] overflow-hidden">
                <svg className="absolute inset-0 w-full h-full">
                  {/* Draw relationships */}
                  {SAMPLE_RELATIONSHIPS.map((rel, i) => {
                    const fromEntity = SAMPLE_ENTITIES.find(e => e.id === rel.from);
                    const toEntity = SAMPLE_ENTITIES.find(e => e.id === rel.to);
                    if (!fromEntity || !toEntity) return null;

                    const fromIdx = SAMPLE_ENTITIES.indexOf(fromEntity);
                    const toIdx = SAMPLE_ENTITIES.indexOf(toEntity);

                    const fromX = 100 + (fromIdx % 4) * 180;
                    const fromY = 80 + Math.floor(fromIdx / 4) * 150;
                    const toX = 100 + (toIdx % 4) * 180;
                    const toY = 80 + Math.floor(toIdx / 4) * 150;

                    return (
                      <g key={i}>
                        <line
                          x1={fromX}
                          y1={fromY}
                          x2={toX}
                          y2={toY}
                          stroke="#a855f7"
                          strokeWidth="2"
                          strokeOpacity="0.4"
                          markerEnd="url(#arrow)"
                        />
                        <text
                          x={(fromX + toX) / 2}
                          y={(fromY + toY) / 2 - 5}
                          textAnchor="middle"
                          className="text-[9px] fill-purple-600 font-medium"
                        >
                          {rel.type}
                        </text>
                      </g>
                    );
                  })}
                  <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#a855f7" fillOpacity="0.6" />
                    </marker>
                  </defs>
                </svg>

                {/* Draw entities */}
                {SAMPLE_ENTITIES.map((entity, i) => {
                  const colors = entityColors[entity.type] || entityColors.Customer;
                  const x = 50 + (i % 4) * 180;
                  const y = 40 + Math.floor(i / 4) * 150;

                  return (
                    <div
                      key={entity.id}
                      className={`absolute cursor-pointer transition-all ${
                        selectedEntity === entity.id ? 'scale-110 z-10' : 'hover:scale-105'
                      }`}
                      style={{ left: x, top: y }}
                      onClick={() => setSelectedEntity(selectedEntity === entity.id ? null : entity.id)}
                    >
                      <div className={`w-24 p-3 rounded-lg ${colors.bg} border-2 ${colors.border} shadow-sm`}>
                        <div className={`text-[10px] font-medium ${colors.text} opacity-70`}>{entity.type}</div>
                        <div className="text-xs font-semibold text-slate-800 truncate">{entity.name}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Entity Details Panel */}
                {selectedEntity && (
                  <div className="absolute right-4 top-4 w-64 bg-white rounded-lg border border-slate-200 shadow-lg p-4">
                    {(() => {
                      const entity = SAMPLE_ENTITIES.find(e => e.id === selectedEntity);
                      if (!entity) return null;
                      const colors = entityColors[entity.type];
                      const rels = SAMPLE_RELATIONSHIPS.filter(r => r.from === entity.id || r.to === entity.id);

                      return (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <div className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                              {entity.type}
                            </div>
                            <button onClick={() => setSelectedEntity(null)} className="text-slate-400 hover:text-slate-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="font-semibold text-slate-800 mb-2">{entity.name}</div>
                          <div className="text-xs text-slate-500 mb-3">
                            {Object.entries(entity.properties).map(([k, v]) => (
                              <div key={k}><span className="font-medium">{k}:</span> {v}</div>
                            ))}
                          </div>
                          <div className="border-t border-slate-100 pt-2">
                            <div className="text-[10px] font-medium text-slate-500 mb-1">Relationships ({rels.length})</div>
                            {rels.map((rel, i) => {
                              const other = SAMPLE_ENTITIES.find(e => e.id === (rel.from === entity.id ? rel.to : rel.from));
                              const direction = rel.from === entity.id ? '→' : '←';
                              return (
                                <div key={i} className="text-xs text-slate-600">
                                  {direction} {rel.type} {other?.name}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'queries' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Multi-Hop Query Examples</h2>
              <p className="text-slate-600 mb-6">
                GraphRAG excels at questions that require traversing multiple relationships.
                Standard RAG would struggle with these because the answer spans multiple documents.
              </p>

              <div className="space-y-4">
                {SAMPLE_QUERIES.map((query, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold flex-shrink-0">
                        {query.hops}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-800 mb-1">"{query.question}"</div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{query.type}</span>
                          <span className="text-slate-500">{query.description}</span>
                          <span className="text-slate-400">{query.hops} hops</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cypher Query Example */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Sample Cypher Query (Neptune)</h3>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-sm overflow-x-auto">
{`MATCH (c:Customer)-[:USES]->(p:Product)-[:SUBJECT_TO]->(r:Regulation)
WHERE r.name = 'EU AI Act'
RETURN c.name AS customer, p.name AS product, r.name AS regulation`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Setup Guide</h2>

              <div className="space-y-6">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">1</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Create Neptune Analytics Graph</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Set up an Amazon Neptune Analytics graph to store your knowledge graph.
                    </p>
                    <pre className="bg-slate-100 rounded p-3 text-xs mt-2 overflow-x-auto">
{`aws neptune-graph create-graph \\
  --graph-name governance-kg \\
  --provisioned-memory 128 \\
  --public-connectivity`}
                    </pre>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">2</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Configure Bedrock Knowledge Base</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Create a Bedrock Knowledge Base with GraphRAG configuration pointing to your Neptune graph.
                    </p>
                    <a
                      href="https://aws.amazon.com/blogs/machine-learning/build-graphrag-applications-using-amazon-bedrock-knowledge-bases/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 mt-2"
                    >
                      View AWS Blog Guide →
                    </a>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">3</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Define Entity Extraction Schema</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Configure the entity types and relationships to extract from your documents.
                    </p>
                    <pre className="bg-slate-100 rounded p-3 text-xs mt-2 overflow-x-auto">
{`{
  "entityTypes": ["Customer", "Product", "Regulation", "Risk", "Control"],
  "relationshipTypes": ["USES", "SUBJECT_TO", "HAS_RISK", "MITIGATED_BY"]
}`}
                    </pre>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">4</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Integrate with AVA Agents</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Connect your GraphRAG knowledge base to AVA agents for enhanced reasoning.
                    </p>
                    <Link
                      to="/capabilities/knowledge"
                      className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 mt-2"
                    >
                      Configure Knowledge Bases →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Resources */}
            <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-200 p-6">
              <h3 className="font-semibold text-purple-900 mb-3">Resources</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <a
                  href="https://aws.amazon.com/blogs/machine-learning/build-graphrag-applications-using-amazon-bedrock-knowledge-bases/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-200 hover:border-purple-400 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Icon name="book-open" className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 text-sm">AWS Blog: Build GraphRAG</div>
                    <div className="text-xs text-slate-500">Step-by-step implementation guide</div>
                  </div>
                </a>
                <a
                  href="https://docs.aws.amazon.com/neptune-analytics/latest/userguide/what-is-neptune-analytics.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-200 hover:border-purple-400 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Icon name="book-open" className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 text-sm">Neptune Analytics Docs</div>
                    <div className="text-xs text-slate-500">Official AWS documentation</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
