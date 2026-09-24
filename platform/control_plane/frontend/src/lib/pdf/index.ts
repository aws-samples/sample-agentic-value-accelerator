// Shared PDF report toolkit for the Plan pillar.
//
// Usage: a per-record adapter builds a `ReportDefinition`, then a UI component
// calls `downloadReport(def)`. Formatting lives entirely in ./theme and
// ./reportBuilder, so every record type's report looks the same.

export { downloadReport, generateReportDoc, reportBlob, reportFileName } from './generateReport';
export { ReportBuilder } from './reportBuilder';
export type {
  ReportDefinition,
  ReportMeta,
  ReportField,
  ReportBlock,
  KpiItem,
  TableColumn,
  TableCell,
  TableCellObject,
  BarDatum,
  RadarAxis,
} from './types';
export type { RGB, Tone } from './theme';
export { COLORS } from './theme';
