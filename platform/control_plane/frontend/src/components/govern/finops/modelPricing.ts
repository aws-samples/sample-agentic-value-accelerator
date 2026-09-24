/**
 * modelPricing — token prices for FORECASTING and PLANNING surfaces.
 *
 * Scope, stated precisely because the previous header overstated it. It claimed to
 * be "the single canonical source of model token prices for the Govern module" and
 * that "everywhere else follows". Neither was true: two separate backend tables
 * priced real traffic and never read this file, and they disagreed with each other
 * by up to 3x on the same model.
 *
 * What this table actually is: prices for HYPOTHETICAL, user-entered scenarios,
 * keyed by SHORT FLEET IDS. Its consumers are the cost-model editor, expected
 * monthly/annual cost, unit economics and the dev-tools efficiency panel - all of
 * which price token counts a user typed in, not tokens anyone measured.
 *
 * Real measured traffic is priced in the backend by `core/model_pricing.py`, keyed
 * by raw Bedrock model id. The two key spaces are genuinely different, so they stay
 * separate tables - but their RATES must not disagree. Any value here that also
 * exists there has been reconciled to the same figure.
 *
 * Note that some ids here are ILLUSTRATIVE and not present in the reference account
 * (`opus-4-7` in particular), because these surfaces let a user model a fleet that
 * does not exist yet. That is legitimate for planning and is why this table is not
 * driven by the live model catalog.
 *
 * Prices are USD per 1,000 tokens. See `provenance` on each entry: current-generation
 * Anthropic models on Bedrock are Marketplace-billed and their rates are NOT
 * published in machine-readable form, so not every figure here can be verified.
 */

export type RateProvenance =
  /** Traced to a named AWS source. */
  | 'verified'
  /** Best figure available, NOT confirmed by an AWS source. Present it as an estimate. */
  | 'best_known';

export interface TokenPrice {
  /** USD per 1,000 input tokens. */
  input: number;
  /** USD per 1,000 output tokens. */
  output: number;
  /** Whether this rate is traceable to an AWS source. */
  provenance: RateProvenance;
  /** Where the rate came from, or why it could not be verified. */
  source: string;
}

/** True when a figure derived from this price must be labelled an estimate. */
export const isEstimatedRate = (p: TokenPrice | undefined): boolean =>
  p?.provenance === 'best_known';

/** Canonical fleet model ids that have pricing. */
export type PricedModelId =
  | 'opus-4-7'
  | 'sonnet-4-5'
  | 'haiku-4-5'
  | 'nova-pro'
  | 'nova-lite';

const S_PRICELIST = 'AWS Price List API, service AmazonBedrock, us-east-1';
const S_SONNET_HAIKU =
  "AWS Cloud Financial Management blog 'Optimize LLM Costs on Amazon Bedrock': " +
  'Sonnet 4.5 $3/$15 per 1M, Haiku 4.5 $1/$5 per 1M';
const S_OPUS_GEN =
  "Current Opus generation rate, from the AWS blog 'Claude Opus 4.5 now in Amazon " +
  "Bedrock' ($5/$25 per 1M). This particular id is illustrative and is not a model " +
  'in the reference account, so the figure is the generation rate, not a published ' +
  'rate for this id.';

/**
 * Bedrock on-demand list prices, USD per 1,000 tokens.
 * Reconciled with backend `core/model_pricing.py` - do not let these drift apart.
 */
export const MODEL_PRICING: Record<PricedModelId, TokenPrice> = {
  'opus-4-7':   { input: 0.005,   output: 0.025,   provenance: 'best_known', source: S_OPUS_GEN },
  'sonnet-4-5': { input: 0.003,   output: 0.015,   provenance: 'verified',   source: S_SONNET_HAIKU },
  'haiku-4-5':  { input: 0.001,   output: 0.005,   provenance: 'verified',   source: S_SONNET_HAIKU },
  'nova-pro':   { input: 0.0008,  output: 0.0032,  provenance: 'verified',   source: S_PRICELIST },
  'nova-lite':  { input: 0.00006, output: 0.00024, provenance: 'verified',   source: S_PRICELIST },
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

/**
 * Canonical token price for a model id, or `undefined` when the id has no
 * price in the shared table. Callers that need a guaranteed value should first
 * narrow with {@link isPricedModelId} and index {@link MODEL_PRICING} directly.
 */
export function priceFor(id: string | undefined | null): TokenPrice | undefined {
  return isPricedModelId(id) ? MODEL_PRICING[id] : undefined;
}
