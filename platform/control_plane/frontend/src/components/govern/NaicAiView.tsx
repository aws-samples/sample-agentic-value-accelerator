/**
 * NaicAiView — NAIC AI Systems Evaluation Tool deep-dive view
 *
 * Comprehensive visualization of NAIC (National Association of Insurance
 * Commissioners) AI Systems Evaluation framework for insurance industry
 * regulatory assessment. Based on the 2023 NAIC Model Bulletin on the Use
 * of AI Systems by Insurers.
 *
 * Key features:
 * - Exhibit-based structure (A-D) matching regulatory filing format
 * - Focus on unfair trade practices and adverse consumer outcomes
 * - Insurance industry context callouts throughout
 * - Detailed data element tracking (Exhibit D)
 * - Model Bulletin Principles section for fair use and accountability
 * - Per-exhibit compliance progress visualization
 *
 * Notable for US state insurance regulator coordination, consumer protection
 * focus, and application to underwriting, claims, and marketing use cases.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import {
  COMPLIANCE_CENTER_FRAMEWORKS,
  type ComplianceControl,
  type ComplianceFramework,
} from './mockData';
import UnfairDiscriminationTesting from './compliance/UnfairDiscriminationTesting';
import { ComplianceGapGuidanceCompact } from './compliance/ComplianceGapGuidance';
import { Icon } from './icons';

// ─────────────────────────── Status Metadata ───────────────────────────

const statusMeta: Record<string, { icon: string; badge: string; label: string }> = {
  pass: { icon: '+', badge: 'bg-emerald-100 text-emerald-700', label: 'Compliant' },
  'in-progress': { icon: '!', badge: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  fail: { icon: '-', badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
  'not-started': { icon: '=', badge: 'bg-slate-100 text-slate-500', label: 'Not Started' },
};

// ─────────────────────────── Exhibit Metadata ───────────────────────────

interface ExhibitMeta {
  key: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const EXHIBIT_META: ExhibitMeta[] = [
  {
    key: 'Exhibit A',
    name: 'AI Systems Inventory',
    shortName: 'A',
    description: 'Comprehensive inventory of AI systems by operational area, consumer impact, and implementation timeline',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: 'clipboard-document-list',
  },
  {
    key: 'Exhibit B',
    name: 'Governance Framework',
    shortName: 'B',
    description: 'Board-level AI governance, unfair trade practices prevention, ERM integration, and compliance processes',
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    icon: 'building-office',
  },
  {
    key: 'Exhibit C',
    name: 'High-Risk AI Details',
    shortName: 'C',
    description: 'Model documentation, risk classification, validation, and ongoing monitoring for high-risk AI systems',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: 'exclamation-triangle',
  },
  {
    key: 'Exhibit D',
    name: 'AI Data Details',
    shortName: 'D',
    description: 'Data element tracking including sensitive data, third-party sources, telematics, and biometric data usage',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: 'circle-stack',
  },
  {
    key: 'Model Bulletin',
    name: 'Model Bulletin Principles',
    shortName: 'MB',
    description: 'Core principles from 2023 NAIC Model Bulletin: unfair discrimination testing, accountability, transparency',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    icon: 'scale',
  },
];

// ─────────────────────────── Insurance Context Callouts ───────────────────────────

const insuranceContextCallouts: Record<string, string> = {
  'NAIC-A2': 'Direct consumer impact includes underwriting decisions, claims handling, premium pricing, and marketing targeting.',
  'NAIC-B3': 'Unfair trade practices include discrimination in underwriting, claims, or pricing based on protected characteristics.',
  'NAIC-B5': 'Adverse Consumer Outcomes: denial of coverage, unfair claims handling, discriminatory pricing, or privacy violations.',
  'NAIC-C4': 'High/Medium/Low risk classification based on consumer impact, decision autonomy, and regulatory sensitivity.',
  'NAIC-C6': 'Automate = full automation, Augment = human-assisted decisions, Support = information gathering only.',
  'NAIC-D6': 'Sensitive data elements require enhanced controls: Age, Gender, Race/Ethnicity, Credit Score, Marital Status.',
  'NAIC-D9': 'Telematics/UBI data includes driving behavior, location tracking, and usage patterns from connected devices.',
  'NAIC-MB-1': 'Unfair discrimination testing must cover protected classes under state insurance laws and fair lending requirements.',
  'NAIC-MB-3': 'Proxy variables may inadvertently correlate with protected characteristics; requires correlation analysis.',
};

// ─────────────────────────── Helper Functions ───────────────────────────

function getExhibitMeta(categoryName: string): ExhibitMeta | undefined {
  return EXHIBIT_META.find(e => categoryName.includes(e.key) || categoryName.includes(e.name));
}

function computeExhibitStats(controls: ComplianceControl[]) {
  const total = controls.length;
  const passed = controls.filter(c => c.status === 'pass').length;
  const inProgress = controls.filter(c => c.status === 'in-progress').length;
  const failed = controls.filter(c => c.status === 'fail').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, inProgress, failed, compliancePct };
}

function computeOverallStats(framework: ComplianceFramework) {
  const allControls = framework.categories.flatMap(c => c.controls);
  const total = allControls.length;
  const passed = allControls.filter(c => c.status === 'pass').length;
  const inProgress = allControls.filter(c => c.status === 'in-progress').length;
  const failed = allControls.filter(c => c.status === 'fail').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, inProgress, failed, compliancePct };
}

// ─────────────────────────── Component ───────────────────────────

interface NaicAiViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function NaicAiView({ embedded = false, onNavigateToProgram }: NaicAiViewProps) {
  const [expandedExhibits, setExpandedExhibits] = useState<Set<string>>(new Set(['Exhibit A: AI Systems Inventory']));
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDiscriminationTesting, setShowDiscriminationTesting] = useState(false);

  // Get NAIC AI framework from mockData
  const naicFramework = useMemo(() =>
    COMPLIANCE_CENTER_FRAMEWORKS.find(f => f.id === 'naic-ai') as ComplianceFramework | undefined,
  []);

  const overallStats = useMemo(() =>
    naicFramework ? computeOverallStats(naicFramework) : { total: 0, passed: 0, inProgress: 0, failed: 0, compliancePct: 0 },
  [naicFramework]);

  const toggleExhibit = (name: string) => {
    const next = new Set(expandedExhibits);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedExhibits(next);
  };

  const filteredCategories = useMemo(() => {
    if (!naicFramework) return [];
    if (filterStatus === 'all') return naicFramework.categories;
    return naicFramework.categories.map(cat => ({
      ...cat,
      controls: cat.controls.filter(c => c.status === filterStatus),
    })).filter(cat => cat.controls.length > 0);
  }, [naicFramework, filterStatus]);

  if (!naicFramework) {
    return (
      <div className="text-[12px] text-amber-700 bg-amber-50/70 rounded-xl border border-amber-200 px-5 py-4">
        NAIC AI Systems Evaluation framework data not found in compliance center frameworks.
      </div>
    );
  }

  const body = (
    <div className="space-y-6">
      {/* Hero: Framework Overview */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50/50 rounded-2xl border border-orange-200/60 shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">NAIC AI Systems Evaluation Tool</h2>
            <p className="text-[11px] text-slate-600 mt-1 max-w-2xl">
              State insurance regulator pilot framework based on the 2023 NAIC Model Bulletin on the Use of AI
              Systems by Insurers. Designed for regulatory assessment of AI in underwriting, claims, pricing,
              and marketing operations.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-orange-700">{overallStats.compliancePct}%</div>
            <div className="text-[10px] text-slate-500">Overall Compliance</div>
          </div>
        </div>

        {/* Exhibit Pipeline Visualization */}
        <div className="relative mt-6">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-blue-200 via-violet-200 via-orange-200 to-emerald-200 -translate-y-1/2 rounded-full hidden md:block" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative">
            {EXHIBIT_META.map((exhibit) => {
              const category = naicFramework.categories.find(c => c.name.includes(exhibit.key) || c.name.includes(exhibit.name));
              const stats = category ? computeExhibitStats(category.controls) : { total: 0, passed: 0, compliancePct: 0 };
              const isExpanded = category && expandedExhibits.has(category.name);

              return (
                <button
                  key={exhibit.key}
                  onClick={() => category && toggleExhibit(category.name)}
                  className={`relative p-3 rounded-xl border-2 transition-all hover:shadow-md ${
                    isExpanded
                      ? `${exhibit.bgColor} ${exhibit.borderColor} shadow-md`
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isExpanded ? `${exhibit.bgColor} ${exhibit.color} border-2 ${exhibit.borderColor}` : 'bg-slate-100 text-slate-600 border-2 border-slate-200'
                  }`}>
                    {exhibit.shortName}
                  </div>

                  <div className="flex flex-col items-center text-center pt-2">
                    <div className={`text-xs font-semibold ${isExpanded ? exhibit.color : 'text-slate-700'} mb-1`}>
                      {exhibit.name}
                    </div>
                    <div className="text-[9px] text-slate-500 mb-2 line-clamp-2">{exhibit.description.slice(0, 50)}...</div>

                    {/* Compliance meter */}
                    <div className="w-full">
                      <div className="flex items-center justify-between text-[9px] mb-1">
                        <span className="text-slate-500">{stats.passed}/{stats.total}</span>
                        <span className={`font-semibold ${
                          stats.compliancePct >= 80 ? 'text-emerald-600' :
                          stats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                        }`}>{stats.compliancePct}%</span>
                      </div>
                      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            stats.compliancePct >= 80 ? 'bg-emerald-500' :
                            stats.compliancePct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${stats.compliancePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Insurance Industry Context Callout */}
      <div className="bg-orange-50 rounded-xl border border-orange-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-600 text-sm">!</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-orange-900">Insurance Industry Context</div>
            <div className="text-[11px] text-orange-800 mt-1 leading-relaxed">
              NAIC coordinates US state insurance regulators. This evaluation tool applies to insurers using AI in:
              <span className="font-medium"> underwriting decisions, claims processing, premium pricing, marketing/advertising,
              fraud detection, and customer service</span>. Focus areas include preventing unfair trade practices,
              avoiding adverse consumer outcomes, and ensuring compliance with state insurance laws.
            </div>
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-orange-50 rounded-xl border border-orange-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-600 text-sm">@</span>
            <span className="text-sm text-orange-800">Track NAIC AI Systems Evaluation controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Add to Program
          </button>
        </div>
      )}

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Controls" value={overallStats.total} />
        <StatCard label="Compliant" value={overallStats.passed} variant="success" />
        <StatCard label="In Progress" value={overallStats.inProgress} variant="warning" />
        <StatCard label="Gaps" value={overallStats.failed} variant={overallStats.failed > 0 ? 'danger' : 'muted'} />
        <StatCard label="Compliance" value={`${overallStats.compliancePct}%`} variant="info" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 bg-white/80 rounded-xl border border-slate-200/60 px-4 py-2.5">
        <span className="text-[11px] text-slate-500 font-medium">Filter by status:</span>
        <div className="flex items-center gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'pass', label: 'Compliant' },
            { value: 'in-progress', label: 'In Progress' },
            { value: 'fail', label: 'Gaps' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                filterStatus === opt.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exhibit Detail Panels */}
      {filteredCategories.map(category => {
        const exhibitMeta = getExhibitMeta(category.name);
        const isExpanded = expandedExhibits.has(category.name);
        const stats = computeExhibitStats(category.controls);

        return (
          <div
            key={category.name}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden transition-all ${
              isExpanded && exhibitMeta ? exhibitMeta.borderColor : 'border-slate-200/60'
            }`}
          >
            {/* Category header */}
            <button
              onClick={() => toggleExhibit(category.name)}
              className={`w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors ${
                isExpanded && exhibitMeta ? exhibitMeta.bgColor : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isExpanded && exhibitMeta ? `${exhibitMeta.bgColor} border ${exhibitMeta.borderColor}` : 'bg-slate-100'
              }`}>
                <span className={`text-xl font-bold ${isExpanded && exhibitMeta ? exhibitMeta.color : 'text-slate-500'}`}>
                  {exhibitMeta?.shortName || '#'}
                </span>
              </div>
              <div className="flex-1 text-left">
                <div className={`text-sm font-semibold ${isExpanded && exhibitMeta ? exhibitMeta.color : 'text-slate-900'}`}>
                  {category.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  {exhibitMeta?.description || 'NAIC AI Systems Evaluation requirements'}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    stats.compliancePct >= 80 ? 'text-emerald-600' :
                    stats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>{stats.compliancePct}%</div>
                  <div className="text-[9px] text-slate-500">{stats.passed}/{stats.total} controls</div>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Controls list */}
            {isExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {category.controls.map(ctrl => {
                  const sm = statusMeta[ctrl.status];
                  const contextCallout = insuranceContextCallouts[ctrl.id];

                  return (
                    <div key={ctrl.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
                          <span className="text-[11px] font-bold">{sm.icon}</span>
                        </div>

                        {/* Control info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                            <span className="text-[11px] text-slate-700">{ctrl.label}</span>
                            {ctrl.section && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                {ctrl.section}
                              </span>
                            )}
                          </div>
                          {ctrl.evidence && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Evidence: <span className="text-slate-600">{ctrl.evidence}</span>
                            </div>
                          )}
                          {ctrl.owner && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Owner: <span className="text-slate-500">{ctrl.owner}</span>
                            </div>
                          )}
                          {ctrl.dueDate && ctrl.status === 'in-progress' && (
                            <div className="text-[10px] text-amber-600 mt-0.5">
                              Due: {ctrl.dueDate}
                            </div>
                          )}

                          {/* Insurance context callout */}
                          {contextCallout && (
                            <div className="mt-2 p-2 bg-orange-50 rounded-lg border border-orange-100">
                              <div className="text-[10px] text-orange-800 leading-relaxed">
                                <span className="font-medium">Insurance context:</span> {contextCallout}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status badge */}
                        <span className={`text-[9px] px-2 py-0.5 rounded ${sm.badge}`}>
                          {sm.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Consumer Protection Focus Callout */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">Consumer Protection Focus</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-800 mb-1">Unfair Trade Practices Prevention</div>
            <div className="text-[10px] text-slate-600 leading-relaxed">
              NAIC requires insurers to evaluate AI systems for potential unfair trade practices including
              discriminatory underwriting, biased claims handling, and non-compliant marketing. Testing must
              cover protected classes under state insurance laws.
            </div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-800 mb-1">Adverse Consumer Outcome Monitoring</div>
            <div className="text-[10px] text-slate-600 leading-relaxed">
              Track and address outcomes that harm consumers: coverage denials, unfair claims settlements,
              discriminatory pricing, privacy violations, and lack of transparency in AI-driven decisions.
              Consumer complaints involving AI must be documented and reviewed.
            </div>
          </div>
        </div>
      </div>

      {/* Unfair Discrimination Testing Section */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200/60 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowDiscriminationTesting(!showDiscriminationTesting)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-rose-50/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <span className="text-rose-600 text-lg font-bold">=</span>
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-900">Unfair Discrimination Testing</div>
              <div className="text-[10px] text-slate-500">
                Statistical fairness analysis across protected classes — Model Bulletin Section 3.2
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] px-2 py-1 rounded-lg bg-rose-100 text-rose-700 font-medium">
              Four-fifths rule testing
            </span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${showDiscriminationTesting ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showDiscriminationTesting && (
          <div className="border-t border-rose-100 p-5">
            <UnfairDiscriminationTesting embedded />
          </div>
        )}
      </div>

      {/* Key Data Elements (Exhibit D Focus) */}
      <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-5 py-4">
        <div className="text-sm font-semibold text-emerald-900 mb-3">Exhibit D: Key Data Element Categories</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Sensitive Demographics', items: ['Age', 'Gender', 'Race/Ethnicity', 'Marital Status'] },
            { label: 'Financial Data', items: ['Credit Score', 'Insurance Score', 'Income Proxies'] },
            { label: 'Behavioral Data', items: ['Telematics/UBI', 'Driving Behavior', 'Usage Patterns'] },
            { label: 'External Sources', items: ['Third-Party Vendors', 'Geocoding', 'Public Records'] },
          ].map(category => (
            <div key={category.label} className="p-3 bg-white rounded-lg border border-emerald-100">
              <div className="text-[10px] font-semibold text-emerald-800 mb-1">{category.label}</div>
              <div className="space-y-0.5">
                {category.items.map(item => (
                  <div key={item} className="text-[9px] text-emerald-700 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Beyond the Platform - Organizational Actions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="clipboard-document-list" className="w-4 h-4 text-violet-600" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-800">NAIC: Organizational Actions Required</span>
          </div>
          <Link
            to="/govern/compliance?tab=gap-guidance"
            className="text-[10px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
          >
            View All Gaps
            <Icon name="arrow-right" className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          The platform monitors for unfair discrimination and adverse outcomes, but board reporting, consumer appeals, and vendor due diligence require organizational processes.
        </p>
        <ComplianceGapGuidanceCompact framework="NAIC" />
      </div>

      {/* Footer */}
      <div className="text-[10px] text-slate-400 text-center">
        NAIC AI Systems Evaluation Tool — State insurance regulator pilot based on the 2023 NAIC Model Bulletin
        on the Use of AI Systems by Insurers. Applies to AI in underwriting, claims, pricing, and marketing.
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="NAIC AI Systems Evaluation"
      description="National Association of Insurance Commissioners AI regulatory assessment framework for state insurance regulators."
      badge={<MockDataBadge integration="NAIC controls — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
