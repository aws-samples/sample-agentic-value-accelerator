"""Compliance Deadline Monitor Orchestrator (Strands Implementation)."""

import uuid
from datetime import datetime, date
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import DeadlineTracker, RiskAssessor
from .agents.deadline_tracker import track_deadlines
from .agents.risk_assessor import assess_risk
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    MonitorRequest, MonitorResponse, DeadlineItem,
    FilingType, UrgencyLevel,
)


class ComplianceDeadlineMonitorOrchestrator(StrandsOrchestrator):
    name = "compliance_deadline_monitor_orchestrator"
    system_prompt = """You are a Chief Compliance Officer's automated deadline monitoring assistant.

Your role is to:
1. Coordinate specialist agents (Deadline Tracker, Risk Assessor)
2. Synthesize their findings into an actionable daily compliance briefing
3. Ensure no regulatory filing deadline is missed

When creating the final summary, provide:
- Total deadlines tracked and how many are at risk
- Priority-ordered list of items requiring attention
- Specific escalation recommendations
- Overall compliance posture (green/yellow/red)

Be concise and action-oriented. This briefing will be read by the CCO every morning."""

    def __init__(self):
        super().__init__(agents={
            "deadline_tracker": DeadlineTracker(),
            "risk_assessor": RiskAssessor(),
        })

    async def arun_assessment(self, as_of_date: str | None = None, context: str | None = None) -> Dict[str, Any]:
        import asyncio
        check_date = as_of_date or date.today().isoformat()

        tracker_result, risk_result = await asyncio.gather(
            track_deadlines(check_date, context),
            assess_risk(check_date, context),
        )

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(tracker_result, risk_result)))
        return {"as_of_date": check_date, "tracker_result": tracker_result, "risk_result": risk_result, "final_summary": summary}

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None:
                        agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None:
                agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured fields"},
            domain_context=self.system_prompt)


async def run_compliance_deadline_monitor(request):
    """Run the compliance deadline monitoring workflow."""
    orchestrator = ComplianceDeadlineMonitorOrchestrator()
    final_state = await orchestrator.arun_assessment(
        as_of_date=request.as_of_date,
    )

    deadlines = []
    escalations = []
    summary = "Monitoring run completed"

    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)
        escalations = structured.get("escalations", [])

        for item in structured.get("deadlines", []):
            deadlines.append(DeadlineItem(
                filing_type=FilingType(item.get("filing_type", "sar")),
                entity=item.get("entity", "Unknown"),
                due_date=item.get("due_date", ""),
                days_remaining=item.get("days_remaining", 0),
                urgency=UrgencyLevel(item.get("urgency", "on_track")),
                status=item.get("status", "unknown"),
                recommended_action=item.get("recommended_action", "Review"),
            ))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    at_risk = len([d for d in deadlines if d.urgency in (UrgencyLevel.OVERDUE, UrgencyLevel.CRITICAL, UrgencyLevel.WARNING)])

    return MonitorResponse(
        monitor_id=str(uuid.uuid4()),
        as_of_date=final_state["as_of_date"],
        timestamp=datetime.utcnow(),
        total_deadlines=len(deadlines),
        at_risk=at_risk,
        deadlines=deadlines,
        escalations=escalations,
        summary=summary,
        raw_analysis={
            "deadline_tracker": final_state.get("tracker_result"),
            "risk_assessor": final_state.get("risk_result"),
        },
    )
