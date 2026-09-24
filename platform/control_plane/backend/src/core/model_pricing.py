"""model_pricing — the one place model token rates are defined for the backend.

WHY THIS EXISTS
---------------
There were three per-1K rate tables plus four more price surfaces, and they
disagreed. The same model could cost 3x more depending on which service answered:

  govern_cost_service._BEDROCK_PRICING   claude-opus-5  0.015 / 0.075
  govern_developer_ai_service.MODEL_COSTS claude-opus-5  0.005 / 0.025

`_BEDROCK_PRICING` has been deleted outright. It existed only to run BACKWARDS -
dividing Cost Explorer dollars by a rate to guess a token count - and its key
matcher could never match anything (it stripped hyphens from the key but not from
the model string), so all ten of its rows were dead and every estimate silently
used its `default` row. Real token counts come from CloudWatch, so the estimator
was both broken and unnecessary.

This module therefore covers FORWARD pricing only: measured tokens -> dollars.

PROVENANCE IS PART OF THE DATA
------------------------------
Current-generation Claude models on Bedrock are billed through AWS Marketplace and
their rates are NOT published in machine-readable form. Verified directly: across
all 11,621 `usagetype` values under service code `AmazonBedrock` in the AWS Price
List API, the only Anthropic entries are Claude 2.0, 2.1, 3 Haiku, 3 Sonnet and
Instant. The model cards say "For pricing, see the Amazon Bedrock Pricing page",
and that page renders its per-model tables client-side. That is a circular
reference with no reachable number.

So some rates here cannot be verified, and pretending otherwise is how a guess
becomes a quoted figure. Every rate carries its `provenance` and its `source`:

  VERIFIED    - traced to a specific AWS source, named in `source`.
  BEST_KNOWN  - the best figure available, NOT confirmed by an AWS source.
                Any user-visible number resting on one of these must be
                presented as an estimate.

CACHE MULTIPLIERS ARE PROVIDER-SPECIFIC
---------------------------------------
Do not apply one ratio across providers. Measured from published rates:
  Anthropic: cache write 1.25x input, cache read 0.10x input (90% discount).
  Amazon Nova: cache write $0.00 (not charged), cache read 0.25x input.
Cache rates are therefore stated explicitly per model, never derived.

UNITS
-----
USD per 1,000 tokens, matching every existing call site. `output` is None for
embedding-only models, which have no output rate at all - distinct from 0.0.

ADDING A MODEL
--------------
Order matters: `rate_for_model` takes the FIRST key that appears as a substring of
the model id, so specific keys must precede family keys. `claude-opus-4-5` has to
come before `claude-opus`, or Opus 4.5 silently inherits Claude-3-Opus pricing -
which is exactly the live 3x error this module was written to fix.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional


class RateProvenance(str, Enum):
    """Whether a rate is traceable to an AWS source."""

    VERIFIED = "verified"
    BEST_KNOWN = "best_known"


@dataclass(frozen=True)
class ModelRate:
    """Per-1K-token rates for one model, with the provenance of those rates."""

    input: float
    # None for embedding-only models: they have no output rate, which is a
    # different statement from an output rate of zero.
    output: Optional[float]
    provenance: RateProvenance
    source: str
    # Explicit, never derived from `input` - the multiplier differs by provider.
    # None means the cache rate is unknown, not that caching is free.
    cache_read: Optional[float] = None
    cache_write: Optional[float] = None

    @property
    def estimated(self) -> bool:
        """True when a figure derived from this rate must be labelled an estimate."""
        return self.provenance is RateProvenance.BEST_KNOWN


_V = RateProvenance.VERIFIED
_B = RateProvenance.BEST_KNOWN

# Sources, spelled out once so each entry stays readable.
_S_PRICELIST = "AWS Price List API, service AmazonBedrock, us-east-1"
_S_OPUS45 = "AWS blog 'Claude Opus 4.5 now in Amazon Bedrock': $5/$25 per 1M"
_S_SONNET_HAIKU = (
    "AWS Cloud Financial Management blog 'Optimize LLM Costs on Amazon Bedrock': "
    "Sonnet 4.5 $3/$15 per 1M, Haiku 4.5 $1/$5 per 1M"
)
_S_MARKETPLACE = (
    "NOT PUBLISHED. Marketplace-billed; absent from the AWS Price List API and the "
    "model card defers to the pricing page, which renders rates client-side. Figure "
    "carried forward from the prior in-repo table."
)

# Ordered MOST SPECIFIC FIRST. See the module docstring on ordering.
MODEL_RATES: Dict[str, ModelRate] = {
    # ── Anthropic, specific versions ──────────────────────────────────────────
    # Opus 4.5 is the one current-generation Opus rate AWS states outright, and it
    # is what establishes that the whole current Opus line is $5/$25 rather than
    # the $15/$75 of Claude 3 Opus.
    "claude-opus-4-5": ModelRate(0.005, 0.025, _V, _S_OPUS45,
                                 cache_read=0.0005, cache_write=0.00625),
    # Same generation as 4.5; AWS publishes no separate figure.
    "claude-opus-4-8": ModelRate(0.005, 0.025, _B, _S_MARKETPLACE,
                                 cache_read=0.0005, cache_write=0.00625),
    "claude-opus-5": ModelRate(0.005, 0.025, _B, _S_MARKETPLACE,
                               cache_read=0.0005, cache_write=0.00625),
    "claude-sonnet-4-5": ModelRate(0.003, 0.015, _V, _S_SONNET_HAIKU,
                                   cache_read=0.0003, cache_write=0.00375),
    "claude-sonnet-4-6": ModelRate(0.003, 0.015, _B, _S_MARKETPLACE,
                                   cache_read=0.0003, cache_write=0.00375),
    "claude-sonnet-5": ModelRate(0.002, 0.010, _B, _S_MARKETPLACE,
                                 cache_read=0.0002, cache_write=0.0025),
    "claude-haiku-4-5": ModelRate(0.001, 0.005, _V, _S_SONNET_HAIKU,
                                  cache_read=0.0001, cache_write=0.00125),
    "claude-fable": ModelRate(0.010, 0.050, _B, _S_MARKETPLACE,
                              cache_read=0.001, cache_write=0.0125),

    # ── Anthropic, Claude 3 era: keyed EXPLICITLY, never as a bare family ─────
    # There are deliberately NO bare `claude-opus` / `claude-sonnet` / `claude-haiku`
    # family keys. Such a key cannot match a Claude 3 id anyway - those read
    # `claude-3-opus`, so "claude-opus" is not a substring - which means a bare
    # family key catches only CURRENT-generation models that lack a specific entry
    # and prices them at Claude-3-era rates. That is precisely the live 3x error
    # this module fixes: `claude-opus` was catching Opus 4.5 and 4.8 at $15/$75.
    #
    # An unlisted model therefore returns None and renders "cost unavailable",
    # which is the correct failure mode. Add an explicit entry for a new model.
    "claude-3-opus": ModelRate(0.015, 0.075, _V,
                               "AWS blog: Claude 3 Opus $0.015/$0.075 per 1K",
                               cache_read=0.0015, cache_write=0.01875),
    "claude-3-5-sonnet": ModelRate(0.003, 0.015, _V,
                                   "AWS Bedrock pricing page: Claude 3.5 Sonnet",
                                   cache_read=0.0003, cache_write=0.00375),
    "claude-3-sonnet": ModelRate(0.003, 0.015, _V, _S_PRICELIST + " (Claude3Sonnet)",
                                 cache_read=0.0003, cache_write=0.00375),
    "claude-3-5-haiku": ModelRate(0.0008, 0.004, _B, _S_MARKETPLACE,
                                  cache_read=0.00008, cache_write=0.001),
    "claude-3-haiku": ModelRate(0.00025, 0.00125, _V, _S_PRICELIST + " (Claude3Haiku)",
                                cache_read=0.000025, cache_write=0.0003125),

    # ── Amazon Nova. Cache write is NOT charged; cache read is 0.25x input. ───
    "nova-pro": ModelRate(0.0008, 0.0032, _V, _S_PRICELIST,
                          cache_read=0.0002, cache_write=0.0),
    "nova-lite": ModelRate(0.00006, 0.00024, _V, _S_PRICELIST,
                           cache_read=0.000015, cache_write=0.0),
    "nova-micro": ModelRate(0.000035, 0.00014, _V, _S_PRICELIST,
                            cache_read=0.00000875, cache_write=0.0),

    # ── Amazon Titan embeddings: input only, no output rate exists ────────────
    # The previous generic "titan" row was 0.0003/0.0004, which matches NO
    # published Titan price and overstated Embeddings V2 input by 15x while
    # inventing an output rate for a model that produces no output tokens.
    "titan-embed": ModelRate(0.00002, None, _V, _S_PRICELIST + " (TitanEmbeddingsV2-Text)"),
}


def rate_for_model(model: Optional[str]) -> Optional[ModelRate]:
    """Rates for a model id, or None when nothing prices it.

    Substring match, first hit wins, so MODEL_RATES order is load-bearing.

    Returning None rather than a fallback rate is deliberate and is what lets
    callers report an honest "cost unavailable". A default rate would put a
    confident number on a model nobody has priced - and that is precisely how the
    deleted `_BEDROCK_PRICING` came to report every model at the Sonnet rate.
    """
    if not model:
        return None
    model_lower = model.lower()
    for key, rate in MODEL_RATES.items():
        if key in model_lower:
            return rate
    return None


def price_tokens(
    model: Optional[str],
    input_tokens: Optional[int],
    output_tokens: Optional[int],
) -> Optional[float]:
    """USD for measured token counts, or None when not priceable.

    None when the model has no rate, or when NOTHING was measured. A measured 0 is
    a real zero - a guardrail-blocked call consumes no tokens - and prices to
    $0.00, which is materially different from None.

    An unmeasured output count contributes nothing rather than blocking the price:
    embedding models legitimately emit no output tokens, so their input cost is
    still exactly right. The same applies when a model has no output RATE.
    """
    rate = rate_for_model(model)
    if rate is None:
        return None
    if input_tokens is None and output_tokens is None:
        return None
    cost = ((input_tokens or 0) / 1000.0) * rate.input
    if rate.output is not None:
        cost += ((output_tokens or 0) / 1000.0) * rate.output
    return round(cost, 6)
