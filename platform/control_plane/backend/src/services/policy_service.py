"""Policy service using real AgentCore Policy Engine API (bedrock-agentcore-control)"""

import boto3
import logging
import re
import time
import uuid
from typing import Dict, List, Optional
from datetime import datetime

from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from models.policy import (
    Policy,
    PolicyCreate,
    PolicyUpdate,
    PolicyStatus,
    PolicyPreset,
    PolicyRule,
    PolicyAuditEvent,
    PolicyMetrics,
    StatusHistoryEntry,
    RuleType,
    RuleAction,
    RuleCategory,
    ResourceType,
    AuditActionTaken,
)

logger = logging.getLogger(__name__)

# How long a DynamoDB failure keeps metadata/audit reads on the degraded path before the
# next caller is allowed to re-probe. Matches GovernOperationsService and
# GovernComplianceService: 60s is short enough that a throttle or a credential refresh
# self-heals inside one page refresh, and long enough that a genuinely absent table costs
# ~1 failed call per minute instead of one per request.
_TABLE_RETRY_COOLDOWN_SECONDS = 60

# Page cap for the metadata/audit table sweeps. A DynamoDB scan returns at most 1 MB per
# call, so a single un-paginated scan silently truncates - it returns a partial result that
# is indistinguishable from a complete one, with no exception and no LastEvaluatedKey check.
# Bounded rather than `while True`: an unbounded sweep over a table that grows without limit
# turns one API request into an open-ended number of DynamoDB calls. When the cap is hit the
# sweep says so (see _metadata_truncated / _audit_truncated) instead of quietly capping,
# because a bounded sweep that does not disclose its bound is the same lie as no bound.
_SCAN_MAX_PAGES = 20


class PolicyConflictError(Exception):
    """Raised when a policy with the same name already exists in the engine."""
    pass


class PolicyValidationError(Exception):
    """Raised when AgentCore rejects the Cedar statement as invalid."""
    pass


# --- Cedar Policy Generation ---

def _rule_to_cedar_condition(rule: PolicyRule, gateway_arn: str) -> str:
    """Convert a PolicyRule into a Cedar condition clause."""
    if rule.type == RuleType.DENY:
        if rule.value:
            # Deny by matching value (e.g., model_id like "*opus*")
            return f'context has {rule.target} && context.{rule.target} like "*{rule.value}*"'
        else:
            # Deny by tool name (e.g., tool_name == "bash_executor")
            return f'context has tool_name && context.tool_name == "{rule.target}"'
    elif rule.type == RuleType.REQUIRE:
        # Require a context attribute to be present and true
        return f'!(context has {rule.target}) || context.{rule.target} == false'
    else:
        return f'context has {rule.target}'


def rules_to_cedar(rules: List[PolicyRule], gateway_arn: str) -> str:
    """Convert a list of PolicyRules into a single Cedar policy statement."""
    # Group rules by action type
    forbid_conditions = []
    for rule in rules:
        if rule.action == RuleAction.ENFORCE:
            condition = _rule_to_cedar_condition(rule, gateway_arn)
            forbid_conditions.append(condition)

    if not forbid_conditions:
        # If only LOG rules, create a permit-all (logging is handled by gateway config)
        return 'permit(principal, action, resource is AgentCore::Gateway);'

    # Combine all conditions with OR into a single forbid statement
    combined = ' || '.join(f'({c})' for c in forbid_conditions)
    return f'forbid(principal, action, resource is AgentCore::Gateway) when {{ {combined} }};'


def _sanitize_cedar_name(name: str, unique: bool = False) -> str:
    """Convert a policy name to a valid Cedar policy name (A-Za-z0-9_).

    When unique=True, append a short random suffix so repeated display names
    don't collide on AgentCore's per-engine unique-name constraint.
    """
    sanitized = re.sub(r'[^A-Za-z0-9_]', '_', name)
    # Must start with a letter
    if sanitized and not sanitized[0].isalpha():
        sanitized = 'P_' + sanitized
    if unique:
        suffix = '_' + uuid.uuid4().hex[:8]
        return sanitized[:48 - len(suffix)] + suffix
    return sanitized[:48]  # Max 48 chars


# --- FSI Policy Presets ---

