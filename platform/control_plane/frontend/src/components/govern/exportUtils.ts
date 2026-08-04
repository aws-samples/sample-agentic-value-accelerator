/**
 * exportUtils — shared client-side file export helpers for the Govern module.
 *
 * Centralizes the blob-download pattern that was previously duplicated across
 * ComplianceCenter, ModelOperations, and AuditIncidents.
 */

/** Trigger a browser download of `content` as a file. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download a JS object as pretty-printed JSON. */
export function downloadJSON(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

/** Date stamp (YYYY-MM-DD) for export filenames. Pass a Date to keep callers testable. */
export function dateStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
