"""Invariants for core/model_pricing.py.

These exist because the rate tables this module replaced were wrong in ways that
review did not catch and types could not catch. Each test below corresponds to a
defect that actually shipped:

  - a substring matcher that could never match any real model name, so every
    estimate silently used one fallback rate;
  - a bare family key that swallowed newer model versions into legacy pricing,
    overcharging Opus 4.x by 3x;
  - a generic vendor key that matched an embeddings model and invented an output
    rate for a model that emits no output tokens, overstating it 15x;
  - a fallback rate that put a confident dollar figure on unpriced models.

Rates for current-generation Anthropic models cannot be verified programmatically
(Marketplace-billed, absent from both the Bedrock price list offer file and the
page's own metered-unit map), so these tests deliberately assert STRUCTURE and
RELATIONSHIPS rather than pinning the unverifiable numbers. Pinning a BEST_KNOWN
figure would just freeze a guess and make the correct update look like a
regression.
"""

from __future__ import annotations

import pytest

from core.model_pricing import (
    MODEL_RATES,
    ModelRate,
    RateProvenance,
    price_tokens,
    rate_for_model,
)

# Raw model ids as they actually appear in CloudWatch dimensions, inference-profile
# ARNs and Bedrock invocation logs for the reference account.
REAL_MODEL_IDS = [
    "us.anthropic.claude-opus-5",
    "global.anthropic.claude-opus-5",
    "us.anthropic.claude-opus-4-8",
    "us.anthropic.claude-opus-4-5-20251101-v1:0",
    "us.anthropic.claude-sonnet-4-6",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "us.anthropic.claude-fable-5-1",
    "us.amazon.nova-pro-v1:0",
    "amazon.nova-pro-v1:0",
    "us.amazon.nova-lite-v1:0",
    "us.amazon.nova-micro-v1:0",
    "amazon.titan-embed-text-v2:0",
    "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
]


class TestMatcherActuallyMatches:
    """The predecessor table's matcher matched NOTHING. 11 of 11 real model names
    fell through to its `default` row, so every token estimate in the product used
    one Sonnet rate regardless of model. That is the single most important thing to
    keep tested, because it is invisible from reading the code."""

    @pytest.mark.parametrize("model_id", REAL_MODEL_IDS)
    def test_every_real_model_id_resolves(self, model_id: str) -> None:
        assert rate_for_model(model_id) is not None, (
            f"{model_id} resolved to no rate. If the matcher stops matching real ids, "
            "costs silently disappear or fall back - this is exactly how the previous "
            "table came to have ten dead rows."
        )

    def test_key_is_matched_against_the_raw_id_without_normalisation(self) -> None:
        """The old matcher stripped separators from the KEY but not the model string,
        so "nova-pro" became "novapro" and matched neither direction. Keys must be
        written so they appear verbatim in a real model id."""
        for key in MODEL_RATES:
            assert key == key.lower(), f"{key} must be lowercase to match a lowered id"
            assert " " not in key, f"{key} must not contain spaces"


