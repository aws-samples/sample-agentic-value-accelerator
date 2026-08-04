/**
 * expectedCost — FinOps expected-cost model for use cases.
 *
 * Self-contained within the Govern/FinOps module: token pricing, the per-use-case
 * cost-input store (localStorage), and the cost calculation. The Plan module owns
 * the real UseCase record; FinOps reads those use cases (via the governance
 * aggregator) and layers expected-cost inputs on top here, without modifying the
 * Plan module or the shared API types.
 */

export interface TokenPrice {
  /** USD per 1,000 input tokens. */
  input: number;
  /** USD per 1,000 output tokens. */
  output: number;
}

/** Canonical fleet model ids that have pricing. */
export type PricedModelId =
  | 'opus-4-7'
  | 'sonnet-4-5'
  | 'haiku-4-5'
  | 'nova-pro'
  | 'nova-lite';

/**
 * AWS Bedrock on-demand list prices, USD per 1,000 tokens. Update here on change.
 * Anthropic prices verified against the Bedrock pricing page (US East, on-demand):
 * Opus 4.7 $5/$25, Sonnet 4.5 $3/$15, Haiku 4.5 $1/$5 per 1M tokens. Nova prices
 * per the Amazon Nova on-demand rates.
 */
export const MODEL_PRICING: Record<PricedModelId, TokenPrice> = {
  'opus-4-7':   { input: 0.005,   output: 0.025   },
  'sonnet-4-5': { input: 0.003,   output: 0.015   },
  'haiku-4-5':  { input: 0.001,   output: 0.005   },
  'nova-pro':   { input: 0.0008,  output: 0.0032  },
  'nova-lite':  { input: 0.00006, output: 0.00024 },
};

export const PRICED_MODEL_LABELS: Record<PricedModelId, string> = {
  'opus-4-7':   'Claude Opus 4.7',
  'sonnet-4-5': 'Claude Sonnet 4.5',
  'haiku-4-5':  'Claude Haiku 4.5',
  'nova-pro':   'Nova Pro',
  'nova-lite':  'Nova Lite',
};

export const PRICED_MODEL_IDS = Object.keys(MODEL_PRICING) as PricedModelId[];

export function isPricedModelId(id: string | undefined | null): id is PricedModelId {
  return id != null && id in MODEL_PRICING;
}

/** Default tokens-per-task heuristic when a use case hasn't specified its own. */
export const DEFAULT_TOKENS_PER_TASK = { input: 1500, output: 340 }; // ~1,840 tokens/call

/** Per-use-case expected-cost inputs, persisted client-side keyed by use_case_id. */
export interface UseCaseCostInputs {
  model_id: PricedModelId;
  expected_tasks_per_month: number;
  tokens_in_per_task: number;
  tokens_out_per_task: number;
}

export interface ExpectedCostResult {
  costPerTask: number;
  monthlyCost: number;
  annualCost: number;
}

/**
 * Expected token cost for a use case.
 *   costPerTask = (tokensIn/1000 × in) + (tokensOut/1000 × out)
 *   monthlyCost = costPerTask × tasksPerMonth
 */
export function computeExpectedCost(inputs: UseCaseCostInputs): ExpectedCostResult {
  const price = MODEL_PRICING[inputs.model_id];
  const costPerTask =
    (inputs.tokens_in_per_task / 1000) * price.input +
    (inputs.tokens_out_per_task / 1000) * price.output;
  const monthlyCost = costPerTask * Math.max(0, inputs.expected_tasks_per_month);
  return { costPerTask, monthlyCost, annualCost: monthlyCost * 12 };
}

// ─────────────────────── Per-use-case cost-input store ───────────────────────

const LS_KEY = 'ava_govern_finops_costmodels';
type CostInputMap = Record<string, UseCaseCostInputs>;

function readAll(): CostInputMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CostInputMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: CostInputMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — non-fatal, cost inputs just won't persist */
  }
}

export const costInputStore = {
  get(useCaseId: string): UseCaseCostInputs | undefined {
    return readAll()[useCaseId];
  },
  getAll(): CostInputMap {
    return readAll();
  },
  set(useCaseId: string, inputs: UseCaseCostInputs | null): void {
    const map = readAll();
    if (inputs == null) delete map[useCaseId];
    else map[useCaseId] = inputs;
    writeAll(map);
  },
};
