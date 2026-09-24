"""Govern Validation Panel service — DynamoDB-backed CRUD for adversarial validation.

Storage scheme:
    pk = "VALIDATION_PANEL#<id>"  sk = "LATEST"  -> the validation panel

Follows the GovernConformanceService pattern: same DDB serialization helpers,
ephemeral in-memory fallback when table isn't provisioned.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from models.govern_validation_panel import (
    ValidationPanel,
    ValidationPanelCreate,
    ValidationPanelFindingSubmit,
    PersonaFinding,
    calculate_verdict,
)

logger = logging.getLogger(__name__)

# Page bound for the validation-panel scan. Pages are bounded rather than the result being
# bounded by DynamoDB's `Limit`, because `Limit` on a filtered Scan caps rows EXAMINED, not rows
# returned - see list_panels. 20 pages is up to ~20 MB of scanned rows, which is far above any
# realistic panel count and exists only so a pathological table cannot hang the request.
_MAX_SCAN_PAGES = 20


class PanelFinalizedError(Exception):
    """Raised when a write is attempted against an already-finalized panel."""


class UnknownCriterionError(Exception):
    """Raised when a criterion name does not exist on the panel."""



def _to_ddb(value):
    """Convert Python values to DynamoDB-compatible types."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value):
    """Convert DynamoDB types back to Python values."""
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernValidationService:
    """Service for managing adversarial validation panels."""

    PK_PREFIX = "VALIDATION_PANEL#"
    SK_LATEST = "LATEST"

    # Ephemeral in-memory store for local dev without DynamoDB
    _mem: Dict[str, ValidationPanel] = {}

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- DDB shape ---------------------------------------------------------

    def _to_item(self, panel: ValidationPanel) -> dict:
        body = panel.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{panel.panel_id}",
            "sk": self.SK_LATEST,
            "panel_id": panel.panel_id,
            "target_type": panel.target_type.value,
            "target_id": panel.target_id,
            "created_at": body["created_at"],
            "updated_at": body["updated_at"],
            "final_verdict": panel.final_verdict.value if panel.final_verdict else None,
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> ValidationPanel:
        body = _from_ddb(json.loads(item["data"]))
        return ValidationPanel.model_validate(body)

    def _persist(self, panel: ValidationPanel) -> bool:
        """Write to DynamoDB; fall back to the ephemeral in-memory store when the table
        isn't provisioned (local / no DynamoDB backend).

        Returns True when the row reached DynamoDB, False when it only reached memory.

        The fallback itself is intended - local dev without DynamoDB has to work - but it used
        to be completely silent: `except Exception: type(self)._mem[...] = panel` with no log
        and no return value. So `create_panel` returned a fully-formed ValidationPanel with a
        panel_id and the route answered 201 Created for a panel that existed only in this
        process and would vanish on the next restart. A validation panel is an audit artifact;
        "we recorded your adversarial review" is exactly the claim that must not be made
        falsely. Nothing distinguished a durable write from a lost one, at any layer.
        """
        try:
            self.table.put_item(Item=self._to_item(panel))
            return True
        except Exception as e:
            type(self)._mem[panel.panel_id] = panel
            logger.warning(
                "Validation panel %s is NOT being persisted to '%s' (%s: %s) - it is held in "
                "memory only and will be lost when this process restarts.",
                panel.panel_id,
                self.table_name,
                type(e).__name__,
                e,
            )
            return False

    # --- CRUD --------------------------------------------------------------

    def create_panel(
        self,
        req: ValidationPanelCreate,
        created_by: Optional[str] = None
    ) -> ValidationPanel:
        """Create a new validation panel with default VVAH criteria."""
        panel = ValidationPanel(
            target_type=req.target_type,
            target_id=req.target_id,
            target_description=req.target_description,
            created_by=created_by,
        )
        self._persist(panel)
        logger.info(f"Created validation panel {panel.panel_id} for {req.target_type.value}:{req.target_id}")
        return panel

    def get_panel(self, panel_id: str) -> Optional[ValidationPanel]:
        """Get a validation panel by ID.

        The `except Exception: pass` this replaces threw away the one piece of information that
        distinguishes the two ways this returns None: the panel does not exist, or the table
        could not be read. The route turns either into a 404, so an unreachable table reported
        "no such panel" about a panel that is sitting in DynamoDB - and nothing was logged, so
        there was no way to find out afterwards either. The exception is now logged; a caller
        still gets None, because the alternative is a 500 on a path that legitimately falls back
        to memory in local dev.
        """
        try:
            resp = self.table.get_item(Key={
                "pk": f"{self.PK_PREFIX}{panel_id}",
                "sk": self.SK_LATEST,
            })
            item = resp.get("Item")
            if item:
                return self._from_item(item)
        except Exception as e:
            logger.warning(
                "Could not read validation panel %s from '%s' (%s: %s); falling back to the "
                "in-memory store. If the panel is absent there too the caller sees a 404, which "
                "does NOT mean the panel does not exist.",
                panel_id,
                self.table_name,
                type(e).__name__,
                e,
            )
        return type(self)._mem.get(panel_id)

    def list_panels(
        self,
        target_type: Optional[str] = None,
        finalized_only: bool = False,
        limit: int = 100
    ) -> List[ValidationPanel]:
        """List validation panels, optionally filtered by target type.

        `Limit` on a **filtered** Scan is the sharpest form of this branch's central defect.
        On a Query, `Limit` caps rows read from one partition; on a Scan with a FilterExpression
        it caps the rows DynamoDB *examines*, and the filter is applied afterwards. So the old
        `scan(FilterExpression=..., Limit=limit)` could examine `limit` rows, match none of them,
        and return an empty list while any number of panels sat further down the table - and this
        pk-prefixed table holds other item types, so non-panel rows consume the allowance. Zero
        panels is also the reassuring reading ("nothing awaiting adversarial validation"), and
        `LastEvaluatedKey` was dropped, so nothing recorded that the scan had stopped early.

        This now pages until it has `limit` matching panels or the table is exhausted, so `limit`
        bounds the RESULT rather than the read. Sorting also had to move: `out.sort(...)` then
        `[:limit]` sorted only whatever survived the truncated read, so the "most recent" panels
        were the most recent of an arbitrary subset. It is a full sweep of the panel rows either
        way - the honest bound is on how many are returned, not on how few are looked at.
        """
        try:
            filter_expr = Attr("pk").begins_with(self.PK_PREFIX)
            if target_type:
                filter_expr = filter_expr & Attr("target_type").eq(target_type)
            if finalized_only:
                filter_expr = filter_expr & Attr("final_verdict").exists()

            items: List[dict] = []
            start_key: Optional[dict] = None
            pages = 0
            # A bound so a huge table cannot hang the request. Reached only when the panel rows
            # genuinely exceed what one call should sweep, and logged when it is - unlike the
            # previous silent stop after a single page.
            while pages < _MAX_SCAN_PAGES:
                kwargs: dict = {"FilterExpression": filter_expr}
                if start_key:
                    kwargs["ExclusiveStartKey"] = start_key
                resp = self.table.scan(**kwargs)
                items.extend(resp.get("Items", []))
                pages += 1
                start_key = resp.get("LastEvaluatedKey")
                # Stop as soon as sorting cannot change which `limit` rows win. Because the sort
                # is by updated_at and not by scan order, that means having every matching row,
                # so this only short-circuits on the page bound below.
                if not start_key:
                    break

            if start_key:
                logger.warning(
                    "Validation panel scan of '%s' stopped after %d pages (%d matching rows); "
                    "more panels exist and are omitted from this list.",
                    self.table_name,
                    pages,
                    len(items),
                )

            out = [self._from_item(i) for i in items]
        except Exception as e:
            logger.warning(
                "Could not scan validation panels from '%s' (%s: %s); listing the in-memory "
                "store instead, which holds only panels created since the last restart.",
                self.table_name,
                type(e).__name__,
                e,
            )
            out = list(type(self)._mem.values())
            if target_type:
                out = [p for p in out if p.target_type.value == target_type]
            if finalized_only:
                out = [p for p in out if p.final_verdict is not None]

        out.sort(key=lambda x: x.updated_at, reverse=True)
        return out[:limit]

    def submit_finding(
        self,
        panel_id: str,
        req: ValidationPanelFindingSubmit,
        submitted_by: Optional[str] = None
    ) -> Optional[ValidationPanel]:
        """Submit a persona finding to a validation panel.

        Updates existing finding if persona already submitted, otherwise appends.
        """
        panel = self.get_panel(panel_id)
        if not panel:
            return None

        # Check if panel is already finalized
        if panel.finalized_at:
            logger.warning(f"Attempted to submit finding to finalized panel {panel_id}")
            return panel

        # Create the finding
        finding = PersonaFinding(
            persona=req.persona,
            verdict=req.verdict,
            confidence=req.confidence,
            findings=req.findings,
            recommendations=req.recommendations,
            submitted_by=submitted_by,
        )

        # Update or append
        existing_idx = next(
            (i for i, f in enumerate(panel.persona_findings) if f.persona == req.persona),
            None
        )
        if existing_idx is not None:
            panel.persona_findings[existing_idx] = finding
            logger.info(f"Updated {req.persona.value} finding for panel {panel_id}")
        else:
            panel.persona_findings.append(finding)
            logger.info(f"Added {req.persona.value} finding to panel {panel_id}")

        panel.updated_at = datetime.utcnow()
        self._persist(panel)
        return panel

    def calculate_verdict(
        self,
        panel_id: str,
        finalized_by: Optional[str] = None
    ) -> Optional[ValidationPanel]:
        """Calculate and finalize the verdict for a validation panel.

        Once finalized, no further findings can be submitted.
        """
        panel = self.get_panel(panel_id)
        if not panel:
            return None

        # Don't recalculate if already finalized
        if panel.finalized_at:
            logger.info(f"Panel {panel_id} already finalized")
            return panel

        # Calculate the verdict
        panel = calculate_verdict(panel)
        panel.finalized_at = datetime.utcnow()
        panel.finalized_by = finalized_by

        self._persist(panel)
        logger.info(
            f"Finalized panel {panel_id}: verdict={panel.final_verdict.value if panel.final_verdict else 'none'}, "
            f"score={panel.weighted_score}, critical_gates={panel.critical_gates_passed}"
        )
        return panel

    def delete_panel(self, panel_id: str) -> Optional[ValidationPanel]:
        """Delete a validation panel.

        Raises RuntimeError when the DynamoDB delete fails and the row is still there.

        This was a fake-success destructive operation, and the most misleading method in the
        file. `except Exception: pass` was followed unconditionally by
        `logger.info("Deleted validation panel ...")` and `return existing`, so a failed delete
        produced: a success log, a 200 with the panel body, and a cleared in-memory entry - while
        the DynamoDB row survived untouched. The very next get_panel read it straight back. A
        caller told "deleted" had no way to learn otherwise, and clearing memory made the next
        attempt *less* likely to notice, since the get_panel fallback no longer had a copy.

        Failing loudly is right here specifically because the operation is destructive: an
        unreported failed delete leaves an audit artifact the operator believes is gone. The
        memory entry is popped only after the delete is known to have taken effect, so a retry
        still finds the panel.
        """
        existing = self.get_panel(panel_id)
        if not existing:
            return None
        try:
            self.table.delete_item(Key={
                "pk": f"{self.PK_PREFIX}{panel_id}",
                "sk": self.SK_LATEST,
            })
        except Exception as e:
            # Memory-only panels are the one case where a table failure is not a failed delete:
            # the panel was never in DynamoDB, so there is nothing there to remove.
            if panel_id in type(self)._mem:
                type(self)._mem.pop(panel_id, None)
                logger.info(
                    "Deleted in-memory-only validation panel %s; '%s' was unreachable (%s) but "
                    "held no row for it.",
                    panel_id,
                    self.table_name,
                    type(e).__name__,
                )
                return existing
            logger.error(
                "Failed to delete validation panel %s from '%s' (%s: %s) - the row is still "
                "there. Reporting the failure rather than a success.",
                panel_id,
                self.table_name,
                type(e).__name__,
                e,
            )
            raise RuntimeError(
                f"Could not delete validation panel {panel_id}: {type(e).__name__}: {e}"
            ) from e
        type(self)._mem.pop(panel_id, None)
        logger.info(f"Deleted validation panel {panel_id}")
        return existing

    def update_criterion_score(
        self,
        panel_id: str,
        criterion_name: str,
        score: float,
        rationale: Optional[str] = None
    ) -> Optional[ValidationPanel]:
        """Manually update a criterion score (for fine-tuning before finalization)."""
        panel = self.get_panel(panel_id)
        if not panel:
            return None

        # Raise rather than returning the unchanged panel. Returning it produced an
        # HTTP 200 with a body showing score:null, so a caller that scored a finalized
        # panel got a success response and no score - indistinguishable from success.
        # Observed while verifying this endpoint: four PUTs all returned 200 and every
        # score stayed null.
        if panel.finalized_at:
            raise PanelFinalizedError(
                f"Panel {panel_id} was finalized at {panel.finalized_at.isoformat()}; "
                "criterion scores cannot be changed after finalization."
            )

        # An unknown criterion name was also a silent no-op: the loop simply found no
        # match, the panel was persisted unchanged and 200 returned. A typo in the
        # criterion name looked exactly like a successful score.
        target = next((c for c in panel.criteria if c.name == criterion_name), None)
        if target is None:
            raise UnknownCriterionError(
                f"Panel {panel_id} has no criterion named '{criterion_name}'. "
                f"Valid names: {', '.join(c.name for c in panel.criteria)}"
            )
        target.score = score
        if rationale:
            target.rationale = rationale

        panel.updated_at = datetime.utcnow()
        self._persist(panel)
        return panel
