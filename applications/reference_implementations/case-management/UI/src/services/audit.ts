// Minimal audit logger for decisions and user actions
export interface AuditEvent {
  type: 'DECISION_VIEW' | 'REASON_TAGS_VIEW' | 'STEP_UP_TRIGGER' | 'REFRESH_CLICK';
  txnId?: string;
  decision?: string;
  outcome?: 'PASS' | 'FAIL' | 'TIMEOUT';
  timestamp: string;
}

export const logAuditEvent = (event: AuditEvent) => {
  try {
    const payload = { ...event, timestamp: event.timestamp || new Date().toISOString() };
    // For now, log to console; could POST to server later
    // Keep minimal telemetry per requirements
    // eslint-disable-next-line no-console
    console.log('[audit]', JSON.stringify(payload));
  } catch {
    // swallow
  }
};





