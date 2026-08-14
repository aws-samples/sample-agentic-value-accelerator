export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  /** True while the assistant is still streaming this message. */
  streaming?: boolean;
  /** IDs of the choices the user has answered for blocks inside this message. */
  answeredChoices?: Record<string, string>;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceBlockData {
  question: string;
  multi?: boolean;
  allow_free_text?: boolean;
  options: ChoiceOption[];
}

/**
 * Highlight category is a free-form string. We provide bespoke styling
 * (icon, color, blurb) for known categories in `HighlightsView`, and a
 * neutral fallback for new ones. This way the backend can introduce new
 * vocabulary without the UI rejecting blocks.
 */
export type HighlightCategory = string;

export interface Highlight {
  id: string;
  category: HighlightCategory;
  label: string;
  detail: string;
}

export interface HighlightsBlock {
  title?: string;
  points: Highlight[];
}

export interface SavedReport {
  id: string;
  client: string;
  title: string;
  date: string;
  status: "draft" | "ready" | "shared";
}

export interface SolutionRow {
  capability: string;
  product: string;
  latency: string;
  fit: "High" | "Medium" | "Exploratory";
}

export interface ReportInsights {
  clientGoals: string[];
  architecture: { label: string; detail: string }[];
  nextSteps: string[];
  metrics: { label: string; value: number; suffix: string; tone: "accent" | "electric" }[];
  completeness: number; // 0 - 100
}