class TestNoLegacyRateShadowing:
    """A bare `claude-opus` family key caught Opus 4.5 and 4.8 - which are current
    generation - and priced them at Claude 3 Opus rates, 3x too high."""

    def test_current_opus_is_not_priced_at_claude_3_opus_rates(self) -> None:
        claude3 = rate_for_model("anthropic.claude-3-opus-20240229-v1:0")
        assert claude3 is not None
        for model_id in (
            "us.anthropic.claude-opus-4-5-20251101-v1:0",
            "us.anthropic.claude-opus-4-8",
            "us.anthropic.claude-opus-5",
        ):
            rate = rate_for_model(model_id)
            assert rate is not None
            assert rate.input < claude3.input, (
                f"{model_id} is priced at or above the Claude 3 Opus input rate "
                f"({rate.input} vs {claude3.input}). Current Opus is materially cheaper; "
                "this is the 3x shadowing bug returning."
            )

    def test_no_bare_family_keys(self) -> None:
        """Bare family keys cannot even match a Claude 3 id (`claude-opus` is not a
        substring of `claude-3-opus`), so their only effect is to catch CURRENT
        models and price them as legacy. They must not come back."""
        for banned in ("claude-opus", "claude-sonnet", "claude-haiku"):
            assert banned not in MODEL_RATES, (
                f"'{banned}' is a bare family key. It matches current-generation ids "
                "and prices them at legacy rates."
            )

    def test_specific_keys_precede_the_keys_they_extend(self) -> None:
        """Order is load-bearing: first substring hit wins."""
        keys = list(MODEL_RATES)
        for i, key in enumerate(keys):
            for later in keys[i + 1:]:
                assert key not in later, (
                    f"'{key}' precedes '{later}' but is a substring of it, so "
                    f"'{later}' can never be reached. Move the specific key first."
                )

    def test_claude_3_ids_still_resolve_to_claude_3_rates(self) -> None:
        """Removing the family keys must not orphan the legacy models. A first draft
        of the replacement table returned None for every real Claude 3 id."""
        for model_id in (
            "anthropic.claude-3-opus-20240229-v1:0",
            "anthropic.claude-3-sonnet-20240229-v1:0",
            "anthropic.claude-3-haiku-20240307-v1:0",
            "anthropic.claude-3-5-sonnet-20241022-v2:0",
        ):
            assert rate_for_model(model_id) is not None, f"{model_id} lost its rate"


class TestEmbeddingModels:
    """A generic `titan` key matched `amazon.titan-embed-text-v2:0`, overstated its
    input rate 15x, and gave an output rate to a model with no output tokens."""

    def test_embedding_model_has_no_output_rate(self) -> None:
        rate = rate_for_model("amazon.titan-embed-text-v2:0")
        assert rate is not None
        assert rate.output is None, (
            "An embeddings model must have output=None, not 0.0 and not a rate. "
            "No output rate is published because it emits no output tokens."
        )

    def test_embedding_model_prices_input_only(self) -> None:
        # Output count is ignored rather than blocking the price.
        assert price_tokens("amazon.titan-embed-text-v2:0", 1_000_000, None) == pytest.approx(0.02)
        assert price_tokens("amazon.titan-embed-text-v2:0", 1_000_000, 500) == pytest.approx(0.02)


class TestNoSilentFallback:
    """There is deliberately no default rate. A fallback is what let the previous
    table report every model at one rate while looking specific."""

    def test_unknown_model_returns_none(self) -> None:
        assert rate_for_model("openai.gpt-5.5") is None
        assert rate_for_model("us.anthropic.claude-sonnet-99") is None
        assert rate_for_model("") is None
        assert rate_for_model(None) is None

    def test_no_default_key_exists(self) -> None:
        for banned in ("default", "fallback", "*"):
            assert banned not in MODEL_RATES

    def test_unpriced_model_yields_none_cost_not_zero(self) -> None:
        assert price_tokens("openai.gpt-5.5", 1000, 1000) is None


class TestMeasuredZeroVersusUnmeasured:
    """A measured zero is a real value; nothing measured is not."""

    def test_measured_zero_prices_to_zero(self) -> None:
        assert price_tokens("us.amazon.nova-pro-v1:0", 0, 0) == 0.0

    def test_nothing_measured_returns_none(self) -> None:
        assert price_tokens("us.amazon.nova-pro-v1:0", None, None) is None

    def test_unmeasured_output_does_not_block_input_pricing(self) -> None:
        cost = price_tokens("us.amazon.nova-pro-v1:0", 1_000_000, None)
        assert cost is not None and cost > 0


