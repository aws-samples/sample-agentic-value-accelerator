// Orchestrator: turn a ReportDefinition into a downloadable PDF. UI components
// call `downloadReport(def)`; adapters produce the `def`.

import { jsPDF } from 'jspdf';
import { ReportBuilder } from './reportBuilder';
import { fileTimestamp } from './theme';
import type { ReportDefinition } from './types';

function sanitize(s: string): string {
  return (s || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'report';
}

/** `<RecordType>_<Title>_<YYYY-MM-DD-hh-mm>.pdf` (or the def's fileName override). */
export function reportFileName(def: ReportDefinition, generatedAt: Date = new Date()): string {
  if (def.fileName) return `${sanitize(def.fileName)}.pdf`;
  return `${sanitize(def.meta.recordType)}_${sanitize(def.meta.title)}_${fileTimestamp(generatedAt)}.pdf`;
}

/** Render the definition to a jsPDF document (no download). */
export function generateReportDoc(def: ReportDefinition, generatedAt: Date = new Date()): jsPDF {
  return new ReportBuilder().build(def, generatedAt);
}

/** Render the definition to a Blob — handy for previews or uploads. */
export function reportBlob(def: ReportDefinition, generatedAt: Date = new Date()): Blob {
  return generateReportDoc(def, generatedAt).output('blob');
}

/** Build the PDF and trigger a browser download. The same timestamp is used for
 *  the filename and the report's "Generated" line so they always match. */
export function downloadReport(def: ReportDefinition): void {
  const generatedAt = new Date();
  generateReportDoc(def, generatedAt).save(reportFileName(def, generatedAt));
}