FSI_POLICY_PRESETS: List[PolicyPreset] = [
    PolicyPreset(
        id="restricted-ops",
        name="Restricted Operations",
        description="Prevent agents from executing destructive tools — deny bash execution and file writes on the gateway.",
        tags=["security", "production"],
        resource_type=ResourceType.GATEWAY,
        config=PolicyCreate(
            name="Restricted Operations",
            description="Deny bash execution and file write tools",
            resource_type=ResourceType.GATEWAY,
            rules=[
                PolicyRule(id="1", type=RuleType.DENY, category=RuleCategory.TOOLS, target="bash_executor", condition="always", value="", action=RuleAction.ENFORCE),
                PolicyRule(id="2", type=RuleType.DENY, category=RuleCategory.TOOLS, target="file_write", condition="always", value="", action=RuleAction.ENFORCE),
            ],
        ),
    ),
    PolicyPreset(
        id="model-restriction",
        name="Model Restriction",
        description="Deny access to high-cost model tiers and require guardrails on all gateway requests.",
        tags=["cost", "compliance"],
        resource_type=ResourceType.GATEWAY,
        config=PolicyCreate(
            name="Model Restriction",
            description="Deny Opus model tier, require guardrail attached",
            resource_type=ResourceType.GATEWAY,
            rules=[
                PolicyRule(id="1", type=RuleType.DENY, category=RuleCategory.MODELS, target="model_id", condition="equals", value="opus", action=RuleAction.ENFORCE),
                PolicyRule(id="2", type=RuleType.REQUIRE, category=RuleCategory.COMPLIANCE, target="guardrail_attached", condition="always", value="", action=RuleAction.ENFORCE),
            ],
        ),
    ),
    PolicyPreset(
        id="guardrail-required",
        name="Require Guardrail",
        description="Deny all gateway requests that do not have a Bedrock Guardrail attached.",
        tags=["compliance", "safety"],
        resource_type=ResourceType.GATEWAY,
        config=PolicyCreate(
            name="Require Guardrail",
            description="Forbid requests without guardrail attachment",
            resource_type=ResourceType.GATEWAY,
            rules=[
                PolicyRule(id="1", type=RuleType.REQUIRE, category=RuleCategory.COMPLIANCE, target="guardrail_attached", condition="always", value="", action=RuleAction.ENFORCE),
            ],
        ),
    ),
]