class TestProvenance:
    """Current-gen Anthropic rates are not published in machine-readable form, so
    the table must say which figures are trustworthy rather than implying all are."""

    def test_every_rate_declares_provenance_and_a_source(self) -> None:
        for key, rate in MODEL_RATES.items():
            assert isinstance(rate, ModelRate)
            assert isinstance(rate.provenance, RateProvenance)
            assert rate.source.strip(), f"{key} has no source recorded"

    def test_estimated_flag_tracks_provenance(self) -> None:
        for key, rate in MODEL_RATES.items():
            expected = rate.provenance is RateProvenance.BEST_KNOWN
            assert rate.estimated is expected, f"{key} estimated flag disagrees"

    def test_marketplace_billed_models_are_not_claimed_as_verified(self) -> None:
        """These specific models are absent from BOTH the AWS Price List offer file
        for AmazonBedrock and the pricing page's metered-unit map, because they are
        billed through AWS Marketplace. Marking one VERIFIED requires citing a real
        source in `source` - update this list when that happens."""
        unverifiable = ("claude-opus-5", "claude-opus-4-8", "claude-sonnet-5", "claude-fable")
        for key in unverifiable:
            rate = MODEL_RATES.get(key)
            if rate is None:
                continue
            if rate.provenance is RateProvenance.VERIFIED:
                assert "pricing page" in rate.source.lower() or "http" in rate.source.lower(), (
                    f"{key} is marked VERIFIED but its source does not cite where the "
                    "rate was read from. Do not mark a Marketplace-billed rate verified "
                    "without a citation."
                )


class TestCacheRates:
    """Cache multipliers are provider-specific. Applying one ratio across providers
    misstates both: Anthropic is 1.25x write / 0.10x read, but Nova does not charge
    for cache writes at all and reads are 0.25x."""

    ANTHROPIC_KEYS = [k for k in MODEL_RATES if k.startswith("claude")]
    NOVA_KEYS = [k for k in MODEL_RATES if k.startswith("nova")]

    @pytest.mark.parametrize("key", ANTHROPIC_KEYS)
    def test_anthropic_cache_multipliers(self, key: str) -> None:
        rate = MODEL_RATES[key]
        assert rate.cache_read is not None and rate.cache_write is not None
        assert rate.cache_read / rate.input == pytest.approx(0.10, rel=1e-6), (
            f"{key} cache read should be 0.10x input (a 90% discount)"
        )
        assert rate.cache_write / rate.input == pytest.approx(1.25, rel=1e-6), (
            f"{key} cache write should be 1.25x input - it costs MORE than fresh input"
        )

    @pytest.mark.parametrize("key", NOVA_KEYS)
    def test_nova_cache_rates(self, key: str) -> None:
        rate = MODEL_RATES[key]
        assert rate.cache_write == 0.0, f"{key}: Nova does not charge for cache writes"
        assert rate.cache_read is not None
        assert rate.cache_read / rate.input == pytest.approx(0.25, rel=1e-6), (
            f"{key} cache read should be 0.25x input for Nova, not the Anthropic 0.10x"
        )


class TestRateSanity:
    def test_all_rates_are_positive_and_output_exceeds_input(self) -> None:
        for key, rate in MODEL_RATES.items():
            assert rate.input > 0, f"{key} has a non-positive input rate"
            if rate.output is not None:
                assert rate.output > 0, f"{key} has a non-positive output rate"
                assert rate.output >= rate.input, (
                    f"{key} output rate is below its input rate, which no Bedrock "
                    "text model has. Likely a transposed pair."
                )

    def test_rates_are_per_1k_not_per_1m(self) -> None:
        """A per-1M figure pasted into a per-1K table understates cost 1000x. Every
        published Bedrock text rate is well under $1 per 1K tokens."""
        for key, rate in MODEL_RATES.items():
            assert rate.input < 1.0, f"{key} input {rate.input} looks like a per-1M rate"
            if rate.output is not None:
                assert rate.output < 1.0, f"{key} output {rate.output} looks per-1M"
