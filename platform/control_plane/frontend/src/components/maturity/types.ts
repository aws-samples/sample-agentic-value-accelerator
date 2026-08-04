import catalog from './catalog.json';
import type {
  MaturityAssessment,
  MaturityAssessmentCreate,
  MaturityWeights,
  AssessmentStatus,
} from '../../api/client';

export type { MaturityAssessment, MaturityAssessmentCreate, MaturityWeights, AssessmentStatus };

export interface CatalogParameter {
  id: string;
  sub: string;
  name: string;
  description: string;
  anchors: Record<string, string>;
}

export interface CatalogDimension {
  label: string;
  count: number;
  parameters: CatalogParameter[];
}

export const CATALOG: Record<string, CatalogDimension> = catalog as any;

export const DIMENSIONS = [
  { key: 'people',     label: 'People & Talent',             weight: 0.20, accent: 'blue' },
  { key: 'process',    label: 'Process & Operations',         weight: 0.15, accent: 'teal' },
  { key: 'technology', label: 'Technology & Infrastructure',  weight: 0.20, accent: 'amber' },
  { key: 'data',       label: 'Data & AI Governance',         weight: 0.20, accent: 'violet' },
  { key: 'governance', label: 'Governance & Compliance',      weight: 0.10, accent: 'red' },
  { key: 'strategy',   label: 'Strategy & Innovation',        weight: 0.15, accent: 'indigo' },
] as const;

export const DEFAULT_WEIGHTS: MaturityWeights = {
  people: 0.20, process: 0.15, technology: 0.20, data: 0.20, governance: 0.10, strategy: 0.15,
};

export const STATUSES: AssessmentStatus[] = ['Draft', 'In Progress', 'Complete', 'Archived'];

export const MATURITY_LEVELS: Record<number, { name: string; tagline: string }> = {
  0: { name: 'Not yet assessed', tagline: 'Add scores to see a level' },
  1: { name: 'L1 — Initial / Ad Hoc',           tagline: 'Inconsistent, reactive AI activity' },
  2: { name: 'L2 — Managed',                    tagline: 'Basic processes; some pilots' },
  3: { name: 'L3 — Defined',                    tagline: 'Standardised practice across teams' },
  4: { name: 'L4 — Quantitatively Managed',     tagline: 'Measured, optimised, KPI-driven' },
  5: { name: 'L5 — Optimizing / Transformative', tagline: 'AI-native, continuously improving' },
};

export const DIM_ACCENTS: Record<string, { bar: string; pill: string; thumb: string; text: string }> = {
  people:     { bar: 'from-blue-500 to-blue-600',       pill: 'bg-blue-50 text-blue-700',       thumb: 'accent-blue-600',     text: 'text-blue-700' },
  process:    { bar: 'from-teal-500 to-teal-600',       pill: 'bg-teal-50 text-teal-700',       thumb: 'accent-teal-600',     text: 'text-teal-700' },
  technology: { bar: 'from-amber-500 to-amber-600',     pill: 'bg-amber-50 text-amber-700',     thumb: 'accent-amber-600',    text: 'text-amber-700' },
  data:       { bar: 'from-violet-500 to-violet-600',   pill: 'bg-violet-50 text-violet-700',   thumb: 'accent-violet-600',   text: 'text-violet-700' },
  governance: { bar: 'from-red-500 to-red-600',         pill: 'bg-red-50 text-red-700',         thumb: 'accent-red-600',      text: 'text-red-700' },
  strategy:   { bar: 'from-indigo-500 to-indigo-600',   pill: 'bg-indigo-50 text-indigo-700',   thumb: 'accent-indigo-600',   text: 'text-indigo-700' },
};
