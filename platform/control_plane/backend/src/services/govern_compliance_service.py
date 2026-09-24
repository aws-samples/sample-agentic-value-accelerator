"""Govern Compliance service — DynamoDB-backed control attestations.

Storage scheme (single-table):
    pk = "COMPLIANCE#<framework_id>"    sk = "<control_id>"  -> attestation
    pk = "EVIDENCE#<framework_id>#<control_id>"  sk = "<evidence_id>" -> evidence

Supports:
- Manual attestation updates (pass/fail/in-progress)
- Evidence attachment (links, S3 URLs)
- Auto-detection from AWS services (guardrails, config rules, etc.)
- Audit trail of changes

Falls back to in-memory storage when DynamoDB table not provisioned.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import BotoCoreError, ClientError

from core.aws_paging import PageResult, paginate_bounded
from models.govern_compliance import (
    AutoDetectionResult,
    CompliancePosture,
    ControlAttestation,
    ControlAttestationUpdate,
    ControlStatus,
    Evidence,
    EvidenceCreate,
    EvidenceType,
    FrameworkSummary,
)

logger = logging.getLogger(__name__)

# How long a DynamoDB failure keeps this service on the in-memory fallback before the next
# request is allowed to re-probe the table.
#
# _table_ok used to be a one-way latch: the FIRST failure of any kind - a throttle, an
# expired credential mid-refresh, a few dropped packets - pinned the whole PROCESS to the
# in-memory dict for the rest of its life. Every attestation written after that answered 200
# and then vanished on the next restart, which is the same silent data loss the region fix
# in this file addressed, just triggered by a blip instead of a config error. Re-probing
# bounds a transient failure to this window instead of forever.
#
# The tradeoff is why this is 60s rather than 0. The probe is a DescribeTable call, so a
# HARD condition - table genuinely absent, IAM denied - would otherwise cost one control
# plane API call per request, forever. DescribeTable is throttled on a low account-wide
# limit shared with every other table, so hammering it during a real outage makes the outage
# worse for unrelated callers. 60s is short enough that a blip self-heals inside a single
# page refresh cycle, and long enough that a permanent misconfiguration costs ~1 call/minute
# instead of ~1 call/request.
_TABLE_RECHECK_COOLOFF_SECONDS = 60.0

# Per-request page sizes for auto-detection reads, each the API's real maximum rather than a
# round number. Verified against the botocore 1.43.10 service models.
_IAM_POLICY_PAGE = 1000       # iam:ListPolicies MaxItems max
_SECRETS_PAGE = 100           # secretsmanager:ListSecrets MaxResults max
_ALARM_PAGE = 100             # cloudwatch:DescribeAlarms MaxRecords max
_GUARDRAIL_PAGE = 1000        # bedrock:ListGuardrails maxResults max
_AGENT_PAGE = 1000            # bedrock-agent:ListAgents maxResults max
# config:DescribeConfigRules and apigateway:GetRestApis are deliberately absent. Neither
# declares a max in the service model, and this file must not be the place that guesses one -
# an over-max value is not rejected by botocore (its range_check() validates a parameter's
# min and never its max), so a guess would either be silently clamped or raise at runtime.
# Both are paged to completion at the service's own default page size instead, which makes
# the count exact without asserting a limit nobody here verified.

# Bound on any single auto-detection walk. Evidence counts are one line of text on a
# dashboard; none of them justifies an unbounded walk of a large account, and hitting the
# bound is disclosed by _count_phrase rather than swallowed.
_DETECT_MAX_ITEMS = 2000
_DETECT_BUDGET_S = 10.0


def _count_phrase(read: PageResult, noun: str) -> str:
    """Render a count for a user-visible evidence string, hedging only when it is a floor.

    "at least 2000 custom IAM policies" and "2000 custom IAM policies" are different claims,
    and the hedge belongs in the same string as the number rather than in a separate field
    the renderer may drop.

    When the walk was complete, no hedge is added. That is the load-bearing half: a caveat
    on an exact count is unfalsifiable, because a reader cannot tell a reflexive caveat from
    a real one, and it teaches them to ignore both.
    """
    if read.complete:
        return f"{len(read.items)} {noun}"
    return f"at least {len(read.items)} {noun}"


def _utc_naive(value: datetime) -> datetime:
    """Drop tzinfo so two attestation timestamps are always comparable.

    Every writer in this service stamps datetime.utcnow(), i.e. naive UTC, and DynamoDB
    round-trips that as a naive ISO string. But /bulk-update takes free-form dicts and the
    table is writable by other tooling, so one offset-aware row is enough to make a naive vs
    aware comparison raise TypeError - which, inside list_attestations, would 500 /posture
    rather than degrade. Treating both as UTC is correct given the utcnow() convention.
    """
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ControlStatus):
        return value.value
    if isinstance(value, EvidenceType):
        return value.value
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernComplianceService:
    """Service for managing compliance attestations."""

    # In-memory fallback when DynamoDB not available
    _mem_attestations: Dict[str, ControlAttestation] = {}
    _mem_evidence: Dict[str, List[Evidence]] = {}
    # None = never probed, True = reachable, False = degraded since _table_failed_at.
    _table_ok: Optional[bool] = None
    # Monotonic timestamp of the failure that set _table_ok False; None whenever _table_ok is
    # not False. time.monotonic() and not datetime.utcnow() deliberately: a wall-clock step
    # (NTP correction, container clock skew) could otherwise place the failure in the future
    # and make the cool-off never expire, which would silently restore the permanent latch
    # this timestamp exists to remove.
    _table_failed_at: Optional[float] = None

    def __init__(self, table_name: str, region: str,
                 govern_region: Optional[str] = None):
        # `region` is REQUIRED, deliberately. It used to default to "us-east-1", which is
        # not where this table lives (us-east-2), and the failure is silent and sticky: one
        # caller omitting the kwarg gets ResourceNotFoundException, latches the CLASS-level
        # _table_ok to False, and every correctly-configured instance in the process then
        # writes attestations to a dict that dies on restart while still answering 200.
        # That is exactly the data-loss bug this file was changed to fix, so there is no
        # default that is safe to guess - callers must resolve it via
        # region_config.table_region("GOVERN_COMPLIANCE").
        self.table_name = table_name
        # `region` is the home of the attestation TABLE only.
        self.region = region
        # `govern_region` is where the GOVERNED resources live (Bedrock guardrails, AgentCore
        # agents, CloudWatch alarms, Config, CloudTrail...) that _apply_auto_detection probes.
        # These are two different regions and must not share one field: the control plane's
        # tables are in AWS_REGION while the governed fleet is in GOVERN_AWS_REGION. Collapsing
        # them pointed all nine auto-detect scanners at the table's region, where the fleet does
        # not exist, and auto-detect quietly dropped from 25 detections to 11 - a false "no
        # evidence found" rather than an error. Same shape as GovernOperationsService.
        self.govern_region = (govern_region or "").strip() or region
        # Guarded because `region` is now configuration-driven. A typo'd
        # GOVERN_COMPLIANCE_TABLE_REGION makes boto3.resource raise InvalidRegionError right
        # here, before _check_table can report the degrade, which 500'd every compliance
        # endpoint on a one-character env-var mistake. Every self.table access in this class
        # sits behind _check_table(), so leaving it None and latching the flag routes those
        # callers to the in-memory fallback and the honest note instead of a stack trace.
        try:
            self._dynamodb = boto3.resource("dynamodb", region_name=region)
            self.table = self._dynamodb.Table(table_name)
        except Exception as e:
            logger.warning(
                "Compliance attestations are NOT being persisted: cannot address DynamoDB "
                "table %r in region %r (%s: %s). Check GOVERN_COMPLIANCE_TABLE_REGION / "
                "CONTROL_PLANE_TABLE_REGION / AWS_REGION. Falling back to in-memory storage "
                "- all attestations and evidence will be LOST on restart.",
                table_name, region, type(e).__name__, e,
            )
            self._dynamodb = None
            self.table = None
            # Starts the cool-off rather than latching permanently. This particular failure
            # (InvalidRegionError from a typo'd env var) is not going to fix itself, but the
            # flag is CLASS-level: latching it forever here also disabled persistence for
            # every correctly-configured sibling instance in the process. This instance stays
            # on the in-memory path unconditionally via the `self.table is None` check in
            # _check_table, so nothing retries in a hot loop on its behalf.
            GovernComplianceService._mark_table_unavailable()

    @classmethod
    def _mark_table_unavailable(cls) -> None:
        """Degrade to in-memory storage for at most _TABLE_RECHECK_COOLOFF_SECONDS."""
        cls._table_ok = False
        cls._table_failed_at = time.monotonic()

    @classmethod
    def _mark_table_available(cls) -> None:
        """Record a successful probe and clear the cool-off."""
        cls._table_ok = True
        cls._table_failed_at = None

    def _pk_attestation(self, framework_id: str) -> str:
        return f"COMPLIANCE#{framework_id}"

    def _pk_evidence(self, framework_id: str, control_id: str) -> str:
        return f"EVIDENCE#{framework_id}#{control_id}"

    def _key(self, framework_id: str, control_id: str) -> str:
        return f"{framework_id}#{control_id}"

    def _check_table(self) -> bool:
        """Check if DynamoDB table is available, re-probing after a cool-off.

        A failure degrades storage TEMPORARILY. See _TABLE_RECHECK_COOLOFF_SECONDS for why
        this is neither a permanent latch nor a probe on every request.
        """
        # Instance-level check first: _table_ok is class-level, so a sibling instance with a
        # valid region could have latched it True while THIS instance failed to build a
        # resource and has table=None. Reading the class flag first would then hand a None
        # back to callers that immediately dereference it.
        if self.table is None:
            return False
        if GovernComplianceService._table_ok is True:
            return True
        if GovernComplianceService._table_ok is False:
            failed_at = GovernComplianceService._table_failed_at
            if (
                failed_at is not None
                and (time.monotonic() - failed_at) < _TABLE_RECHECK_COOLOFF_SECONDS
            ):
                return False
            # Cool-off elapsed - fall through and re-probe. A missing failed_at (older
            # process state, or a False set by something that did not go through
            # _mark_table_unavailable) also falls through: probing once is cheaper than
            # inheriting the permanent latch.
        try:
            self.table.table_status
            if GovernComplianceService._table_failed_at is not None:
                # Log the recovery at WARNING to match the volume of the degrade warning.
                # An operator reading logs needs the END of a persistence outage as loudly as
                # the start, otherwise every degrade looks like it is still in effect and the
                # window in which attestations went to memory cannot be bounded.
                logger.warning(
                    "Compliance attestations are being persisted again: DynamoDB table %r in "
                    "%s is reachable. Attestations written during the outage are still only "
                    "in memory and will be LOST on restart.",
                    self.table_name,
                    self.region,
                )
            GovernComplianceService._mark_table_available()
            return True
        except (BotoCoreError, ClientError) as e:
            # WARNING, not info. This is data loss, not a configuration note: every
            # attestation written until the next successful probe lives in a class-level dict
            # and disappears on the next restart, while the API still answers 200. It was
            # logged at info for long enough that 24 real attestations were reported as
            # persisted and were not.
            # Name the region as well as the table - the failure mode that produced this was
            # a table that existed, in a different region than the one being asked.
            # BotoCoreError is caught alongside ClientError because the region is now
            # configuration-driven: a typo'd GOVERN_COMPLIANCE_TABLE_REGION raises
            # InvalidRegionError and a missing profile raises NoCredentialsError, neither of
            # which is a ClientError. Uncaught, they 500'd every compliance endpoint instead
            # of taking this honest fallback. Only ClientError carries `.response`.
            reason = (
                e.response.get("Error", {}).get("Code", "unknown")
                if isinstance(e, ClientError)
                else type(e).__name__
            )
            logger.warning(
                "Compliance attestations are NOT being persisted: DynamoDB table %r in %s is "
                "unavailable (%s). Falling back to in-memory storage for up to %.0fs - all "
                "attestations and evidence written in that window will be LOST on restart.",
                self.table_name,
                self.region,
                reason,
                _TABLE_RECHECK_COOLOFF_SECONDS,
            )
            GovernComplianceService._mark_table_unavailable()
            return False

    # --- Attestation CRUD ---

    def _merge_memory_attestations(
        self, framework_id: str, rows: List[ControlAttestation]
    ) -> List[ControlAttestation]:
        """Overlay in-memory rows written during a storage outage onto a DynamoDB read.

        Storage can recover mid-process now (see _TABLE_RECHECK_COOLOFF_SECONDS), so both
        stores can hold part of one framework: whatever was written before the outage is in
        DynamoDB, whatever was written during it exists ONLY in the fallback dict. Reading
        DynamoDB alone would report those degrade-window attestations as not assessed, which
        turns a measured result into an unmeasured one - the same silent miss the permanent
        latch caused, moved from restart to recovery. Newer updated_at wins, so a
        post-recovery write is never masked by the stale memory copy it superseded.
        """
        prefix = f"{framework_id}#"
        merged = {r.control_id: r for r in rows}
        for key, mem_row in self._mem_attestations.items():
            if not key.startswith(prefix):
                continue
            stored = merged.get(mem_row.control_id)
            if stored is None or _utc_naive(mem_row.updated_at) > _utc_naive(stored.updated_at):
                merged[mem_row.control_id] = mem_row
        return list(merged.values())

    def get_attestation(self, framework_id: str, control_id: str) -> Optional[ControlAttestation]:
        """Get a single control attestation."""
        key = self._key(framework_id, control_id)

        if not self._check_table():
            return self._mem_attestations.get(key)

        try:
            resp = self.table.get_item(
                Key={"pk": self._pk_attestation(framework_id), "sk": control_id}
            )
            if "Item" not in resp:
                # Fall through to the in-memory shadow instead of returning None: a row
                # written while the table was unreachable lives only there, and .get() still
                # yields None when the control genuinely has no attestation anywhere.
                return self._mem_attestations.get(key)
            item = _from_ddb(resp["Item"])
            return ControlAttestation(**item)
        except ClientError as e:
            logger.error(f"Failed to get attestation: {e}")
            return self._mem_attestations.get(key)

    def list_attestations(self, framework_id: str) -> List[ControlAttestation]:
        """List all attestations for a framework."""
        if not self._check_table():
            return [a for k, a in self._mem_attestations.items() if k.startswith(f"{framework_id}#")]

        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self._pk_attestation(framework_id))
            )
            rows = [ControlAttestation(**_from_ddb(item)) for item in resp.get("Items", [])]
            return self._merge_memory_attestations(framework_id, rows)
        except ClientError as e:
            logger.error(f"Failed to list attestations: {e}")
            return [a for k, a in self._mem_attestations.items() if k.startswith(f"{framework_id}#")]

    def upsert_attestation(
        self,
        framework_id: str,
        control_id: str,
        update: ControlAttestationUpdate,
        updated_by: str = "user",
    ) -> ControlAttestation:
        """Create or update a control attestation."""
        existing = self.get_attestation(framework_id, control_id)

        now = datetime.utcnow()
        if existing:
            data = existing.model_dump()
            for field, value in update.model_dump(exclude_unset=True).items():
                if value is not None:
                    data[field] = value
            data["updated_at"] = now
            data["updated_by"] = updated_by
            if update.status == ControlStatus.PASS and update.reviewed_by:
                data["last_reviewed"] = now
            attestation = ControlAttestation(**data)
        else:
            attestation = ControlAttestation(
                control_id=control_id,
                framework_id=framework_id,
                status=update.status or ControlStatus.NOT_STARTED,
                owner=update.owner,
                notes=update.notes,
                due_date=update.due_date,
                reviewed_by=update.reviewed_by,
                last_reviewed=now if update.status == ControlStatus.PASS else None,
                updated_at=now,
                updated_by=updated_by,
                # Carried explicitly. The `existing` branch above merges every set field
                # generically, but this branch names each one, so omitting these silently
                # dropped provenance on exactly the case auto-detection always hits: a
                # brand-new attestation.
                auto_detected=bool(update.auto_detected),
                auto_detection_source=update.auto_detection_source,
            )

        key = self._key(framework_id, control_id)

        if not self._check_table():
            self._mem_attestations[key] = attestation
            return attestation

        try:
            item = _to_ddb(attestation.model_dump(mode="json"))
            item["pk"] = self._pk_attestation(framework_id)
            item["sk"] = control_id
            self.table.put_item(Item=item)
        except ClientError as e:
            logger.error(f"Failed to upsert attestation: {e}")
            self._mem_attestations[key] = attestation

        return attestation

    def bulk_upsert(
        self,
        attestations: List[Dict],
        updated_by: str = "system",
    ) -> int:
        """Bulk upsert attestations (for auto-detection sync)."""
        count = 0
        for att in attestations:
            update = ControlAttestationUpdate(
                status=ControlStatus(att.get("status", "not-started")),
                owner=att.get("owner"),
                notes=att.get("notes"),
            )
            self.upsert_attestation(
                framework_id=att["framework_id"],
                control_id=att["control_id"],
                update=update,
                updated_by=updated_by,
            )
            count += 1
        return count

    # --- Evidence ---

    def add_evidence(
        self,
        framework_id: str,
        control_id: str,
        evidence: EvidenceCreate,
        uploaded_by: str,
    ) -> Evidence:
        """Add evidence to a control attestation."""
        ev = Evidence(
            id=str(uuid.uuid4())[:8],
            type=evidence.type,
            name=evidence.name,
            description=evidence.description,
            url=evidence.url,
            uploaded_at=datetime.utcnow(),
            uploaded_by=uploaded_by,
        )

        key = self._key(framework_id, control_id)

        if not self._check_table():
            if key not in self._mem_evidence:
                self._mem_evidence[key] = []
            self._mem_evidence[key].append(ev)
            # Also update the attestation's evidence list
            att = self._mem_attestations.get(key)
            if att:
                att.evidence.append(ev)
            return ev

        try:
            item = _to_ddb(ev.model_dump(mode="json"))
            item["pk"] = self._pk_evidence(framework_id, control_id)
            item["sk"] = ev.id
            self.table.put_item(Item=item)

            # Update attestation's evidence list
            self.table.update_item(
                Key={"pk": self._pk_attestation(framework_id), "sk": control_id},
                UpdateExpression="SET evidence = list_append(if_not_exists(evidence, :empty), :ev)",
                ExpressionAttributeValues={
                    ":ev": [_to_ddb(ev.model_dump(mode="json"))],
                    ":empty": [],
                },
            )
        except ClientError as e:
            logger.error(f"Failed to add evidence: {e}")
            if key not in self._mem_evidence:
                self._mem_evidence[key] = []
            self._mem_evidence[key].append(ev)

        return ev

    def list_evidence(self, framework_id: str, control_id: str) -> List[Evidence]:
        """List all evidence for a control."""
        key = self._key(framework_id, control_id)

        if not self._check_table():
            return self._mem_evidence.get(key, [])

        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self._pk_evidence(framework_id, control_id))
            )
            rows = [Evidence(**_from_ddb(item)) for item in resp.get("Items", [])]
            # Same recovery case as _merge_memory_attestations: evidence uploaded while the
            # table was unreachable is only in the fallback dict, and an evidence item that
            # stops being listed reads as "this control has no proof".
            stored_ids = {r.id for r in rows}
            rows.extend(
                ev for ev in self._mem_evidence.get(key, []) if ev.id not in stored_ids
            )
            return rows
        except ClientError as e:
            logger.error(f"Failed to list evidence: {e}")
            return self._mem_evidence.get(key, [])

    # --- Framework Summary ---

    def get_framework_summary(self, framework_id: str, framework_name: str, total_controls: int) -> FrameworkSummary:
        """Compute summary stats for a framework."""
        attestations = self.list_attestations(framework_id)

        pass_count = sum(1 for a in attestations if a.status == ControlStatus.PASS)
        in_progress_count = sum(1 for a in attestations if a.status == ControlStatus.IN_PROGRESS)
        fail_count = sum(1 for a in attestations if a.status == ControlStatus.FAIL)
        # `assessed_count` is the denominator of coverage_pct, and it is NOT total_controls.
        # It used to be a local named `applicable`, computed as
        # (total_controls - not_started_count) and never returned, which is how "100%
        # coverage" could be reported off 2 of 16 controls with no way for a caller to see
        # the denominator. Return it.
        #
        # Counted DIRECTLY here rather than derived by subtracting from total_controls.
        # total_controls comes from FRAMEWORK_META, which the route itself documents as
        # informational while the frontend is authoritative, and the frontend PUTs
        # attestations by its own control ids (the route gates on framework_id, never on
        # control_id). So more controls can be attested than the metadata counts - e.g.
        # nist-ai-rmf is declared as 15 here against 19 in the frontend's list. The
        # subtraction then went negative and a clamp on it capped the DENOMINATOR while
        # leaving pass_count alone, so coverage_pct could report 126.7%. Counting the
        # assessed statuses directly makes pass_count <= assessed_count structurally true,
        # so coverage_pct cannot exceed 100% by construction rather than by clamping.
        assessed_count = pass_count + in_progress_count + fail_count

        # The estate is at least as large as what has been attested against it. Without
        # this, assessed_pct had the same overflow as coverage_pct.
        effective_total = max(total_controls, len(attestations))
        not_started_count = effective_total - assessed_count

        coverage_pct = (pass_count / assessed_count * 100) if assessed_count > 0 else 0.0
        assessed_pct = (assessed_count / effective_total * 100) if effective_total > 0 else 0.0

        last_updated = max((a.updated_at for a in attestations), default=None)

        return FrameworkSummary(
            framework_id=framework_id,
            framework_name=framework_name,
            # effective_total, not the raw metadata count, so the response is internally
            # consistent: a caller must never see assessed_count > total_controls.
            total_controls=effective_total,
            pass_count=pass_count,
            in_progress_count=in_progress_count,
            fail_count=fail_count,
            not_started_count=not_started_count,
            coverage_pct=round(coverage_pct, 1),
            assessed_count=assessed_count,
            assessed_pct=round(assessed_pct, 1),
            last_updated=last_updated,
        )

    def get_compliance_posture(self, frameworks: List[Dict[str, any]]) -> CompliancePosture:
        """Compute overall compliance posture across frameworks."""
        summaries = []
        for fw in frameworks:
            summary = self.get_framework_summary(
                framework_id=fw["id"],
                framework_name=fw["name"],
                total_controls=fw["total_controls"],
            )
            summaries.append(summary)

        total_controls = sum(s.total_controls for s in summaries)
        total_pass = sum(s.pass_count for s in summaries)
        total_gaps = sum(s.fail_count for s in summaries)

        # Count auto-detected
        auto_count = 0
        for fw in frameworks:
            for att in self.list_attestations(fw["id"]):
                if att.auto_detected:
                    auto_count += 1

        # Derive from the summaries' own clamped assessed_count so there is exactly one
        # definition of "assessed" in the response, rather than recomputing the
        # total_controls - not_started_count expression a second time here.
        total_assessed = sum(s.assessed_count for s in summaries)
        overall_pct = (total_pass / total_assessed * 100) if total_assessed > 0 else 0.0
        overall_assessed_pct = (total_assessed / total_controls * 100) if total_controls > 0 else 0.0

        return CompliancePosture(
            frameworks=summaries,
            overall_coverage_pct=round(overall_pct, 1),
            total_controls=total_controls,
            total_pass=total_pass,
            total_gaps=total_gaps,
            total_assessed=total_assessed,
            total_not_assessed=max(0, total_controls - total_assessed),
            overall_assessed_pct=round(overall_assessed_pct, 1),
            auto_detected_count=auto_count,
            last_sync=datetime.utcnow(),
        )

    # --- Auto-detection ---
    #
    # CONTROL ID CONTRACT: every control_id below must be the `id` of a control in
    # COMPLIANCE_CENTER_FRAMEWORKS (frontend/src/components/govern/mockData.ts), because
    # useComplianceAttestations.ts merges by exactly that key - `attestations.get(fw.id +
    # ctrl.id)`. A spelling this file invents is not a display bug, it is a silent
    # correctness bug in the opposite direction from the usual one: the miss is
    # indistinguishable from "not assessed", so the control keeps its SEEDED status while the
    # page has already flipped to LIVE because other attestations did arrive. A seeded pass
    # then renders under a Live badge.
    #
    # Measured 2026-09-14, before this fix: 10 of 24 stored attestations used an id present
    # nowhere in that checklist - all 3 nist-ai-rmf rows (this file emitted the frontend's
    # `section` value, "GOVERN 1.6", where its `id` is "NIST-GV-1.6") and 7 of 11 finos-air
    # rows (AIR-D-### / AIR-P-###, prefixes that do not exist in the FINOS taxonomy at all;
    # the real families are AIR-OP/SEC/RC for risks and AIR-PREV/AIR-DET for mitigations).
    # The frontend's 46 FINOS entries are the complete published set - 23 risks (11 OP + 9
    # SEC + 3 RC) and 23 mitigations (15 PREV + 8 DET) - so any FINOS id outside those 46 is
    # necessarily wrong, not merely unlisted. Re-keyed by MEANING against each frontend
    # control's label, and cross-checked against the `autoDetectSource` that frontend already
    # declares for it, so each assertion below is one the checklist itself expects from this
    # exact AWS source.
    #
    # owasp-llm-top10 (LLM01-1 ...) and sr26-2 (GOV-1, USE-2) were verified to match already.
    #
    # Auto-detection here is EXISTENCE probing, not efficacy testing: "a CloudTrail trail
    # exists" is what marks a logging control pass. That weakness is disclosed via
    # auto_detected / auto_detection_source on every row and is out of scope for the re-key.

    # EVIDENCE COUNT CONTRACT: every `details` string below is user-visible - it is returned
    # verbatim by POST /govern/compliance/auto-detect and stored on the attestation row - so a
    # number in it is read as a measurement.
    #
    # Every one of these reads was a single capped page. `list_policies(MaxItems=10)` reported
    # "10 custom IAM policies defined" for any account with 10 or more, and the same shape
    # applied to Secrets Manager (MaxResults=10), CloudWatch alarms (MaxRecords=10), and API
    # Gateway (limit=10), while the Bedrock guardrails / Config rules / Bedrock agents reads
    # took whatever the service's DEFAULT page size happened to be and called it a total.
    #
    # The PASS/FAIL verdicts were never wrong and are unchanged: `if items:` is a correct
    # existence test even from a capped page, since the first page proves existence whether or
    # not more pages exist. Only the evidence numbers were wrong, so only they change here -
    # and where a bound is still hit, `_count_phrase` says "at least N" rather than implying a
    # total.

    async def run_auto_detection(self) -> List[AutoDetectionResult]:
        """Run auto-detection from AWS services and update attestations."""
        results: List[AutoDetectionResult] = []

        # 1. Check Bedrock Guardrails
        try:
            bedrock = boto3.client("bedrock", region_name=self.govern_region)
            gr_read = paginate_bounded(
                bedrock, "list_guardrails", "guardrails",
                page_size=_GUARDRAIL_PAGE,
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            guardrails = gr_read.items
            if guardrails:
                # Guardrails exist -> mark related controls as pass
                for control in [
                    # "Prompt injection (direct and indirect) mitigated"
                    ("finos-air", "AIR-SEC-010"),
                    # was AIR-P-001 "input validation" -> "User/App/Model firewalling and
                    # filtering", whose seeded evidence is literally "Input guardrails".
                    ("finos-air", "AIR-PREV-003"),
                    # was AIR-P-002 "output filtering" -> "AI firewall implementation and
                    # management", seeded evidence "Guardrails firewall config". A configured
                    # guardrail IS the AI firewall doing the output content filtering, so this
                    # is a tighter evidence-to-claim link than the id it replaces; the
                    # alternative reading, AIR-OP-020 "reputational risk controls in place",
                    # needs an extra inference from content filters to reputational risk.
                    ("finos-air", "AIR-PREV-017"),
                    ("owasp-llm-top10", "LLM01-1"),
                    ("owasp-llm-top10", "LLM02-1"),
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="bedrock-guardrails",
                        confidence=0.9,
                        details=f"{_count_phrase(gr_read, 'guardrails')} configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Guardrails auto-detection failed: {e}")

        # 2. Check CloudTrail
        try:
            cloudtrail = boto3.client("cloudtrail", region_name=self.govern_region)
            # Deliberately NOT paged. cloudtrail:DescribeTrails takes no MaxResults and its
            # response shape carries no token at all (verified on botocore 1.43.10: output is
            # `trailList` alone), so one call returns every trail. This count was never capped
            # and needs no "at least" hedge.
            trails = cloudtrail.describe_trails().get("trailList", [])
            if trails:
                for control in [
                    # was AIR-D-001 "audit logging" -> "AI data leakage prevention and
                    # detection". Not a string mangle of AIR-D-001 into AIR-DET-001: this is
                    # the one frontend FINOS control that declares autoDetectSource
                    # 'cloudtrail', with seeded evidence "DLP + CloudTrail", so the checklist
                    # itself treats an active trail as this control's evidence. The trail is
                    # the audit record that makes AI data exfiltration detectable, which is
                    # what the old comment was reaching for.
                    ("finos-air", "AIR-DET-001"),
                    # MANAGE 3.1 -> the frontend carries that string on `section`; the join key
                    # is `id`.
                    ("nist-ai-rmf", "NIST-MG-3.1"),
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="cloudtrail",
                        confidence=0.95,
                        details=f"{len(trails)} CloudTrail trails active",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"CloudTrail auto-detection failed: {e}")

        # 3. Check AWS Config rules
        try:
            config = boto3.client("config", region_name=self.govern_region)
            # No page_size: DescribeConfigRules declares no maximum in the service model, so
            # botocore would raise PaginationError for a PageSize it has no limit key for.
            # Paged to completion at the service default instead, which is what makes the
            # count exact.
            rules_read = paginate_bounded(
                config, "describe_config_rules", "ConfigRules",
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            rules = rules_read.items
            if rules:
                # UNMAPPED, deliberately, and the only id in this file that is not a real
                # FINOS control. "N Config rules active" evidences continuous configuration
                # compliance monitoring, and none of the 46 published FINOS AIR controls means
                # that - the frontend annotates config-rules as an auto-detect source only on
                # NIST-MS-2.7, NIST-MG-3.1 and EU AI Act Art.15, never on a FINOS control.
                # Since the frontend carries the complete FINOS set, there is no correct FINOS
                # id to move this to, so inventing one (AIR-DET-002 does not appear in the
                # taxonomy anywhere in this repo) would be fabricating a control to host a
                # measurement.
                #
                # Left as-is rather than silently re-pointed: attaching it to EU AI Act Art.15
                # would render, but marking an EU AI Act article PASS because some Config rules
                # exist is a materially stronger claim than any other probe here makes. The row
                # therefore stays measured-but-not-displayable pending a decision on whether
                # this scanner should assert a FINOS control at all.
                #
                # It no longer collides, which it did until this change: the CloudWatch scanner
                # in step 5 also wrote sk="AIR-D-002" (as "anomaly detection"), so the second
                # write overwrote this one inside a single auto-detect run. Verified live on
                # 2026-09-14 - the stored AIR-D-002 row carried auto_detection_source
                # "cloudwatch", so the aws-config result was already being lost before it ever
                # reached the id-mismatch drop. That half is fixed: CloudWatch now writes
                # AIR-DET-009.
                result = AutoDetectionResult(
                    control_id="AIR-D-002",
                    framework_id="finos-air",
                    detected_status=ControlStatus.PASS,
                    source="aws-config",
                    confidence=0.85,
                    details=f"{_count_phrase(rules_read, 'Config rules')} active",
                )
                results.append(result)
                self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Config auto-detection failed: {e}")

        # 4. Check Bedrock Agents (inventory)
        try:
            bedrock_agent = boto3.client("bedrock-agent", region_name=self.govern_region)
            agents_read = paginate_bounded(
                bedrock_agent, "list_agents", "agentSummaries",
                page_size=_AGENT_PAGE,
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            agents = agents_read.items
            if agents:
                for control in [
                    # GOVERN 1.6 "AI system inventory" -> the frontend's id for it. Confirmed
                    # by matching on `section`: NIST-GV-1.6 carries section 'GOVERN 1.6' and
                    # declares autoDetectSource 'bedrock-agents', the source used here.
                    ("nist-ai-rmf", "NIST-GV-1.6"),
                    ("sr26-2", "GOV-1"),
                    ("finos-air", "AIR-OP-005"),  # Foundation model versioning
                    ("owasp-llm-top10", "LLM03-1"),  # Model provenance
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="bedrock-agents",
                        confidence=0.8,
                        details=f"{_count_phrase(agents_read, 'agents')} in registry",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Bedrock Agents auto-detection failed: {e}")

        # 5. Check CloudWatch for monitoring (performance metrics)
        try:
            cloudwatch = boto3.client("cloudwatch", region_name=self.govern_region)
            alarms_read = paginate_bounded(
                cloudwatch, "describe_alarms", "MetricAlarms",
                page_size=_ALARM_PAGE,
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            alarms = alarms_read.items
            if alarms:
                for control in [
                    # MEASURE 1.1 "performance metrics" -> NIST-MS-1.1, section 'MEASURE 1.1',
                    # autoDetectSource 'cloudwatch'.
                    ("nist-ai-rmf", "NIST-MS-1.1"),
                    ("sr26-2", "USE-2"),  # Performance monitoring
                    ("finos-air", "AIR-OP-014"),  # Alignment drift
                    ("finos-air", "AIR-OP-019"),  # Data quality monitoring
                    # was AIR-D-002 "anomaly detection" -> "AI system alerting and Denial of
                    # Wallet (DoW) spend monitoring", seeded evidence "Cost anomaly alerts".
                    # Configured alarms are what that control is made of.
                    ("finos-air", "AIR-DET-009"),
                    # was AIR-D-003 "model monitoring" -> "AI system observability", seeded
                    # evidence "Langfuse + CloudWatch".
                    ("finos-air", "AIR-DET-004"),
                    # These four are exactly the FINOS controls the frontend annotates with
                    # autoDetectSource 'cloudwatch' - no more, no fewer - so this scanner now
                    # asserts the full set the checklist expects from CloudWatch and nothing it
                    # does not.
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="cloudwatch",
                        confidence=0.85,
                        details=f"{_count_phrase(alarms_read, 'CloudWatch alarms')} configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"CloudWatch auto-detection failed: {e}")

        # 6. Check Cost Explorer / Budgets (cost controls)
        try:
            ce = boto3.client("ce", region_name=self.govern_region)
            # Just checking if API is accessible is enough
            ce.get_cost_and_usage(
                TimePeriod={"Start": "2026-07-01", "End": "2026-07-20"},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )
            for control in [
                ("owasp-llm-top10", "LLM10-2"),  # Cost quotas
            ]:
                result = AutoDetectionResult(
                    control_id=control[1],
                    framework_id=control[0],
                    detected_status=ControlStatus.PASS,
                    source="cost-explorer",
                    confidence=0.75,
                    details="Cost Explorer accessible for budget monitoring",
                )
                results.append(result)
                self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Cost Explorer auto-detection failed: {e}")

        # 7. Check IAM for least privilege (access controls)
        try:
            iam = boto3.client("iam", region_name=self.govern_region)
            policies_read = paginate_bounded(
                iam, "list_policies", "Policies",
                page_size=_IAM_POLICY_PAGE,
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
                Scope="Local",
            )
            policies = policies_read.items
            if policies:
                for control in [
                    # was AIR-P-003 "access control" -> "Role-based access control for AI
                    # data", seeded evidence "IAM + Cedar policies". The only frontend FINOS
                    # control declaring autoDetectSource 'iam'.
                    ("finos-air", "AIR-PREV-012"),
                    ("owasp-llm-top10", "LLM08-1"),  # KB access controls
                    ("owasp-llm-top10", "LLM06-1"),  # Least privilege
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="iam",
                        confidence=0.7,
                        details=f"{_count_phrase(policies_read, 'custom IAM policies')} defined",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"IAM auto-detection failed: {e}")

        # 8. Check Secrets Manager (no secrets in prompts)
        try:
            secretsmanager = boto3.client("secretsmanager", region_name=self.govern_region)
            secrets_read = paginate_bounded(
                secretsmanager, "list_secrets", "SecretList",
                page_size=_SECRETS_PAGE,
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            secrets = secrets_read.items
            if secrets:
                for control in [
                    ("owasp-llm-top10", "LLM07-1"),  # No secrets in prompts
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="secrets-manager",
                        confidence=0.8,
                        details=f"Secrets Manager in use ({_count_phrase(secrets_read, 'secrets')})",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Secrets Manager auto-detection failed: {e}")

        # 9. Check API Gateway (rate limiting)
        try:
            apigateway = boto3.client("apigateway", region_name=self.govern_region)
            # No page_size, for the same reason as DescribeConfigRules: GetRestApis declares
            # no maximum for `limit` in the service model, and guessing one is exactly the
            # move that started this bug class.
            apis_read = paginate_bounded(
                apigateway, "get_rest_apis", "items",
                max_items=_DETECT_MAX_ITEMS, budget_s=_DETECT_BUDGET_S,
            )
            apis = apis_read.items
            if apis:
                for control in [
                    ("owasp-llm-top10", "LLM10-1"),  # Rate limiting
                    # was AIR-P-005 "rate limiting" -> "Quality of Service (QoS) and DDoS
                    # prevention", seeded evidence "Rate limits + WAF". The frontend declares no
                    # autoDetectSource on it, so this one is matched on label alone; API Gateway
                    # stages are where the platform's request throttling actually lives.
                    ("finos-air", "AIR-PREV-008"),
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="api-gateway",
                        confidence=0.75,
                        details=f"{_count_phrase(apis_read, 'API Gateway APIs')} configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"API Gateway auto-detection failed: {e}")

        return results

    def _apply_auto_detection(self, result: AutoDetectionResult):
        """Apply an auto-detection result to update attestation."""
        existing = self.get_attestation(result.framework_id, result.control_id)

        # Don't override manual attestations
        if existing and not existing.auto_detected and existing.status != ControlStatus.NOT_STARTED:
            return

        # The provenance flags travel WITH the update so the one write in
        # upsert_attestation persists them. They used to be stamped onto
        # _mem_attestations[key] after the write returned, which is a no-op whenever the
        # DynamoDB write succeeded and the key was therefore never in that dict. Two
        # consequences, both fixed here: posture under-reported auto_detected_count as 0,
        # and the guard above read auto_detected=False back from the store, so a control
        # this scanner had itself set to PASS looked like a MANUAL attestation and was
        # skipped forever after - auto-detection could not update its own prior results.
        update = ControlAttestationUpdate(
            status=result.detected_status,
            notes=f"Auto-detected from {result.source}: {result.details}",
            auto_detected=True,
            auto_detection_source=result.source,
        )

        self.upsert_attestation(
            framework_id=result.framework_id,
            control_id=result.control_id,
            update=update,
            updated_by="auto-detection",
        )
