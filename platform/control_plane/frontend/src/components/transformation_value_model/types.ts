// Types + registry metadata for the Reference Catalog UI. Mirrors the backend
// Pydantic models and drives generic list/detail/create rendering across the
// nine entity types.

import type { CatalogEntityType } from '../../api/client';

export type { CatalogEntity, CatalogEntityType, CatalogVersionRecord, CatalogVersionDiff, CatalogSeedStatus } from '../../api/client';

export type Source = 'api' | 'local';

// Field render kinds for the generic create/edit drawer and detail view.
export type FieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'tags';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
}

export interface RelationshipSpec {
  key: string;
  label: string;
  targetType: CatalogEntityType;
  kind: 'fk_out' | 'fk_in' | 'junction';
  // Whether the create/edit drawer can set this relationship (owned side only).
  editable: boolean;
}

export interface EntityTypeSpec {
  type: CatalogEntityType;
  label: string;
  labelPlural: string;
  icon: string;          // emoji glyph for compact nav
  idPrefix: string;
  fields: FieldSpec[];    // entity-specific + common attribute fields
  relationships: RelationshipSpec[];
  // Attribute fields exposed as list filters (equality).
  filterFields: string[];
}

// Humanize a snake_case key into a label.
export function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bkpi\b/i, 'KPI')
    .replace(/\bpii\b/i, 'PII')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// Common attribute fields shared by all entity types (name/description/status/tags).
const COMMON_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'textarea' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'tags', label: 'Tags', kind: 'tags' },
];

function f(key: string, kind: FieldKind = 'text'): FieldSpec {
  return { key, label: humanize(key), kind };
}

