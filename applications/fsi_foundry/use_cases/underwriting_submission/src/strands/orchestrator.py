# SPDX-License-Identifier: Apache-2.0
"""
Underwriting Submission Triage Orchestrator (Strands Implementation).

Coordinates the specialist agents (Appetite Screener, Exposure Analyst,
Pricing Indicator) to triage a commercial insurance submission into a
quote / refer / decline decision.

Two things here differ deliberately from the generated orchestrators found
elsewhere in this repository, and both are intentional:

1. `_build_synthesis_prompt` is typed against the three known agent results
   rather than accepting `*args, **kwargs` and flattening whatever arrives.
   The loose form is a code-generation artifact; it makes it impossible to
   tell which agents contributed to a synthesis.

2. The synthesis schema and the supervisor context are both built per triage
   mode. A partial run must not be asked for a `decision` it has no basis to
   make - see `_response_schema` and `_domain_context` for the reasoning.
"""

import uuid
from datetime import datetime
from typing import Any, Dict

from base.strands import StrandsOrchestrator
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt

from .agents import AppetiteScreener, ExposureAnalyst, PricingIndicator
from .agents.appetite_screener import screen_appetite
from .agents.exposure_analyst import analyze_exposure
from .agents.pricing_indicator import indicate_pricing
from .models import (
    AppetiteReview,
    ExposureAssessment,
    PricingIndication,
    SubmissionRequest,
    SubmissionResponse,
    TriageType,
)

# Which specialists each triage mode runs. Single source of truth for the
# branching in run_assessment / arun_assessment and for schema construction.
MODE_AGENTS: Dict[str, tuple[str, ...]] = {
    TriageType.FULL.value: ("appetite", "exposure", "pricing"),
    TriageType.APPETITE_ONLY.value: ("appetite",),
    TriageType.EXPOSURE_ONLY.value: ("exposure",),
    TriageType.PRICING_ONLY.value: ("pricing",),
}

# Human-readable names for the sections a partial run did NOT assess, used to
# make the summary state its own limits rather than implying completeness.
SECTION_LABELS = {
    "appetite": "risk appetite screening",
    "exposure": "exposure and loss history analysis",
    "pricing": "technical pricing indication",
}


