import { ChatMessage, ReportInsights, SavedReport, SolutionRow } from "./types";

export const savedReports: SavedReport[] = [
  { id: "r1", client: "Northbridge Capital", title: "Low-Latency Execution Stack", date: "Jun 04", status: "shared" },
  { id: "r2", client: "Atlas Asset Mgmt", title: "Post-Trade Modernization", date: "May 28", status: "ready" },
  { id: "r3", client: "Veritas Markets", title: "Risk Analytics Migration", date: "May 21", status: "draft" },
  { id: "r4", client: "Helix Securities", title: "Cross-Asset Data Mesh", date: "May 14", status: "draft" },
];

export const solutionMatrix: SolutionRow[] = [
  { capability: "Order Execution", product: "VeloCore OMS", latency: "< 40µs", fit: "High" },
  { capability: "Market Data", product: "StreamGrid Feed", latency: "< 5ms", fit: "High" },
  { capability: "Risk Engine", product: "Sentinel RT", latency: "< 200ms", fit: "Medium" },
  { capability: "Post-Trade", product: "ClearPath", latency: "Batch", fit: "Exploratory" },
];

export const initialMessages: ChatMessage[] = [
  {
    id: "greeting",
    role: "assistant",
    content:
      "Hi, I'm **Meridian**. I help you find battle-tested AWS solutions for " +
      "Financial Services workloads — tell me what you're building and I'll " +
      "match it to proven options.",
    timestamp: "",
  },
];

export const reportInsights: ReportInsights = {
  completeness: 68,
  clientGoals: [
    "Achieve sub-50µs order routing latency",
    "Retire legacy in-house OMS without trading downtime",
    "Maintain inline pre-trade risk controls",
  ],
  architecture: [
    { label: "Edge", detail: "Co-located VeloCore OMS" },
    { label: "Data", detail: "StreamGrid normalized feed" },
    { label: "Control", detail: "Sentinel RT pre-trade risk" },
    { label: "Clearing", detail: "ClearPath post-trade (phase 2)" },
  ],
  nextSteps: [
    "Schedule technical deep-dive with Northbridge infra team",
    "Provision co-location proof-of-concept",
    "Share phased migration & shadow-mode timeline",
  ],
  metrics: [
    { label: "Latency Reduction", value: 82, suffix: "%", tone: "accent" },
    { label: "Est. Annual ROI", value: 240, suffix: "%", tone: "electric" },
    { label: "Ops Efficiency Gain", value: 65, suffix: "%", tone: "accent" },
  ],
};