// The nine entity types with their pared attribute sets (faithful to the backend
// ORM/Pydantic models) and relationship descriptors.
export const ENTITY_TYPES: EntityTypeSpec[] = [
  {
    type: 'industries', label: 'Industry', labelPlural: 'Industries', icon: '🏛️', idPrefix: 'ind',
    fields: [...COMMON_FIELDS, f('code')],
    filterFields: ['code', 'status'],
    relationships: [
      { key: 'segments', label: 'Industry Segments', targetType: 'industry-segments', kind: 'fk_in', editable: false },
    ],
  },
  {
    type: 'industry-segments', label: 'Industry Segment', labelPlural: 'Industry Segments', icon: '🏢', idPrefix: 'seg',
    fields: [...COMMON_FIELDS, f('code'), f('industry_id')],
    filterFields: ['code', 'status', 'industry_id'],
    relationships: [
      { key: 'industry', label: 'Industry', targetType: 'industries', kind: 'fk_out', editable: true },
      { key: 'domains', label: 'Business Domains', targetType: 'business-domains', kind: 'fk_in', editable: false },
    ],
  },
  {
    type: 'business-domains', label: 'Business Domain', labelPlural: 'Business Domains', icon: '🗂️', idPrefix: 'dom',
    fields: [
      ...COMMON_FIELDS, f('domain_category'), f('strategic_objective', 'textarea'),
      f('value_potential_score', 'number'), f('feasibility_score', 'number'),
      f('overall_priority_score', 'number'), f('data_readiness_score', 'number'),
      f('technology_readiness_score', 'number'), f('executive_sponsorship_score', 'number'),
    ],
    filterFields: ['domain_category', 'status', 'industry_id', 'industry_segment_id'],
    relationships: [
      { key: 'industry_segment', label: 'Industry Segment', targetType: 'industry-segments', kind: 'fk_out', editable: true },
      { key: 'value_levers', label: 'Value Levers', targetType: 'value-levers', kind: 'fk_in', editable: false },
      { key: 'solutions', label: 'Solutions', targetType: 'solutions', kind: 'junction', editable: false },
    ],
  },
  {
    type: 'value-levers', label: 'Value Lever', labelPlural: 'Value Levers', icon: '📈', idPrefix: 'lev',
    fields: [
      ...COMMON_FIELDS, f('lever_type'), f('improvement_hypothesis', 'textarea'),
      f('financial_value_low', 'number'), f('financial_value_base', 'number'),
      f('financial_value_high', 'number'), f('currency'), f('confidence_level', 'number'),
    ],
    filterFields: ['lever_type', 'status', 'domain_id'],
    relationships: [
      { key: 'domain', label: 'Business Domain', targetType: 'business-domains', kind: 'fk_out', editable: true },
      { key: 'kpis', label: 'KPIs', targetType: 'kpis', kind: 'junction', editable: true },
      { key: 'solutions', label: 'Solutions', targetType: 'solutions', kind: 'junction', editable: false },
    ],
  },
  {
    type: 'kpis', label: 'KPI', labelPlural: 'KPIs', icon: '🎯', idPrefix: 'kpi',
    fields: [
      ...COMMON_FIELDS, f('unit_of_measure'), f('direction_of_improvement'),
      f('baseline_value', 'number'), f('target_value', 'number'), f('leading_or_lagging'),
    ],
    filterFields: ['unit_of_measure', 'direction_of_improvement', 'leading_or_lagging', 'status'],
    relationships: [
      { key: 'value_levers', label: 'Value Levers', targetType: 'value-levers', kind: 'junction', editable: true },
    ],
  },
  {
    type: 'solutions', label: 'Solution', labelPlural: 'Solutions', icon: '🧩', idPrefix: 'sol',
    fields: [
      ...COMMON_FIELDS, f('solution_type'), f('benefit_low', 'number'), f('benefit_base', 'number'),
      f('benefit_high', 'number'), f('investment_low', 'number'), f('investment_base', 'number'),
      f('investment_high', 'number'), f('run_cost_annual', 'number'), f('expected_payback_months', 'number'),
      f('cost_currency'), f('value_confidence', 'number'), f('overall_risk_rating'),
      f('reusable_flag', 'boolean'), f('shared_enabler_flag', 'boolean'),
    ],
    filterFields: ['solution_type', 'overall_risk_rating', 'status'],
    relationships: [
      { key: 'domains', label: 'Business Domains', targetType: 'business-domains', kind: 'junction', editable: true },
      { key: 'value_levers', label: 'Value Levers', targetType: 'value-levers', kind: 'junction', editable: true },
      { key: 'use_cases', label: 'Use Cases', targetType: 'use-cases', kind: 'junction', editable: true },
    ],
  },
  {
    type: 'use-cases', label: 'Use Case', labelPlural: 'Use Cases', icon: '⚡', idPrefix: 'uc',
    fields: [
      ...COMMON_FIELDS, f('use_case_type'), f('persona'), f('trigger_event', 'textarea'),
      f('input_summary', 'textarea'), f('processing_logic', 'textarea'), f('output_summary', 'textarea'),
      f('expected_kpi_contribution', 'textarea'), f('complexity'), f('criticality'), f('risk_tier'),
      f('privacy_risk'), f('model_risk'), f('bias_risk'), f('regulatory_requirement'),
      f('human_in_loop_required', 'boolean'), f('override_allowed', 'boolean'), f('lifecycle_stage'),
    ],
    filterFields: ['use_case_type', 'complexity', 'criticality', 'risk_tier', 'lifecycle_stage', 'status'],
    relationships: [
      { key: 'solutions', label: 'Solutions', targetType: 'solutions', kind: 'junction', editable: true },
      { key: 'data_assets', label: 'Data Assets', targetType: 'data-assets', kind: 'junction', editable: true },
      { key: 'technology_components', label: 'Technology Components', targetType: 'technology-components', kind: 'junction', editable: true },
    ],
  },
  {
    type: 'data-assets', label: 'Data Asset', labelPlural: 'Data Assets', icon: '💾', idPrefix: 'dat',
    fields: [
      ...COMMON_FIELDS, f('data_asset_type'), f('readiness_status'), f('quality_score', 'number'),
      f('completeness_score', 'number'), f('sensitivity_classification'), f('pii_flag', 'boolean'),
    ],
    filterFields: ['data_asset_type', 'readiness_status', 'sensitivity_classification', 'status'],
    relationships: [
      { key: 'use_cases', label: 'Use Cases', targetType: 'use-cases', kind: 'junction', editable: false },
    ],
  },
  {
    type: 'technology-components', label: 'Technology Component', labelPlural: 'Technology Components', icon: '🛠️', idPrefix: 'tec',
    fields: [
      ...COMMON_FIELDS, f('technology_type'), f('architecture_layer'), f('readiness_status'),
      f('maturity_score', 'number'), f('shared_platform_flag', 'boolean'),
    ],
    filterFields: ['technology_type', 'architecture_layer', 'readiness_status', 'status'],
    relationships: [
      { key: 'use_cases', label: 'Use Cases', targetType: 'use-cases', kind: 'junction', editable: false },
    ],
  },
];

export const ENTITY_TYPE_MAP: Record<CatalogEntityType, EntityTypeSpec> =
  Object.fromEntries(ENTITY_TYPES.map((e) => [e.type, e])) as Record<CatalogEntityType, EntityTypeSpec>;

export function specFor(type: CatalogEntityType): EntityTypeSpec {
  return ENTITY_TYPE_MAP[type];
}