class PolicyService:
    def __init__(self, table_name: str, region: str,
                 policy_engine_id: str = "", gateway_arn: str = "", agentcore_region: str = ""):
        # `table_name` and `region` are both REQUIRED, deliberately - neither has a default
        # that is safe to guess.
        #
        # `region` used to default to "us-east-1", which is not where this table lives
        # (us-east-2). It was masked only because the one caller passes AWS_REGION
        # explicitly, but the default was a live trap rather than dead weight: a DynamoDB
        # read against the wrong region SUCCEEDS and returns that region's empty
        # inventory, so the next caller that omitted the kwarg would have read zero policy
        # metadata with no exception, no ERROR, and a 200 response. Callers resolve it via
        # region_config.table_region("POLICIES").
        #
        # `table_name` used to default to "fsi-control-plane-policies" - the correct name -
        # which made the failure harder to see, not easier: the route overrode that good
        # default with settings.POLICIES_TABLE_NAME, which was "". One name, owned by
        # config.py, so the default cannot silently disagree with the setting again.
        self.table_name = (table_name or "").strip()
        self.region = region
        # AgentCore control-plane resources (policy engines, gateways, Cedar policies) can live in a
        # DIFFERENT region than the DynamoDB control-plane metadata store. Default to `region` so
        # single-region deployments are unaffected; the split matters when GOVERN_AWS_REGION
        # (Bedrock/AgentCore) differs from AWS_REGION (DynamoDB metadata).
        self.agentcore_region = agentcore_region or region
        self.policy_engine_id = policy_engine_id
        self.gateway_arn = gateway_arn

        # AgentCore control plane client (Bedrock/AgentCore region)
        self.agentcore = boto3.client("bedrock-agentcore-control", region_name=self.agentcore_region)

        # DynamoDB for local metadata (audit events, rule configs, mapping) — control-plane region.
        # Built lazily. Eagerly calling .Table(table_name) here is what produced an ERROR on
        # every single GET /api/v1/policies: an unconfigured name yields a Table("") object that
        # constructs fine and only raises ParamValidationError when first used, so a
        # CONFIGURATION state surfaced as a per-request runtime error deep inside a read.
        self._dynamodb = None
        self._table = None
        # Tri-state: None = not tried, True = last call succeeded, False = last call failed
        # (paired with _table_failed_at so False decays instead of latching for the process life).
        self._table_ok: Optional[bool] = None
        self._table_failed_at: Optional[float] = None
        # Disclosure flags for the two bounded sweeps. True means the last sweep stopped at
        # _SCAN_MAX_PAGES with pages still unread, so its result is a prefix of the truth and
        # a caller must not present it as the complete set.
        self._metadata_truncated: bool = False
        self._audit_truncated: bool = False

        # Warned ONCE here, at construction, rather than per request. This is the only place
        # that can distinguish "operator did not configure a table" from "a call failed", and
        # naming the setting is the whole diagnostic - the previous per-request
        # "Failed to load metadata: Invalid length for parameter TableName" named neither the
        # table nor the setting that was empty.
        if not self.table_name:
            logger.warning(
                "POLICIES_TABLE_NAME is not configured; policy metadata (rule configs, Cedar "
                "statements) and policy audit events will NOT be persisted or read. Policies "
                "themselves still come from AgentCore, so the list stays populated but shows "
                "no stored rule counts or audit history. Set POLICIES_TABLE_NAME to enable it."
            )

    # --- DynamoDB helpers ---

    def _get_table(self):
        """Lazily address the metadata table. Returns None when unconfigured/unaddressable.

        Guarded because `region` is configuration-driven: a typo'd POLICIES_TABLE_REGION makes
        boto3.resource raise InvalidRegionError, which - raised from __init__ - would 500 every
        policy endpoint on a one-character env-var mistake instead of degrading.
        """
        if not self.table_name:
            return None
        if self._table is None:
            try:
                if self._dynamodb is None:
                    self._dynamodb = boto3.resource("dynamodb", region_name=self.region)
                self._table = self._dynamodb.Table(self.table_name)
            except Exception as e:
                logger.warning(
                    "Cannot address policy metadata table %r in region %r (%s: %s). Check "
                    "POLICIES_TABLE_REGION / CONTROL_PLANE_TABLE_REGION / AWS_REGION.",
                    self.table_name, self.region, type(e).__name__, e,
                )
                self._mark_table_failed()
                return None
        return self._table

    def _table_available(self) -> bool:
        """Whether a DynamoDB call should be attempted right now.

        False for an unconfigured table, and for the cool-off window after a failure. Once
        _TABLE_RETRY_COOLDOWN_SECONDS has elapsed this returns True again so the next caller
        re-probes: a throttle, a brief partition, or a table created after the process started
        all recover without a restart. Monotonic time, so an NTP step cannot extend or skip
        the cool-off.
        """
        if not self.table_name:
            return False
        if self._table_ok is not False:
            return True
        if self._table_failed_at is None:
            return True
        return (time.monotonic() - self._table_failed_at) >= _TABLE_RETRY_COOLDOWN_SECONDS

    def _mark_table_ok(self) -> None:
        """Record that the table answered - clears any pending cool-off."""
        self._table_ok = True
        self._table_failed_at = None

    def _mark_table_failed(self) -> None:
        """Record a failure and start the cool-off before the next probe."""
        self._table_ok = False
        self._table_failed_at = time.monotonic()

    # --- AgentCore Policy CRUD ---

    def create_policy(self, req: PolicyCreate, created_by: str = "system") -> Policy:
        """Create a policy in AgentCore and store metadata locally."""
        # Fail loud if the policy engine / gateway aren't configured (set via
        # terraform modules/agentcore_policy -> ECS env). Prevents writing to
        # the wrong account or producing opaque 500s.
        target_engine_id = req.engine_id or self.policy_engine_id
        if not target_engine_id:
            raise RuntimeError(
                "POLICY_ENGINE_ID is not configured. Set it via terraform "
                "(modules/agentcore_policy) and redeploy the backend."
            )
        if not self.gateway_arn:
            raise RuntimeError(
                "GATEWAY_ARN is not configured. Set it via terraform "
                "(modules/agentcore_policy) and redeploy the backend."
            )

        # Use raw Cedar code if provided, otherwise generate from rules
        if req.cedar_code:
            cedar_statement = req.cedar_code
        else:
            cedar_statement = rules_to_cedar(req.rules, self.gateway_arn)
        cedar_name = _sanitize_cedar_name(req.name, unique=True)

        # Create in AgentCore
        try:
            response = self.agentcore.create_policy(
                name=cedar_name,
                description=req.description or f"Policy: {req.name}",
                policyEngineId=target_engine_id,
                definition={"cedar": {"statement": cedar_statement}},
                validationMode="IGNORE_ALL_FINDINGS",
            )
            agentcore_policy_id = response["policyId"]
            agentcore_arn = response["policyArn"]
            agentcore_status = response["status"]
            logger.info(f"Created AgentCore policy: {agentcore_policy_id} ({agentcore_status})")

            # Poll briefly so the returned status reflects reality (CREATING -> ACTIVE
            # usually settles within a few seconds). Avoids the UI showing DRAFT forever.
            if agentcore_status == "CREATING":
                for _ in range(5):
                    time.sleep(1)
                    try:
                        polled = self.agentcore.get_policy(
                            policyEngineId=target_engine_id,
                            policyId=agentcore_policy_id,
                        )
                        agentcore_status = polled.get("status", agentcore_status)
                        if agentcore_status != "CREATING":
                            break
                    except Exception:
                        break
        except self.agentcore.exceptions.ConflictException:
            logger.warning(f"Policy name conflict for '{req.name}' in engine {target_engine_id}")
            raise PolicyConflictError(
                f"A policy named '{req.name}' already exists in this engine. Use a different name."
            )
        except self.agentcore.exceptions.ValidationException as e:
            logger.warning(f"Invalid Cedar statement for policy '{req.name}': {e}")
            msg = str(e).split(": ", 1)[-1] if ": " in str(e) else str(e)
            raise PolicyValidationError(f"Invalid policy: {msg}")
        except Exception as e:
            logger.error(f"Failed to create AgentCore policy: {e}")
            raise

        # Build local Policy record
        policy = Policy(
            policy_id=agentcore_policy_id,
            name=req.name,
            description=req.description,
            resource_type=req.resource_type,
            resource_id=req.resource_id,
            rules=req.rules,
            created_by=created_by,
        )
        # When created from the visual builder we have discrete rules. When
        # created from raw Cedar / a template, req.rules is empty — derive the
        # counts from the Cedar statement so the UI doesn't show a misleading
        # "0 rules / 0 enforce" for a policy that is actually enforcing.
        if req.rules:
            policy.rules_count = len(req.rules)
            policy.blocking_rules = sum(1 for r in req.rules if r.action == RuleAction.ENFORCE)
        else:
            # Count Cedar statements; a `forbid` is an enforcing (blocking) rule.
            forbid_count = cedar_statement.count("forbid(")
            permit_count = cedar_statement.count("permit(")
            policy.rules_count = max(1, forbid_count + permit_count)
            policy.blocking_rules = forbid_count
        policy.status = self._map_status(agentcore_status)
        policy.status_history.append(
            StatusHistoryEntry(
                status=policy.status.value,
                timestamp=datetime.utcnow().isoformat(),
                # Mask the account id embedded in the policy ARN — this StatusHistoryEntry
                # is serialized into the POST /api/v1/policies response.
                message=mask_account_id(f"Deployed to AgentCore (ARN: {agentcore_arn})")
            )
        )

        # Store metadata in DynamoDB
        self._save_metadata(policy, cedar_statement, agentcore_arn)
        return policy

    def _list_all_policies(self, policy_engine_id: str) -> List[Dict]:
        """List ALL policies for an engine, following pagination tokens."""
        policies: List[Dict] = []
        next_token = None
        while True:
            kwargs = {"policyEngineId": policy_engine_id, "maxResults": 100}
            if next_token:
                kwargs["nextToken"] = next_token
            resp = self.agentcore.list_policies(**kwargs)
            policies.extend(resp.get("policies", []))
            next_token = resp.get("nextToken")
            if not next_token:
                break
        return policies

    def list_policies(self, status: Optional[PolicyStatus] = None, resource_type: Optional[ResourceType] = None,
                       engine_id: Optional[str] = None) -> List[Policy]:
        """List policies from AgentCore and enrich with local metadata.

        engine_id lets the UI scope the list to a specific policy engine (the
        one the user selected). Defaults to the configured/default engine so
        existing callers keep working.
        """
        target_engine = engine_id or self.policy_engine_id
        try:
            agentcore_policies = self._list_all_policies(target_engine)
        except Exception as e:
            logger.error(f"Failed to list AgentCore policies: {e}")
            agentcore_policies = []

        # Load local metadata for enrichment
        local_metadata = self._load_all_metadata()

        policies = []
        for ap in agentcore_policies:
            if ap["status"] in ("DELETING", "DELETE_FAILED", "CREATE_FAILED"):
                continue

            policy_id = ap["policyId"]
            meta = local_metadata.get(policy_id, {})

            # Prefer stored rule counts; if absent/zero (policy created from raw
            # Cedar or a template), derive from the Cedar statement so the UI
            # doesn't misreport an enforcing policy as "0 rules / 0 enforce".
            rules_count = meta.get("rules_count", 0)
            blocking_rules = meta.get("blocking_rules", 0)
            if not rules_count:
                cedar_stmt = (ap.get("definition", {}) or {}).get("cedar", {}).get("statement", "") or ""
                forbid_count = cedar_stmt.count("forbid(")
                permit_count = cedar_stmt.count("permit(")
                if forbid_count or permit_count:
                    rules_count = forbid_count + permit_count
                    blocking_rules = forbid_count

            policy = Policy(
                policy_id=policy_id,
                name=meta.get("name", ap["name"]),
                description=ap.get("description", ""),
                resource_type=ResourceType.GATEWAY,
                resource_id=meta.get("resource_id"),
                status=self._map_status(ap["status"]),
                rules=self._load_rules(meta),
                rules_count=rules_count,
                blocking_rules=blocking_rules,
                triggered_count=meta.get("triggered_count", 0),
                last_triggered=meta.get("last_triggered"),
                created_by=meta.get("created_by", "system"),
                created_at=self._to_iso(ap.get("createdAt")),
                updated_at=self._to_iso(ap.get("updatedAt")),
            )

            # Apply filters
            if status and policy.status != status:
                continue
            if resource_type and policy.resource_type != resource_type:
                continue

            policies.append(policy)

        policies.sort(key=lambda p: p.created_at, reverse=True)
        return policies

    def get_policy(self, policy_id: str) -> Optional[Policy]:
        """Get a single policy from AgentCore."""
        try:
            ap = self.agentcore.get_policy(
                policyEngineId=self.policy_engine_id,
                policyId=policy_id,
            )
        except self.agentcore.exceptions.ResourceNotFoundException:
            return None
        except Exception as e:
            logger.error(f"Failed to get policy {policy_id}: {e}")
            return None

        meta = self._load_metadata(policy_id)
        return Policy(
            policy_id=policy_id,
            name=meta.get("name", ap["name"]),
            description=ap.get("description", ""),
            resource_type=ResourceType.GATEWAY,
            resource_id=meta.get("resource_id"),
            status=self._map_status(ap["status"]),
            rules=self._load_rules(meta),
            rules_count=meta.get("rules_count", 0),
            blocking_rules=meta.get("blocking_rules", 0),
            triggered_count=meta.get("triggered_count", 0),
            last_triggered=meta.get("last_triggered"),
            created_by=meta.get("created_by", "system"),
            created_at=self._to_iso(ap.get("createdAt")),
            updated_at=self._to_iso(ap.get("updatedAt")),
        )

    def update_policy(self, policy_id: str, req: PolicyUpdate) -> Optional[Policy]:
        """Update a policy in AgentCore."""
        policy = self.get_policy(policy_id)
        if not policy:
            return None

        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(policy, field, value)

        # Regenerate Cedar if rules changed
        if req.rules is not None:
            cedar_statement = rules_to_cedar(req.rules, self.gateway_arn)
            try:
                self.agentcore.update_policy(
                    policyEngineId=self.policy_engine_id,
                    policyId=policy_id,
                    definition={"cedar": {"statement": cedar_statement}},
                    validationMode="IGNORE_ALL_FINDINGS",
                )
            except Exception as e:
                logger.error(f"Failed to update AgentCore policy: {e}")
                raise

        policy.rules_count = len(policy.rules)
        policy.blocking_rules = sum(1 for r in policy.rules if r.action == RuleAction.ENFORCE)
        policy.updated_at = datetime.utcnow().isoformat()

        self._save_metadata(policy, None, None)
        return policy

    def _find_policy_engine(self, policy_id: str) -> Optional[str]:
        """Find which policy engine a policy lives under. Returns engine id or None."""
        # Try the default engine first (cheapest common case)
        try:
            self.agentcore.get_policy(policyEngineId=self.policy_engine_id, policyId=policy_id)
            return self.policy_engine_id
        except self.agentcore.exceptions.ResourceNotFoundException:
            pass
        except Exception:
            pass
        # Search all other engines
        try:
            engines = self.agentcore.list_policy_engines().get("policyEngines", [])
        except Exception:
            return None
        for pe in engines:
            eid = pe["policyEngineId"]
            if eid == self.policy_engine_id:
                continue
            try:
                self.agentcore.get_policy(policyEngineId=eid, policyId=policy_id)
                return eid
            except Exception:
                continue
        return None

    def delete_policy(self, policy_id: str) -> Optional[Policy]:
        """Delete a policy from AgentCore (searches all engines for the policy)."""
        engine_id = self._find_policy_engine(policy_id)
        if not engine_id:
            return None

        try:
            self.agentcore.delete_policy(
                policyEngineId=engine_id,
                policyId=policy_id,
            )
            logger.info(f"Deleted AgentCore policy {policy_id} from engine {engine_id}")
        except Exception as e:
            logger.error(f"Failed to delete AgentCore policy: {e}")
            raise

        # Update local metadata if present
        meta = self._load_metadata(policy_id)
        policy = Policy(
            policy_id=policy_id,
            name=meta.get("name", policy_id),
            description=meta.get("description", ""),
            resource_type=ResourceType.GATEWAY,
            status=PolicyStatus.DISABLED,
            rules=self._load_rules(meta),
            created_by=meta.get("created_by", "system"),
        )
        self._save_metadata(policy, None, None)
        return policy

    def activate_policy(self, policy_id: str) -> Optional[Policy]:
        """Policies in AgentCore are active by default. This is a no-op."""
        return self.get_policy(policy_id)

    def disable_policy(self, policy_id: str) -> Optional[Policy]:
        """Disable = delete from AgentCore."""
        return self.delete_policy(policy_id)

    # --- Policy Evaluation ---

    def evaluate(self, policy_id: str, context: Dict) -> Dict:
        """
        Evaluate a policy against a given context.
        Note: In production, the Gateway evaluates policies automatically.
        This is for simulation/testing from the control plane.
        """
        policy = self.get_policy(policy_id)
        if not policy or policy.status != PolicyStatus.ACTIVE:
            return {"allowed": True, "matched_rules": [], "policy_status": "not_active"}

        matched = []
        enforced = False
        logged = False

        for rule in policy.rules:
            match = self._evaluate_rule(rule, context)
            if match:
                matched.append({
                    "rule_id": rule.id,
                    "type": rule.type.value,
                    "target": rule.target,
                    "action": rule.action.value,
                    "details": match,
                })
                if rule.action == RuleAction.ENFORCE:
                    enforced = True
                elif rule.action == RuleAction.LOG:
                    logged = True

        return {
            "allowed": not enforced,
            "enforced": enforced,
            "logged": logged,
            "matched_rules": matched,
        }

    def _evaluate_rule(self, rule: PolicyRule, context: Dict) -> Optional[str]:
        """Evaluate a single rule against context."""
        target_value = context.get(rule.target)

        if rule.condition == "always":
            if rule.target in context:
                return f"{rule.type.value} {rule.target}: present in context"
            return None
        if rule.condition == "equals":
            if target_value and str(target_value) == rule.value:
                return f"{rule.target} equals {rule.value}"
            return None
        if rule.condition == "exceeds":
            try:
                if target_value and float(target_value) > float(rule.value):
                    return f"{rule.target} ({target_value}) exceeds limit ({rule.value})"
            except (ValueError, TypeError):
                pass
            return None
        if rule.condition == "not_in_allowlist":
            if target_value:
                return f"{rule.target} ({target_value}) not in allowlist"
            return None
        return None

    # --- Metadata helpers (DynamoDB) ---

    def _save_metadata(self, policy: Policy, cedar_statement: Optional[str], agentcore_arn: Optional[str]):
        """Save policy metadata to DynamoDB for enrichment.

        Best-effort by design. This runs AFTER the policy has already been created in
        AgentCore, so raising here is worse than degrading: an unconfigured table made
        create_policy answer 500 while the Cedar policy it just created stayed live in the
        engine, i.e. the caller was told the create failed when half of it had not. The
        policy is real either way; only the local enrichment (rule counts, Cedar text) is
        lost, and list_policies already re-derives counts from the Cedar statement.
        """
        import json
        from decimal import Decimal

        item = {
            "pk": f"POLICY#{policy.policy_id}",
            "sk": "META",
            "name": policy.name,
            "description": policy.description or "",
            "resource_type": policy.resource_type.value,
            "resource_id": policy.resource_id or "",
            "status": policy.status.value,
            "rules_count": policy.rules_count,
            "blocking_rules": policy.blocking_rules,
            "triggered_count": policy.triggered_count,
            "last_triggered": policy.last_triggered or "",
            "created_by": policy.created_by or "system",
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
            "rules_json": json.dumps([r.model_dump() for r in policy.rules]),
        }
        if cedar_statement:
            item["cedar_statement"] = cedar_statement
        if agentcore_arn:
            item["agentcore_arn"] = agentcore_arn

        # Convert floats to Decimal for DynamoDB
        item = json.loads(json.dumps(item, default=str), parse_float=Decimal)

        table = self._get_table() if self._table_available() else None
        if table is None:
            logger.warning(
                "Policy %s metadata not persisted: policy metadata table unavailable "
                "(POLICIES_TABLE_NAME=%r). The policy itself exists in AgentCore.",
                policy.policy_id, self.table_name,
            )
            return
        try:
            table.put_item(Item=item)
            self._mark_table_ok()
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Failed to save policy metadata for {policy.policy_id}: {e}")
            self._mark_table_failed()

    def _load_metadata(self, policy_id: str) -> dict:
        """Load local metadata for a policy. Empty dict when the store is unavailable."""
        table = self._get_table() if self._table_available() else None
        if table is None:
            return {}
        try:
            resp = table.get_item(Key={"pk": f"POLICY#{policy_id}", "sk": "META"})
            self._mark_table_ok()
            item = resp.get("Item", {})
            item.pop("pk", None)
            item.pop("sk", None)
            return item
        except (BotoCoreError, ClientError):
            self._mark_table_failed()
            return {}

    def _load_all_metadata(self) -> Dict[str, dict]:
        """Load all policy metadata from DynamoDB. Empty when the store is unavailable.

        Paginates. A single scan() returns at most 1 MB, so the previous one-shot call
        dropped every policy's metadata past that boundary with no signal: list_policies
        then fell through to deriving rule counts from the Cedar statement, so affected
        policies rendered with plausible-looking counts and a "system" author instead of
        their stored name, resource_id, triggered_count and created_by. Nothing surfaced
        because the miss looks identical to a policy that simply has no stored metadata.
        """
        from boto3.dynamodb.conditions import Attr

        # WARNING, not ERROR, and skipped entirely when the table is unconfigured. This is the
        # line that logged "Failed to load metadata: Invalid length for parameter TableName" on
        # EVERY GET /api/v1/policies while the route still answered 200 - an unset setting
        # presented as a recurring runtime fault, which reads like a broken table or bad
        # credentials rather than a config value nobody had filled in.
        self._metadata_truncated = False
        table = self._get_table() if self._table_available() else None
        if table is None:
            return {}

        result: Dict[str, dict] = {}
        scan_kwargs: Dict[str, object] = {"FilterExpression": Attr("pk").begins_with("POLICY#")}
        try:
            for _page in range(_SCAN_MAX_PAGES):
                resp = table.scan(**scan_kwargs)
                for item in resp.get("Items", []):
                    policy_id = item["pk"].replace("POLICY#", "")
                    item.pop("pk", None)
                    item.pop("sk", None)
                    result[policy_id] = item
                last_key = resp.get("LastEvaluatedKey")
                if not last_key:
                    break
                scan_kwargs["ExclusiveStartKey"] = last_key
            else:
                # Loop ran the full cap and the last page still had more to read.
                self._metadata_truncated = True
                logger.warning(
                    "Policy metadata sweep stopped at the %d-page cap with more pages "
                    "remaining; loaded %d records. Policies beyond this point will show "
                    "Cedar-derived rule counts instead of their stored metadata.",
                    _SCAN_MAX_PAGES, len(result),
                )
            self._mark_table_ok()
            return result
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Failed to load policy metadata from {self.table_name!r} in {self.region}: {e}")
            self._mark_table_failed()
            # Return what was read rather than discarding it, but mark it partial: a
            # mid-sweep failure otherwise looks like an empty table.
            if result:
                self._metadata_truncated = True
            return result

    def _load_rules(self, meta: dict) -> List[PolicyRule]:
        """Load rules from metadata JSON."""
        import json
        rules_json = meta.get("rules_json", "[]")
        if isinstance(rules_json, str):
            try:
                rules_data = json.loads(rules_json)
                return [PolicyRule(**r) for r in rules_data]
            except Exception:
                return []
        return []

    @staticmethod
    def _to_iso(val) -> str:
        """Convert datetime or string to ISO string."""
        if val is None:
            return datetime.utcnow().isoformat()
        if isinstance(val, datetime):
            return val.isoformat()
        if hasattr(val, 'isoformat'):
            return val.isoformat()
        return str(val)

    def _map_status(self, agentcore_status: str) -> PolicyStatus:
        """Map AgentCore status to our PolicyStatus."""
        mapping = {
            "ACTIVE": PolicyStatus.ACTIVE,
            "CREATING": PolicyStatus.DRAFT,
            "UPDATING": PolicyStatus.ACTIVE,
            "CREATE_FAILED": PolicyStatus.DISABLED,
            "UPDATE_FAILED": PolicyStatus.ACTIVE,
        }
        return mapping.get(agentcore_status, PolicyStatus.DRAFT)

    # --- Audit Events ---

    def get_audit_events(self, policy_id: Optional[str] = None,
                         action_filter: Optional[AuditActionTaken] = None,
                         limit: int = 50) -> List[PolicyAuditEvent]:
        """Get audit events (stored locally). Empty when the store is unavailable."""
        from boto3.dynamodb.conditions import Key, Attr

        # Second of the two ERROR-per-request sites ("Failed to get audit events: Parameter
        # validation failed"), same empty-table-name cause as _load_all_metadata.
        self._audit_truncated = False
        table = self._get_table() if self._table_available() else None
        if table is None:
            return []

        # DynamoDB applies Limit to items EXAMINED, then applies FilterExpression to that page.
        # The scan path therefore used to return "up to `limit` of the first `limit` rows it
        # happened to touch", which on an audit endpoint destroys the only thing the endpoint
        # is for: a caller could not tell "3 audit events exist" from "we stopped after 50 rows
        # and 3 of them matched". With action_filter set, the more rows the table held the fewer
        # events came back. Both paths now page until the requested count is genuinely met.
        action_expr = Attr("action_taken").eq(action_filter.value) if action_filter else None

        if policy_id:
            # pk is exact and sk is time-ordered, so ScanIndexForward=False yields newest-first
            # and stopping as soon as `limit` MATCHES are held is exactly the newest `limit`.
            # Note action_filter is now honoured here too; it was previously applied only on the
            # scan path, so get_audit_events(policy_id=..., action_filter=...) silently ignored
            # the filter and returned every action type.
            operation = table.query
            page_kwargs: Dict[str, object] = {
                "KeyConditionExpression": Key("pk").eq(f"AUDIT#{policy_id}"),
                "ScanIndexForward": False,
            }
            if action_expr is not None:
                page_kwargs["FilterExpression"] = action_expr
            stop_at_limit = True
        else:
            # A scan returns pages in arbitrary order, so "newest `limit`" is only correct once
            # every matching row has been seen. Deliberately does NOT stop at `limit`: an early
            # exit here would return the newest of an arbitrary subset while looking like the
            # newest overall. The page cap bounds the cost, and hitting it sets the flag.
            operation = table.scan
            pk_expr = Attr("pk").begins_with("AUDIT#")
            page_kwargs = {
                "FilterExpression": (pk_expr & action_expr) if action_expr is not None else pk_expr
            }
            stop_at_limit = False

        items: List[dict] = []
        try:
            for _page in range(_SCAN_MAX_PAGES):
                resp = operation(**page_kwargs)
                items.extend(resp.get("Items", []))
                last_key = resp.get("LastEvaluatedKey")
                if not last_key or (stop_at_limit and len(items) >= limit):
                    break
                page_kwargs["ExclusiveStartKey"] = last_key
            else:
                self._audit_truncated = True
                logger.warning(
                    "Policy audit sweep stopped at the %d-page cap with more pages remaining; "
                    "collected %d matching events for limit=%d. The returned events are the "
                    "newest of what was scanned, NOT necessarily the newest that exist.",
                    _SCAN_MAX_PAGES, len(items), limit,
                )
            self._mark_table_ok()
        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Failed to get policy audit events from {self.table_name!r} in {self.region}: {e}")
            self._mark_table_failed()
            return []

        # Row parsing is caught separately from the DynamoDB call and does NOT trip the
        # cool-off: a row that fails PolicyAuditEvent validation says nothing about whether
        # the table is reachable, and marking it failed would suppress reads of the good rows
        # for the next 60s. Narrowing the boto3 catch above without this arm would also turn a
        # single malformed stored row into a 500 on an endpoint that previously degraded.
        try:
            events = []
            for item in items:
                item.pop("pk", None)
                item.pop("sk", None)
                events.append(PolicyAuditEvent(**item))
            events.sort(key=lambda e: e.timestamp, reverse=True)
            return events[:limit]
        except Exception as e:
            logger.warning(f"Discarding unparseable policy audit rows: {e}")
            return []

    def get_metrics(self, policy_id: str) -> PolicyMetrics:
        """Get aggregate metrics for a policy."""
        events = self.get_audit_events(policy_id=policy_id, limit=200)
        metrics = PolicyMetrics(policy_id=policy_id)
        metrics.total_events = len(events)
        metrics.enforced_count = sum(1 for e in events if e.action_taken == AuditActionTaken.ENFORCED)
        metrics.logged_count = sum(1 for e in events if e.action_taken == AuditActionTaken.LOGGED)
        if metrics.total_events > 0:
            metrics.enforce_rate = round(metrics.enforced_count / metrics.total_events * 100, 1)
        metrics.recent_events = events[:10]
        return metrics

    # --- Presets ---

    def get_presets(self) -> List[PolicyPreset]:
        return FSI_POLICY_PRESETS
