export type BlastLevel = 'bf-low' | 'bf-med' | 'bf-high';

export type LogSeverity = '' | 's-ok' | 's-warn' | 's-err';

export interface LogEntry {
  t: string;   // timestamp
  a: string;   // actor
  m: string;   // message
  c: LogSeverity; // CSS class
}

export interface SimStep {
  icon: string;
  title: string;
  type: string;
  blast: BlastLevel;
  log: LogEntry[];
  risks: string[];
  ctrls: string[];
  insight: string;
}

export type ScenarioId = 'approve' | 'block';

export interface SimulationState {
  scenario: ScenarioId;
  currentStep: number;  // 0-indexed
  maxStep: number;      // highest step unlocked
  liveMode: boolean;
  liveData: SimStep[] | null;
  liveStatus: 'idle' | 'loading' | 'success' | 'error';
}
