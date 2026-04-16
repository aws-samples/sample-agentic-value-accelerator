export interface KeyLevel {
  price: string;
  type: string;
  significance: string;
}

export interface TradeIdea {
  instrument: string;
  direction: string;
  entry: string;
  target: string;
  stop_loss: string;
  risk_reward: string;
  conviction: string;
  rationale: string;
}

export interface MarketAnalysis {
  condition: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE';
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_score: number;
  key_levels: KeyLevel[];
  trade_ideas: TradeIdea[];
  execution_notes: string[];
}

export interface Recommendation {
  title: string;
  rationale: string;
  confidence: number;
  timeframe: string;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface TradingResponse {
  entity_id: string;
  research_id: string;
  timestamp: string;
  market_analysis: MarketAnalysis | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
