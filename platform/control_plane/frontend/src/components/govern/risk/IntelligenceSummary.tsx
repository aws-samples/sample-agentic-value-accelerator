/**
 * IntelligenceSummary - Intelligence gathered about a vendor from 35+ data sources
 *
 * Displays aggregated intelligence from DDQ_MVP step2_intelligence sources:
 * - Financial health (credit ratings, stability)
 * - Sanctions & compliance screening
 * - Cyber security posture
 * - News & reputation sentiment
 * - Corporate structure / ownership
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';

interface IntelligenceSummaryProps {
  vendorId: string;
  vendorName: string;
}

type SeverityLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';
type SentimentType = 'positive' | 'neutral' | 'negative';

interface Finding {
  id: string;
  text: string;
  severity: SeverityLevel;
  date: string;
  category: string;
}

interface CreditRating {
  agency: string;
  rating: string;
  outlook: string;
  date: string;
}

interface SanctionResult {
  list: string;
  status: 'clear' | 'match' | 'potential';
  lastChecked: string;
}

interface Certification {
  name: string;
  status: 'valid' | 'expired' | 'pending';
  expiryDate?: string;
}

interface NewsItem {
  sentiment: SentimentType;
  count: number;
}

interface DataSource {
  name: string;
  category: string;
  status: 'queried' | 'pending' | 'unavailable';
}

interface IntelligenceData {
  summary: {
    sourcesChecked: number;
    totalSources: number;
    aiConfidence: number;
    lastGathered: string;
    processingTime: string;
  };
  financial: {
    creditRatings: CreditRating[];
    stabilityScore: number;
    bankruptcyRisk: 'low' | 'moderate' | 'elevated' | 'high';
  };
  sanctions: {
    results: SanctionResult[];
    pepCheck: 'clear' | 'match' | 'review';
    regulatoryActions: number;
  };
  cyber: {
    securityRating: number;
    recentBreaches: number;
    vulnerabilityDisclosures: number;
    certifications: Certification[];
  };
  news: {
    sentiment: NewsItem[];
    esgScore: number;
    controversyFlags: string[];
  };
  corporate: {
    ownership: string;
    subsidiaries: number;
    ultimateBeneficialOwner: string;
    jurisdiction: string;
    incorporationDate: string;
  };
  findings: Finding[];
  dataSources: DataSource[];
}

// Only these vendors have an illustrative intelligence profile below. Any other
// vendor has no connected intelligence provider, so we show an explicit empty
// state instead of serving byte-identical placeholder data for every vendor.
const SUPPORTED_INTEL_VENDORS = new Set(['anthropic', 'openai', 'cohere']);

// Illustrative data generator based on vendor ID (no live provider connected)
function getMockIntelligence(vendorId: string): IntelligenceData {
  const vendorProfiles: Record<string, Partial<IntelligenceData>> = {
    anthropic: {
      summary: {
        sourcesChecked: 28,
        totalSources: 35,
        aiConfidence: 94,
        lastGathered: '2026-08-05',
        processingTime: '4.2s',
      },
      financial: {
        creditRatings: [
          { agency: "Moody's", rating: 'A2', outlook: 'Stable', date: '2026-06' },
          { agency: 'S&P', rating: 'A', outlook: 'Positive', date: '2026-05' },
        ],
        stabilityScore: 85,
        bankruptcyRisk: 'low',
      },
      sanctions: {
        results: [
          { list: 'OFAC SDN', status: 'clear', lastChecked: '2026-08-05' },
          { list: 'UN Sanctions', status: 'clear', lastChecked: '2026-08-05' },
          { list: 'EU Sanctions', status: 'clear', lastChecked: '2026-08-05' },
        ],
        pepCheck: 'clear',
        regulatoryActions: 0,
      },
      cyber: {
        securityRating: 92,
        recentBreaches: 0,
        vulnerabilityDisclosures: 2,
        certifications: [
          { name: 'SOC 2 Type II', status: 'valid', expiryDate: '2027-03' },
          { name: 'ISO 27001', status: 'valid', expiryDate: '2027-06' },
        ],
      },
      news: {
        sentiment: [
          { sentiment: 'positive', count: 45 },
          { sentiment: 'neutral', count: 32 },
          { sentiment: 'negative', count: 3 },
        ],
        esgScore: 78,
        controversyFlags: [],
      },
      corporate: {
        ownership: 'Private - Venture Backed',
        subsidiaries: 2,
        ultimateBeneficialOwner: 'Dario Amodei (CEO)',
        jurisdiction: 'Delaware, USA',
        incorporationDate: '2021-01',
      },
      findings: [
        { id: 'f1', text: 'SOC 2 Type II certification verified and valid', severity: 'info', date: '2026-08-05', category: 'cyber' },
        { id: 'f2', text: 'No sanctions matches found across all lists', severity: 'info', date: '2026-08-05', category: 'sanctions' },
        { id: 'f3', text: 'Strong financial position with positive credit outlook', severity: 'info', date: '2026-08-05', category: 'financial' },
      ],
    },
    openai: {
      summary: {
        sourcesChecked: 32,
        totalSources: 35,
        aiConfidence: 89,
        lastGathered: '2026-08-04',
        processingTime: '5.1s',
      },
      financial: {
        creditRatings: [
          { agency: "Moody's", rating: 'Baa1', outlook: 'Stable', date: '2026-04' },
          { agency: 'S&P', rating: 'BBB+', outlook: 'Stable', date: '2026-03' },
        ],
        stabilityScore: 72,
        bankruptcyRisk: 'low',
      },
      sanctions: {
        results: [
          { list: 'OFAC SDN', status: 'clear', lastChecked: '2026-08-04' },
          { list: 'UN Sanctions', status: 'clear', lastChecked: '2026-08-04' },
          { list: 'EU Sanctions', status: 'clear', lastChecked: '2026-08-04' },
        ],
        pepCheck: 'clear',
        regulatoryActions: 2,
      },
      cyber: {
        securityRating: 78,
        recentBreaches: 0,
        vulnerabilityDisclosures: 5,
        certifications: [
          { name: 'SOC 2 Type II', status: 'valid', expiryDate: '2026-11' },
          { name: 'ISO 27001', status: 'pending' },
        ],
      },
      news: {
        sentiment: [
          { sentiment: 'positive', count: 120 },
          { sentiment: 'neutral', count: 85 },
          { sentiment: 'negative', count: 42 },
        ],
        esgScore: 62,
        controversyFlags: ['Leadership changes', 'Data privacy concerns'],
      },
      corporate: {
        ownership: 'Capped Profit - Microsoft Partnership',
        subsidiaries: 5,
        ultimateBeneficialOwner: 'Sam Altman (CEO)',
        jurisdiction: 'Delaware, USA',
        incorporationDate: '2015-12',
      },
      findings: [
        { id: 'f1', text: 'Credit rating downgraded from A- to BBB+ (Mar 2026)', severity: 'medium', date: '2026-03-15', category: 'financial' },
        { id: 'f2', text: '2 regulatory inquiries in progress (FTC, EU)', severity: 'high', date: '2026-07-20', category: 'sanctions' },
        { id: 'f3', text: 'ISO 27001 certification renewal pending', severity: 'low', date: '2026-08-01', category: 'cyber' },
        { id: 'f4', text: 'Elevated negative news sentiment (17%)', severity: 'medium', date: '2026-08-04', category: 'news' },
      ],
    },
    cohere: {
      summary: {
        sourcesChecked: 18,
        totalSources: 35,
        aiConfidence: 71,
        lastGathered: '2026-07-15',
        processingTime: '3.8s',
      },
      financial: {
        creditRatings: [
          { agency: "Moody's", rating: 'B1', outlook: 'Negative', date: '2026-02' },
        ],
        stabilityScore: 48,
        bankruptcyRisk: 'elevated',
      },
      sanctions: {
        results: [
          { list: 'OFAC SDN', status: 'clear', lastChecked: '2026-07-15' },
          { list: 'UN Sanctions', status: 'clear', lastChecked: '2026-07-15' },
        ],
        pepCheck: 'clear',
        regulatoryActions: 0,
      },
      cyber: {
        securityRating: 58,
        recentBreaches: 1,
        vulnerabilityDisclosures: 8,
        certifications: [
          { name: 'SOC 2 Type II', status: 'expired', expiryDate: '2026-01' },
        ],
      },
      news: {
        sentiment: [
          { sentiment: 'positive', count: 15 },
          { sentiment: 'neutral', count: 28 },
          { sentiment: 'negative', count: 12 },
        ],
        esgScore: 45,
        controversyFlags: ['Funding concerns', 'Staff reductions'],
      },
      corporate: {
        ownership: 'Private - Venture Backed',
        subsidiaries: 1,
        ultimateBeneficialOwner: 'Aidan Gomez (CEO)',
        jurisdiction: 'Ontario, Canada',
        incorporationDate: '2019-09',
      },
      findings: [
        { id: 'f1', text: 'SOC 2 Type II certification expired (Jan 2026)', severity: 'critical', date: '2026-01-31', category: 'cyber' },
        { id: 'f2', text: 'Data breach disclosed affecting 12K records', severity: 'critical', date: '2026-05-10', category: 'cyber' },
        { id: 'f3', text: 'Credit outlook downgraded to Negative', severity: 'high', date: '2026-02-28', category: 'financial' },
        { id: 'f4', text: 'Elevated bankruptcy risk score', severity: 'high', date: '2026-07-15', category: 'financial' },
      ],
    },
  };

  const defaultData: IntelligenceData = {
    summary: {
      sourcesChecked: 12,
      totalSources: 35,
      aiConfidence: 82,
      lastGathered: '2026-08-01',
      processingTime: '3.5s',
    },
    financial: {
      creditRatings: [
        { agency: "Moody's", rating: 'Baa2', outlook: 'Stable', date: '2026-03' },
      ],
      stabilityScore: 68,
      bankruptcyRisk: 'low',
    },
    sanctions: {
      results: [
        { list: 'OFAC SDN', status: 'clear', lastChecked: '2026-08-01' },
        { list: 'UN Sanctions', status: 'clear', lastChecked: '2026-08-01' },
        { list: 'EU Sanctions', status: 'clear', lastChecked: '2026-08-01' },
      ],
      pepCheck: 'clear',
      regulatoryActions: 0,
    },
    cyber: {
      securityRating: 75,
      recentBreaches: 0,
      vulnerabilityDisclosures: 3,
      certifications: [
        { name: 'SOC 2 Type II', status: 'valid', expiryDate: '2027-01' },
      ],
    },
    news: {
      sentiment: [
        { sentiment: 'positive', count: 25 },
        { sentiment: 'neutral', count: 40 },
        { sentiment: 'negative', count: 8 },
      ],
      esgScore: 65,
      controversyFlags: [],
    },
    corporate: {
      ownership: 'Private',
      subsidiaries: 0,
      ultimateBeneficialOwner: 'Various Investors',
      jurisdiction: 'Delaware, USA',
      incorporationDate: '2020-01',
    },
    findings: [
      { id: 'f1', text: 'SOC 2 Type II certified', severity: 'info', date: '2026-08-01', category: 'cyber' },
      { id: 'f2', text: 'No sanctions matches found', severity: 'info', date: '2026-08-01', category: 'sanctions' },
    ],
    dataSources: [],
  };

  const profile = vendorProfiles[vendorId];
  const merged = profile ? { ...defaultData, ...profile } : defaultData;

  // Generate data sources
  merged.dataSources = [
    { name: "Moody's", category: 'Financial', status: 'queried' },
    { name: 'S&P Global', category: 'Financial', status: profile ? 'queried' : 'pending' },
    { name: 'Fitch Ratings', category: 'Financial', status: 'unavailable' },
    { name: 'OFAC', category: 'Sanctions', status: 'queried' },
    { name: 'UN Sanctions', category: 'Sanctions', status: 'queried' },
    { name: 'EU Sanctions', category: 'Sanctions', status: 'queried' },
    { name: 'World-Check', category: 'Sanctions', status: profile ? 'queried' : 'pending' },
    { name: 'Dow Jones', category: 'Sanctions', status: 'queried' },
    { name: 'SecurityScorecard', category: 'Cyber', status: 'queried' },
    { name: 'BitSight', category: 'Cyber', status: profile ? 'queried' : 'unavailable' },
    { name: 'UpGuard', category: 'Cyber', status: 'queried' },
    { name: 'Have I Been Pwned', category: 'Cyber', status: 'queried' },
    { name: 'NVD/CVE', category: 'Cyber', status: 'queried' },
    { name: 'LexisNexis', category: 'News', status: 'queried' },
    { name: 'Factiva', category: 'News', status: profile ? 'queried' : 'pending' },
    { name: 'Bloomberg', category: 'News', status: 'queried' },
    { name: 'Reuters', category: 'News', status: 'queried' },
    { name: 'MSCI ESG', category: 'News', status: profile ? 'queried' : 'unavailable' },
    { name: 'Sustainalytics', category: 'News', status: 'queried' },
    { name: 'RepRisk', category: 'News', status: 'queried' },
    { name: 'D&B', category: 'Corporate', status: 'queried' },
    { name: 'Orbis', category: 'Corporate', status: profile ? 'queried' : 'pending' },
    { name: 'OpenCorporates', category: 'Corporate', status: 'queried' },
    { name: 'SEC EDGAR', category: 'Corporate', status: 'queried' },
    { name: 'Companies House', category: 'Corporate', status: 'unavailable' },
  ];

  return merged;
}

const severityColors: Record<SeverityLevel, { bg: string; text: string; border: string }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const sentimentColors: Record<SentimentType, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-400',
  negative: 'bg-rose-500',
};

const sourceStatusColors: Record<string, { bg: string; text: string }> = {
  queried: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  unavailable: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

interface CollapsibleSectionProps {
  title: string;
  icon: IconName;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultExpanded = true }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon name={icon} className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-800">{title}</span>
        </div>
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-slate-400"
        />
      </button>
      {expanded && <div className="p-4 border-t border-slate-100">{children}</div>}
    </div>
  );
}

export default function IntelligenceSummary({ vendorId, vendorName }: IntelligenceSummaryProps) {
  const supported = SUPPORTED_INTEL_VENDORS.has(vendorId);
  const intelligence = useMemo(() => getMockIntelligence(vendorId), [vendorId]);

  // No third-party intelligence provider is wired up for vendors without a
  // profile — show an honest empty state rather than identical placeholder intel.
  if (!supported) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-indigo-50 to-slate-50 rounded-lg p-4 border border-indigo-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Intelligence Summary</h3>
            </div>
            <MockDataBadge integration="Connect a third-party intelligence provider (Moody's, OFAC, SecurityScorecard, ...)" />
          </div>
        </div>
        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <Icon name="server-stack" className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-600">No intelligence provider connected</div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No third-party intelligence integration is configured for {vendorName}. Connect a provider
            to populate financial, sanctions, cyber, and reputation data.
          </p>
        </div>
      </div>
    );
  }

  const totalSentiment = intelligence.news.sentiment.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-indigo-50 to-slate-50 rounded-lg p-4 border border-indigo-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-800">Intelligence Summary</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Illustrative · as of {intelligence.summary.lastGathered}</span>
            <MockDataBadge integration="Connect a third-party intelligence provider (Moody's, OFAC, SecurityScorecard, ...)" />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 italic mb-3">
          Illustrative intelligence sample — figures below are not sourced from live providers.
        </p>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/80 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-indigo-600">
              {intelligence.summary.sourcesChecked}
              <span className="text-xs font-normal text-slate-400">/{intelligence.summary.totalSources}</span>
            </div>
            <div className="text-[10px] text-slate-500">Sources Checked</div>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-bold ${
              intelligence.summary.aiConfidence >= 90 ? 'text-emerald-600' :
              intelligence.summary.aiConfidence >= 75 ? 'text-amber-600' :
              'text-rose-600'
            }`}>
              {intelligence.summary.aiConfidence}%
            </div>
            <div className="text-[10px] text-slate-500">AI Confidence</div>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-slate-700">{intelligence.summary.processingTime}</div>
            <div className="text-[10px] text-slate-500">Processing Time</div>
          </div>
          <div className="bg-white/80 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-bold ${
              intelligence.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length > 0
                ? 'text-rose-600'
                : 'text-emerald-600'
            }`}>
              {intelligence.findings.length}
            </div>
            <div className="text-[10px] text-slate-500">Key Findings</div>
          </div>
        </div>
      </div>

      {/* Intelligence Categories */}
      <div className="space-y-3">
        {/* Financial Health */}
        <CollapsibleSection title="Financial Health" icon="banknotes">
          <div className="space-y-3">
            {/* Credit Ratings */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">Credit Ratings</div>
              <div className="grid grid-cols-2 gap-2">
                {intelligence.financial.creditRatings.map((rating, idx) => (
                  <div key={idx} className="bg-slate-50 rounded px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{rating.agency}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        rating.outlook === 'Positive' ? 'bg-emerald-100 text-emerald-700' :
                        rating.outlook === 'Negative' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {rating.outlook}
                      </span>
                    </div>
                    <div className="text-lg font-semibold text-slate-800">{rating.rating}</div>
                    <div className="text-[10px] text-slate-400">As of {rating.date}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Stability & Bankruptcy */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Financial Stability</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        intelligence.financial.stabilityScore >= 75 ? 'bg-emerald-500' :
                        intelligence.financial.stabilityScore >= 50 ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${intelligence.financial.stabilityScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{intelligence.financial.stabilityScore}</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Bankruptcy Risk</div>
                <span className={`text-sm font-medium capitalize px-2 py-0.5 rounded ${
                  intelligence.financial.bankruptcyRisk === 'low' ? 'bg-emerald-100 text-emerald-700' :
                  intelligence.financial.bankruptcyRisk === 'moderate' ? 'bg-amber-100 text-amber-700' :
                  intelligence.financial.bankruptcyRisk === 'elevated' ? 'bg-orange-100 text-orange-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {intelligence.financial.bankruptcyRisk}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Sanctions & Compliance */}
        <CollapsibleSection title="Sanctions & Compliance" icon="scale">
          <div className="space-y-3">
            {/* Sanctions Results */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">Sanctions Screening</div>
              <div className="space-y-1.5">
                {intelligence.sanctions.results.map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                    <span className="text-xs text-slate-700">{result.list}</span>
                    <div className="flex items-center gap-2">
                      <Icon
                        name={result.status === 'clear' ? 'check-circle' : result.status === 'match' ? 'x-circle' : 'exclamation-circle'}
                        className={`w-4 h-4 ${
                          result.status === 'clear' ? 'text-emerald-500' :
                          result.status === 'match' ? 'text-rose-500' :
                          'text-amber-500'
                        }`}
                      />
                      <span className={`text-xs font-medium capitalize ${
                        result.status === 'clear' ? 'text-emerald-600' :
                        result.status === 'match' ? 'text-rose-600' :
                        'text-amber-600'
                      }`}>
                        {result.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* PEP & Regulatory */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">PEP Check</div>
                <div className="flex items-center gap-1.5">
                  <Icon
                    name={intelligence.sanctions.pepCheck === 'clear' ? 'check-circle' : 'exclamation-circle'}
                    className={`w-4 h-4 ${
                      intelligence.sanctions.pepCheck === 'clear' ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  />
                  <span className={`text-sm font-medium capitalize ${
                    intelligence.sanctions.pepCheck === 'clear' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {intelligence.sanctions.pepCheck}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Regulatory Actions</div>
                <span className={`text-sm font-semibold ${
                  intelligence.sanctions.regulatoryActions === 0 ? 'text-emerald-600' :
                  intelligence.sanctions.regulatoryActions <= 2 ? 'text-amber-600' :
                  'text-rose-600'
                }`}>
                  {intelligence.sanctions.regulatoryActions}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Cyber Security */}
        <CollapsibleSection title="Cyber Security" icon="shield-check">
          <div className="space-y-3">
            {/* Security Rating */}
            <div className="bg-slate-50 rounded px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Security Rating</span>
                <span className={`text-xl font-bold ${
                  intelligence.cyber.securityRating >= 80 ? 'text-emerald-600' :
                  intelligence.cyber.securityRating >= 60 ? 'text-amber-600' :
                  'text-rose-600'
                }`}>
                  {intelligence.cyber.securityRating}/100
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    intelligence.cyber.securityRating >= 80 ? 'bg-emerald-500' :
                    intelligence.cyber.securityRating >= 60 ? 'bg-amber-500' :
                    'bg-rose-500'
                  }`}
                  style={{ width: `${intelligence.cyber.securityRating}%` }}
                />
              </div>
            </div>
            {/* Breaches & Vulns */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Recent Breaches</div>
                <span className={`text-lg font-semibold ${
                  intelligence.cyber.recentBreaches === 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {intelligence.cyber.recentBreaches}
                </span>
              </div>
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Vulnerability Disclosures</div>
                <span className={`text-lg font-semibold ${
                  intelligence.cyber.vulnerabilityDisclosures <= 3 ? 'text-emerald-600' :
                  intelligence.cyber.vulnerabilityDisclosures <= 6 ? 'text-amber-600' :
                  'text-rose-600'
                }`}>
                  {intelligence.cyber.vulnerabilityDisclosures}
                </span>
              </div>
            </div>
            {/* Certifications */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">Certifications</div>
              <div className="flex flex-wrap gap-2">
                {intelligence.cyber.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                      cert.status === 'valid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      cert.status === 'expired' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    <Icon
                      name={cert.status === 'valid' ? 'check-badge' : cert.status === 'expired' ? 'x-circle' : 'clock'}
                      className="w-3.5 h-3.5"
                    />
                    {cert.name}
                    {cert.expiryDate && (
                      <span className="text-[10px] opacity-75">({cert.expiryDate})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* News & Reputation */}
        <CollapsibleSection title="News & Reputation" icon="megaphone" defaultExpanded={false}>
          <div className="space-y-3">
            {/* Sentiment Bar */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">News Sentiment (Last 90 Days)</div>
              <div className="flex h-4 rounded-full overflow-hidden">
                {intelligence.news.sentiment.map((s, idx) => (
                  <div
                    key={idx}
                    className={`${sentimentColors[s.sentiment]} transition-all`}
                    style={{ width: `${(s.count / totalSentiment) * 100}%` }}
                    title={`${s.sentiment}: ${s.count} articles`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
                {intelligence.news.sentiment.map((s, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${sentimentColors[s.sentiment]}`} />
                    {s.sentiment}: {s.count}
                  </span>
                ))}
              </div>
            </div>
            {/* ESG & Controversies */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">ESG Score</div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-semibold ${
                    intelligence.news.esgScore >= 70 ? 'text-emerald-600' :
                    intelligence.news.esgScore >= 50 ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {intelligence.news.esgScore}
                  </span>
                  <span className="text-[10px] text-slate-400">/100</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded px-3 py-2">
                <div className="text-xs text-slate-500 mb-1">Controversy Flags</div>
                <span className={`text-lg font-semibold ${
                  intelligence.news.controversyFlags.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {intelligence.news.controversyFlags.length}
                </span>
              </div>
            </div>
            {intelligence.news.controversyFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {intelligence.news.controversyFlags.map((flag, idx) => (
                  <span key={idx} className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-200">
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Corporate Structure */}
        <CollapsibleSection title="Corporate Structure" icon="building-office" defaultExpanded={false}>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Ownership</div>
              <div className="text-sm font-medium text-slate-700">{intelligence.corporate.ownership}</div>
            </div>
            <div className="bg-slate-50 rounded px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Jurisdiction</div>
              <div className="text-sm font-medium text-slate-700">{intelligence.corporate.jurisdiction}</div>
            </div>
            <div className="bg-slate-50 rounded px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Ultimate Beneficial Owner</div>
              <div className="text-sm font-medium text-slate-700">{intelligence.corporate.ultimateBeneficialOwner}</div>
            </div>
            <div className="bg-slate-50 rounded px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Subsidiaries</div>
              <div className="text-sm font-medium text-slate-700">{intelligence.corporate.subsidiaries}</div>
            </div>
            <div className="col-span-2 bg-slate-50 rounded px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Incorporation Date</div>
              <div className="text-sm font-medium text-slate-700">{intelligence.corporate.incorporationDate}</div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Key Findings */}
      <div>
        <div className="text-xs font-medium text-slate-700 mb-2 flex items-center gap-1.5">
          <Icon name="light-bulb" className="w-4 h-4 text-amber-500" />
          Key Findings
        </div>
        <div className="space-y-1.5">
          {intelligence.findings.map(finding => (
            <div
              key={finding.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${severityColors[finding.severity].bg} ${severityColors[finding.severity].border}`}
            >
              <Icon
                name={
                  finding.severity === 'info' ? 'information-circle' :
                  finding.severity === 'low' ? 'check-circle' :
                  finding.severity === 'medium' ? 'exclamation-triangle' :
                  finding.severity === 'high' ? 'exclamation-circle' :
                  'shield-exclamation'
                }
                className={`w-4 h-4 mt-0.5 flex-shrink-0 ${severityColors[finding.severity].text}`}
              />
              <div className="flex-1 min-w-0">
                <div className={`text-xs ${severityColors[finding.severity].text}`}>
                  {finding.text}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${severityColors[finding.severity].bg} ${severityColors[finding.severity].text}`}>
                    {finding.severity}
                  </span>
                  <span className="text-[10px] text-slate-400">{finding.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Intelligence Sources */}
      <div>
        <div className="text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
          <Icon name="server-stack" className="w-4 h-4 text-slate-500" />
          Intelligence Sources ({intelligence.dataSources.length} illustrative)
        </div>
        <p className="text-[10px] text-slate-500 mb-2">
          Illustrative provider list — these sources would be queried once an intelligence integration is connected.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {intelligence.dataSources.map((source, idx) => (
            <span
              key={idx}
              className={`px-2 py-1 rounded text-[10px] font-medium ${sourceStatusColors[source.status].bg} ${sourceStatusColors[source.status].text}`}
              title={`${source.category} - ${source.status}`}
            >
              {source.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