class UnderwritingOrchestrator(StrandsOrchestrator):
    """
    Underwriting submission triage orchestrator.

    Coordinates the Appetite Screener, Exposure Analyst and Pricing Indicator
    and synthesises their findings into a triage decision.
    """

    name = "underwriting_orchestrator"

    system_prompt = """You are a Senior Commercial Lines Underwriting Manager supervising submission triage.

Your role is to:
1. Coordinate the work of specialist agents (Appetite Screener, Exposure Analyst, Pricing Indicator)
2. Reconcile their findings into a single defensible triage outcome
3. Decide whether the submission should be quoted, referred, or declined

The specialists are not equal authorities. Apply this precedence:
- Risk appetite is a veto, not a vote. A breach of a prohibition, limit or requirement rule
  is dispositive: if appetite screening returns out_of_appetite, the outcome is decline
  regardless of how attractive the exposure profile or the indicated price may be. Being
  non-negotiable is what makes a prohibition a prohibition.
- Referral findings are weighable. A referral trigger, incomplete data, or an adverse loss
  history may combine to move an outcome between refer and quote.
- Pricing may never upgrade an outcome. An attractive indicated premium is not a reason to
  quote a risk that failed screening or that cannot be credibly assessed.

Reconciling figures:
- total_insured_value means the CURRENT property schedule total. The expiring programme's
  insured value is a separate historical figure that the pricing specialist anchors on; it
  must never overwrite the current total.
- If specialists report different current-schedule totals, use the Exposure Analyst's figure
  and record the discrepancy. A submission whose declared total disagrees with the sum of its
  own schedule is itself a finding worth reporting back to the broker.

Be concise, quantitative and auditable. An underwriter must be able to trace every conclusion
back to a specialist finding and the data behind it."""

    def __init__(self):
        super().__init__(
            agents={
                "appetite_screener": AppetiteScreener(),
                "exposure_analyst": ExposureAnalyst(),
                "pricing_indicator": PricingIndicator(),
            }
        )

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------

    def run_assessment(
        self,
        submission_id: str,
        triage_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """
        Run the triage workflow synchronously.

        Provided for parity with the other use cases and for local testing
        without an event loop. The registered entry point uses the async path.

        Args:
            submission_id: Submission identifier
            triage_type: full, appetite_only, exposure_only or pricing_only
            context: Additional context for the triage

        Returns:
            Dictionary with each specialist's result and the synthesis
        """
        appetite = exposure = pricing = None
        wanted = MODE_AGENTS.get(triage_type, MODE_AGENTS[TriageType.FULL.value])
        input_text = self._build_input_text(submission_id, context)

        if len(wanted) > 1:
            keys = {
                "appetite": "appetite_screener",
                "exposure": "exposure_analyst",
                "pricing": "pricing_indicator",
            }
            results = self.run_parallel([keys[w] for w in wanted], input_text)
            appetite = self._wrap("appetite_screener", submission_id, results["appetite_screener"].output)
            exposure = self._wrap("exposure_analyst", submission_id, results["exposure_analyst"].output)
            pricing = self._wrap("pricing_indicator", submission_id, results["pricing_indicator"].output)
        elif wanted == ("appetite",):
            appetite = self._wrap("appetite_screener", submission_id,
                                  self.run_agent("appetite_screener", input_text).output)
        elif wanted == ("exposure",):
            exposure = self._wrap("exposure_analyst", submission_id,
                                  self.run_agent("exposure_analyst", input_text).output)
        elif wanted == ("pricing",):
            pricing = self._wrap("pricing_indicator", submission_id,
                                 self.run_agent("pricing_indicator", input_text).output)

        summary = self.synthesize(
            {}, self._build_synthesis_prompt(appetite, exposure, pricing, triage_type)
        )

        return {
            "submission_id": submission_id,
            "triage_type": triage_type,
            "appetite_review": appetite,
            "exposure_assessment": exposure,
            "pricing_indication": pricing,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        submission_id: str,
        triage_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """
        Run the triage workflow asynchronously.

        Args:
            submission_id: Submission identifier
            triage_type: full, appetite_only, exposure_only or pricing_only
            context: Additional context for the triage

        Returns:
            Dictionary with each specialist's result and the synthesis
        """
        import asyncio

        appetite = exposure = pricing = None
        wanted = MODE_AGENTS.get(triage_type, MODE_AGENTS[TriageType.FULL.value])

        if len(wanted) > 1:
            appetite, exposure, pricing = await asyncio.gather(
                screen_appetite(submission_id, context),
                analyze_exposure(submission_id, context),
                indicate_pricing(submission_id, context),
            )
        elif wanted == ("appetite",):
            appetite = await screen_appetite(submission_id, context)
        elif wanted == ("exposure",):
            exposure = await analyze_exposure(submission_id, context)
        elif wanted == ("pricing",):
            pricing = await indicate_pricing(submission_id, context)

        # Strands synthesis is synchronous, so run it off the event loop.
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize(
                {}, self._build_synthesis_prompt(appetite, exposure, pricing, triage_type)
            ),
        )

        return {
            "submission_id": submission_id,
            "triage_type": triage_type,
            "appetite_review": appetite,
            "exposure_assessment": exposure,
            "pricing_indication": pricing,
            "final_summary": summary,
        }

    # ------------------------------------------------------------------
    # Prompt and schema construction
    # ------------------------------------------------------------------

    @staticmethod
    def _wrap(agent: str, submission_id: str, output: str) -> Dict[str, Any]:
        """Shape a sync agent result like the async wrappers do."""
        return {"agent": agent, "submission_id": submission_id, "analysis": output}

    def _build_input_text(self, submission_id: str, context: str | None = None) -> str:
        """
        Build the shared input used by the synchronous path.

        The async path does not use this: each agent's own wrapper carries the
        retrieval steps specific to the data that agent needs. Keeping those
        instructions in the wrappers rather than here is what allows the data
        source to change without touching any system prompt.
        """
        base = f"""Triage the following commercial insurance submission: {submission_id}

Steps to follow:
1. Retrieve the submission using the s3_retriever_tool with data_type='profile'
2. Retrieve any further records you need for your specialism using the s3_retriever_tool
3. Analyse the retrieved data and provide your complete specialist assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _response_schema(self, triage_type: str) -> Dict[str, Any]:
        """
        Build the synthesis schema for this triage mode.

        The schema is mode-dependent for two reasons:

        `decision` is only present for a full triage. A partial run has no
        basis for one. Appetite screening alone is sufficient to decline but
        never sufficient to quote, and exposure or pricing alone cannot decide
        in either direction - a critical exposure may still be quotable at the
        right price, and an attractive price on a prohibited risk is still a
        decline. Rather than emit a decision drawn from a third of the
        evidence, the field is left unset and the caller reads the specialist
        section instead.

        Only the sections whose agents actually ran are requested, so the model
        is never asked to invent a figure that will be discarded.
        """
        wanted = MODE_AGENTS.get(triage_type, MODE_AGENTS[TriageType.FULL.value])
        schema: Dict[str, Any] = {}

        if triage_type == TriageType.FULL.value:
            schema["decision"] = "quote|refer|decline"

        if "appetite" in wanted:
            schema.update({
                "appetite_status": "in_appetite|out_of_appetite|referral_required",
                "checks_passed": ["appetite rule_ids satisfied or not applicable, with brief reason"],
                "checks_failed": ["appetite rule_ids breached, with the data that breached them"],
                "prohibited_classes_triggered": ["prohibited occupancy or business classes found"],
                "appetite_notes": ["referral rationale, licensing and sanctions observations, rules not evaluable"],
            })

        if "exposure" in wanted:
            schema.update({
                "total_insured_value": "float - current property schedule total",
                "exposure_severity": "low|moderate|high|critical",
                "concentration_flags": ["each stating catastrophe zone, value and percentage of total"],
                "loss_history_summary": "string - frequency, severity, trend and open reserves",
                "exposure_findings": ["findings supporting the severity rating"],
                "exposure_notes": ["data limitations, missing fields, assumptions"],
            })

        if "pricing" in wanted:
            schema.update({
                "indicated_premium": "float - 0 if the risk should not be priced",
                "rate_per_thousand": "float - premium per $1,000 of total insured value",
                "loss_ratio_estimate": "float 0.0-1.0 or higher if loss experience exceeds premium",
                "confidence_score": "float 0.0-1.0",
                "justification": ["rating factors and adjustments behind the indication"],
                "pricing_notes": ["pricing caveats and assumptions"],
            })

        # Always requested. This is the list a broker acts on, so it must be
        # populated whenever anything is missing - not only when the pricing
        # specialist happened to run. Merge it from every agent that did run.
        schema["missing_information"] = [
            "specific items required from the broker, drawn from every specialist that ran"
        ]

        if triage_type == TriageType.FULL.value:
            schema["summary"] = (
                "Executive summary with the quote/refer/decline recommendation and its rationale"
            )
        else:
            not_assessed = ", ".join(
                SECTION_LABELS[s] for s in ("appetite", "exposure", "pricing") if s not in wanted
            )
            schema["summary"] = (
                f"Executive summary of this partial assessment. State explicitly that "
                f"{not_assessed} was not assessed and that no overall triage decision has "
                f"been reached. Do not imply a quote, refer or decline outcome."
            )

        return schema

    def _domain_context(self, triage_type: str) -> str:
        """
        Build the supervisor context for this triage mode.

        For a full triage this is the supervisor prompt unchanged, precedence
        rules included. For a partial triage the precedence rules are mostly
        moot - there is nothing to reconcile - and the model is instead told
        not to reach for a decision it cannot support.
        """
        if triage_type == TriageType.FULL.value:
            return self.system_prompt

        wanted = MODE_AGENTS.get(triage_type, ())
        assessed = ", ".join(SECTION_LABELS[s] for s in wanted)
        not_assessed = ", ".join(
            SECTION_LABELS[s] for s in ("appetite", "exposure", "pricing") if s not in wanted
        )

        return f"""You are a Senior Commercial Lines Underwriting Manager recording a PARTIAL submission assessment.

Only {assessed} was performed. {not_assessed} was NOT performed.

Because of that:
- Do NOT reach a quote, refer or decline outcome. There is no basis for one.
- Do NOT infer findings for the specialism that did not run, and do not imply its conclusion.
- State plainly in your summary which assessment was carried out and which was not.
- Report what the specialist that ran actually found, and list any information it identified
  as missing from the submission.

Be concise, quantitative and auditable."""

    def _build_synthesis_prompt(
        self,
        appetite: Dict[str, Any] | None,
        exposure: Dict[str, Any] | None,
        pricing: Dict[str, Any] | None,
        triage_type: str,
    ) -> str:
        """Build the structured synthesis prompt for this triage mode."""
        agent_results: Dict[str, Any] = {}
        if appetite:
            agent_results["appetite_screening"] = appetite
        if exposure:
            agent_results["exposure_analysis"] = exposure
        if pricing:
            agent_results["pricing_indication"] = pricing

        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema=self._response_schema(triage_type),
            domain_context=self._domain_context(triage_type),
        )


async def run_underwriting_triage(request: SubmissionRequest) -> SubmissionResponse:
    """
    Run the underwriting submission triage workflow (Strands implementation).

    This is the entry point registered with the platform agent registry.

    Args:
        request: Validated triage request

    Returns:
        SubmissionResponse. If the synthesis output cannot be parsed as JSON the
        response degrades to carrying the raw synthesis text in `summary` rather
        than failing the invocation.
    """
    orchestrator = UnderwritingOrchestrator()
    triage_type = request.triage_type.value
    wanted = MODE_AGENTS.get(triage_type, MODE_AGENTS[TriageType.FULL.value])

    final_state = await orchestrator.arun_assessment(
        submission_id=request.submission_id,
        triage_type=triage_type,
        context=request.additional_context,
    )

    decision = None
    appetite_review = exposure_assessment = pricing_indication = None
    missing_information: list[str] = []
    summary = "Triage completed"

    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        missing_information = structured.get("missing_information", []) or []

        # Only a full triage yields a decision. See _response_schema.
        if triage_type == TriageType.FULL.value:
            decision = structured.get("decision")

        if "appetite" in wanted:
            appetite_review = AppetiteReview(
                status=structured.get("appetite_status"),
                checks_passed=structured.get("checks_passed", []) or [],
                checks_failed=structured.get("checks_failed", []) or [],
                prohibited_classes_triggered=structured.get("prohibited_classes_triggered", []) or [],
                notes=structured.get("appetite_notes", []) or [],
            )

        if "exposure" in wanted:
            exposure_assessment = ExposureAssessment(
                total_insured_value=structured.get("total_insured_value", 0.0) or 0.0,
                severity=structured.get("exposure_severity"),
                concentration_flags=structured.get("concentration_flags", []) or [],
                loss_history_summary=structured.get("loss_history_summary"),
                findings=structured.get("exposure_findings", []) or [],
                notes=structured.get("exposure_notes", []) or [],
            )

        if "pricing" in wanted:
            pricing_indication = PricingIndication(
                indicated_premium=structured.get("indicated_premium", 0.0) or 0.0,
                rate_per_thousand=structured.get("rate_per_thousand", 0.0) or 0.0,
                loss_ratio_estimate=structured.get("loss_ratio_estimate", 0.0) or 0.0,
                confidence_score=structured.get("confidence_score", 0.0) or 0.0,
                justification=structured.get("justification", []) or [],
                notes=structured.get("pricing_notes", []) or [],
            )
    except (ValueError, Exception):
        # Unparseable synthesis: keep the text rather than failing the request.
        summary = str(final_state.get("final_summary", summary))

    return SubmissionResponse(
        submission_id=request.submission_id,
        assessment_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        decision=decision,
        appetite_review=appetite_review,
        exposure_assessment=exposure_assessment,
        pricing_indication=pricing_indication,
        missing_information=missing_information,
        summary=summary,
        raw_analysis={
            "appetite_screening": final_state.get("appetite_review"),
            "exposure_analysis": final_state.get("exposure_assessment"),
            "pricing_indication": final_state.get("pricing_indication"),
        },
    )
