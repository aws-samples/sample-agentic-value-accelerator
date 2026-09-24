// Declarative report model. Each Plan record type provides an adapter that
// maps its record + computed metrics into a ReportDefinition; the shared
// ReportBuilder renders it. Adapters never touch jsPDF directly, which is what
// keeps all four reports visually consistent.

import type { RGB, Tone } from './theme';

// ---------------------------------------------------------------------------
// Cover metadata
// ---------------------------------------------------------------------------

export interface ReportField {
  label: string;
  value: string;
}

export interface ReportMeta {
  /** Record-type eyebrow shown on the cover, e.g. "Business Case". */
  recordType: string;
  /** Primary title — usually the record name. */
  title: string;
  /** Optional descriptive subtitle. */
  subtitle?: string;
  /** Record status (Draft / Approved / …) rendered as a badge. */
  status?: string;
  /** Tone for the status badge. */
  statusTone?: Tone;
  /** Key/value pairs shown in the cover meta panel. */
  fields?: ReportField[];
  /** Optional accent override; defaults to the brand color. */
  accent?: RGB;
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface KpiItem {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}

export type TableAlign = 'left' | 'right' | 'center';

export interface TableColumn {
  header: string;
  align?: TableAlign;
}

export interface TableCellObject {
  text: string;
  tone?: Tone;
  bold?: boolean;
  align?: TableAlign;
}

export type TableCell = string | number | TableCellObject;

export interface BarDatum {
  label: string;
  value: number;
  tone?: Tone;
}

export interface RadarAxis {
  /** Short label rendered around the radar (keep concise — long text clips). */
  label: string;
  value: number;
}

export interface HeadingBlock {
  kind: 'heading';
  text: string;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  text: string;
  muted?: boolean;
}

export interface KpisBlock {
  kind: 'kpis';
  items: KpiItem[];
  /** Cards per row (default 3). */
  columns?: number;
}

export interface KeyValuesBlock {
  kind: 'keyValues';
  rows: ReportField[];
  /** Pairs per row (default 2). */
  columns?: number;
}

export interface TableBlock {
  kind: 'table';
  columns: TableColumn[];
  rows: TableCell[][];
  caption?: string;
  /** Emphasize the final row as a totals/summary row. */
  emphasizeLastRow?: boolean;
}

export interface BarsBlock {
  kind: 'bars';
  title?: string;
  data: BarDatum[];
  /** Axis max; defaults to the data range. */
  max?: number;
  /** Unit label appended to value readouts (e.g. "$", "%"). Unused when a
   *  formatter is supplied. */
  unit?: string;
  /** Optional value formatter for the right-hand readout. */
  format?: (v: number) => string;
}

export interface RadarBlock {
  kind: 'radar';
  title?: string;
  axes: RadarAxis[];
  /** Scale maximum (e.g. 5). Defaults to the largest axis value. */
  max?: number;
}

export interface DividerBlock {
  kind: 'divider';
}

export type ReportBlock =
  | HeadingBlock
  | ParagraphBlock
  | KpisBlock
  | KeyValuesBlock
  | TableBlock
  | BarsBlock
  | RadarBlock
  | DividerBlock;

export interface ReportDefinition {
  meta: ReportMeta;
  blocks: ReportBlock[];
  /** Optional filename override (without extension). */
  fileName?: string;
}
