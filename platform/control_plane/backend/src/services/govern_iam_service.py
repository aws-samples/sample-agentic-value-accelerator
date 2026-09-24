"""Govern IAM service — real vendor IAM access from IAM + IAM Access Analyzer.

Read-through + cached. For a governed AI vendor (aws-bedrock, anthropic, cohere,
openai, cursor, github-copilot) this resolves the REAL IAM footprint that grants
that vendor access to AWS:

  - IAM (global): iam:ListRoles → candidate selection by trust principal / name /
    policy references, then per candidate iam:GetRole (trust policy + RoleLastUsed),
    iam:ListAttachedRolePolicies + iam:GetPolicy / iam:GetPolicyVersion and
    iam:ListRolePolicies + iam:GetRolePolicy to enumerate the granted permissions.
  - IAM Access Analyzer (regional, us-east-1): accessanalyzer:ListAnalyzers +
    accessanalyzer:ListFindingsV2 across the ACCOUNT (external access) and
    ACCOUNT_UNUSED_ACCESS analyzers, correlated to the selected role ARNs.

Honesty envelope (matches the govern_* service convention): on success the
response is live=True, source="iam+access-analyzer" (or "iam" if Access Analyzer
was unreachable). On missing creds / permissions / any AWS error it degrades
gracefully to the illustrative mock (live=False, source="mock") with an honest
note. It NEVER fabricates ARNs under a live response — every role/policy/ARN in a
live payload comes straight from the IAM APIs.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load
from models.govern_iam import VendorIAMAccess, VendorIAMPolicy, VendorIAMRole

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min — IAM + Access Analyzer data moves slowly

# Bounds so a single vendor lookup stays fast and the payload stays legible.
_MAX_ROLES_SCANNED = 1000     # ceiling on iam:ListRoles pages
_CANDIDATE_POOL = 16          # roles we deep-dive (GetRole + policies)
_DISPLAY_ROLES = 8            # roles surfaced in the response
_MAX_POLICIES_PER_ROLE = 8    # policy docs examined per role
_MAX_PERMS_PER_POLICY = 25    # actions listed per policy
_MAX_SENSITIVE = 12
_MAX_RECOMMENDATIONS = 6
_STALE_DAYS = 90              # RoleLastUsed older than this is "stale"

# ── Vendor → IAM matchers ────────────────────────────────────────────────────
# aws_native   : has a first-party AWS service principal (Bedrock platform).
# via_bedrock  : consumed THROUGH Bedrock (model providers) — matched by model-ARN
#                references / broad Bedrock invoke on the Bedrock role set.
_VENDOR_MATCH: dict[str, dict] = {
    "aws-bedrock": {
        "name": "AWS Bedrock",
        "aws_native": True,
        "via_bedrock": False,
        "principals": ["bedrock.amazonaws.com", "bedrock-agentcore.amazonaws.com"],
        "name_keywords": ["bedrock"],
        "model_arn_keywords": [],
    },
    "anthropic": {
        "name": "Anthropic",
        "aws_native": False,
        "via_bedrock": True,
        "principals": [],
        "name_keywords": ["anthropic", "claude"],
        "model_arn_keywords": ["anthropic."],
    },
    "cohere": {
        "name": "Cohere",
        "aws_native": False,
        "via_bedrock": True,
        "principals": [],
        "name_keywords": ["cohere"],
        "model_arn_keywords": ["cohere."],
    },
    "openai": {
        "name": "OpenAI",
        "aws_native": False,
        "via_bedrock": False,
        "principals": [],
        "name_keywords": ["openai", "gpt-"],
        "model_arn_keywords": [],
    },
    "cursor": {
        "name": "Cursor AI",
        "aws_native": False,
        "via_bedrock": False,
        "principals": [],
        "name_keywords": ["cursor"],
        "model_arn_keywords": [],
    },
    "github-copilot": {
        "name": "GitHub Copilot",
        "aws_native": False,
        "via_bedrock": False,
        "principals": [],
        "name_keywords": ["copilot", "githubcopilot"],
        "model_arn_keywords": [],
    },
}

# Actions treated as high-risk when granted (used to populate sensitive_permissions).
_SENSITIVE_EXACT = {
    "*", "iam:*", "sts:*", "s3:*", "bedrock:*", "kms:*", "secretsmanager:*",
    "iam:passrole", "iam:createaccesskey", "iam:createuser", "iam:attachrolepolicy",
    "iam:putrolepolicy", "sts:assumerole", "kms:decrypt", "secretsmanager:getsecretvalue",
    "dynamodb:*", "lambda:*",
}
# When a statement's resource is "*", these action prefixes on all resources are risky.
_SENSITIVE_PREFIX_ON_WILDCARD = (
    "s3:get", "s3:put", "s3:delete", "s3:list", "secretsmanager:", "kms:decrypt",
    "dynamodb:", "bedrock:invokemodel",
)


def _iso(v) -> Optional[str]:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


def _priority(name: str) -> int:
    """Rank a role name for deep-dive selection — meaningful roles first, noise last."""
    n = name.lower()
    score = 0
    for kw, pts in (("executionrole", 6), ("execution", 4), ("agent", 4),
                    ("knowledgebase", 4), ("guardrail", 4), ("invocation-logging", 3),
                    ("kb", 2), ("governance", 3)):
        if kw in n:
            score += pts
    for kw, pts in (("consumptionrole", 6), ("videoconsumption", 6), ("modelmanagement", 4),
                    ("codebuild", 5), ("sdkcodebuild", 5), ("servicecatalog", 4),
                    ("canvas", 2), ("sdkruntime", 1)):
        if kw in n:
            score -= pts
    return score


def _statements(doc) -> list[dict]:
    if not isinstance(doc, dict):
        return []
    stmts = doc.get("Statement", [])
    if isinstance(stmts, dict):
        return [stmts]
    return [s for s in stmts if isinstance(s, dict)]


def _as_list(v) -> list:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _extract_allow(doc) -> tuple[list[str], set[str]]:
    """Return (allowed actions, resources) from Allow statements of a policy document."""
    actions: list[str] = []
    resources: set[str] = set()
    for s in _statements(doc):
        if s.get("Effect") != "Allow":
            continue
        actions.extend(str(a) for a in _as_list(s.get("Action")))
        for r in _as_list(s.get("Resource")):
            resources.add(str(r))
    return actions, resources


def _scope_summary(resources: set[str]) -> str:
    if not resources or "*" in resources:
        return "* (all resources)"
    ordered = sorted(resources)
    if len(ordered) <= 2:
        return ", ".join(ordered)
    return f"{ordered[0]} (+{len(ordered) - 1} more)"


def _is_sensitive(action: str, has_wildcard_resource: bool) -> bool:
    a = action.lower()
    if action == "*" or a.endswith(":*"):
        return True
    if a in _SENSITIVE_EXACT:
        return True
    if has_wildcard_resource and any(a.startswith(p) for p in _SENSITIVE_PREFIX_ON_WILDCARD):
        return True
    return False


def _trust_summary(doc, self_account: Optional[str]) -> tuple[str, bool]:
    """Human-readable trust summary + whether the role trusts an EXTERNAL account."""
    principals: list[str] = []
    external = False
    for s in _statements(doc):
        p = s.get("Principal")
        if p == "*":
            principals.append("* (public)")
            external = True
            continue
        if isinstance(p, dict):
            for vals in p.values():
                for val in _as_list(vals):
                    sval = str(val)
                    principals.append(sval)
                    m = re.search(r"arn:aws:iam::(\d+):", sval)
                    if m and self_account and m.group(1) != self_account:
                        external = True
    # De-dup preserving order.
    seen: list[str] = []
    for pr in principals:
        if pr not in seen:
            seen.append(pr)
    if not seen:
        return "No trust principals", False
    shown = ", ".join(seen[:3])
    extra = f" (+{len(seen) - 3} more)" if len(seen) > 3 else ""
    return f"Trusted by {shown}{extra}", external


class GovernIamService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

    # ── clients ──
    def _iam(self):
        return boto3.client("iam", region_name=self.region)

    def _access_analyzer(self):
        return boto3.client("accessanalyzer", region_name=self.region)

    # ── public (cached) ──
    def get_vendor_access(self, vendor_id: str) -> VendorIAMAccess:
        result, cached_at = get_or_load(
            f"iam:vendor-access:{self.region}:{vendor_id}", _TTL,
            lambda: self._fetch_vendor_access(vendor_id),
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    # ── core fetch ──
    def _fetch_vendor_access(self, vendor_id: str) -> VendorIAMAccess:
        match = _VENDOR_MATCH.get(vendor_id)
        vendor_name = (match or {}).get("name") or vendor_id.replace("-", " ").title()
        try:
            iam = self._iam()
            roles = self._list_roles(iam)

            if match is None:
                # Unknown vendor id: we DID query IAM (live), but have no matcher.
                return VendorIAMAccess(
                    vendor_id=vendor_id, vendor_name=vendor_name, has_aws_access=False,
                    roles=[], policies=[], risk_level="unknown", last_activity=None,
                    total_permissions=0, sensitive_permissions=[],
                    recommendations=["Vendor not in the governed matcher set — add a matcher to resolve its IAM footprint."],
                    live=True, source="iam", note="Queried IAM; no matcher configured for this vendor id.",
                )

            self_account = _account_from_roles(roles)

            # 1) Candidate selection (cheap — trust principal / name from ListRoles).
            candidates = self._select_candidates(match, roles)
            total_matches = len(candidates)
            deep = candidates[:_CANDIDATE_POOL]

            # 2) Deep-dive the pool in parallel (GetRole + attached/inline policy docs).
            details = self._deep_dive(iam, [r["RoleName"] for r in deep], self_account)

            # 3) For model providers consumed via Bedrock, keep only roles that actually
            #    grant access to the vendor's models (explicit model-ARN ref, or broad invoke).
            broad_only = False
            if match["via_bedrock"]:
                details, broad_only = _filter_via_bedrock(details, match["model_arn_keywords"])

            selected = details[:_DISPLAY_ROLES]
            role_arns = {d["role"].arn for d in selected}

            # 4) Access Analyzer correlation (graceful — never breaks the IAM result).
            external_hits, unused_hits, aa_ok = self._analyzer_findings(role_arns)

            return self._assemble(
                vendor_id=vendor_id, vendor_name=vendor_name, match=match,
                selected=selected, total_matches=total_matches,
                external_hits=external_hits, unused_hits=unused_hits, aa_ok=aa_ok,
                broad_only=broad_only,
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("IAM/Access Analyzer unavailable for vendor %s: %s", vendor_id, e)
            return _mock_fallback(vendor_id, f"AWS unavailable ({type(e).__name__}) — showing illustrative sample")
        except Exception as e:  # noqa: BLE001 — never leak a live-path failure to the caller
            logger.error("Vendor IAM enumeration unexpected error for %s: %s", vendor_id, e)
            return _mock_fallback(vendor_id, "Unexpected error querying AWS — showing illustrative sample")

    # ── IAM enumeration ──
    def _list_roles(self, iam) -> list[dict]:
        roles: list[dict] = []
        paginator = iam.get_paginator("list_roles")
        for page in paginator.paginate():
            roles.extend(page.get("Roles", []))
            if len(roles) >= _MAX_ROLES_SCANNED:
                break
        return roles[:_MAX_ROLES_SCANNED]

    def _select_candidates(self, match: dict, roles: list[dict]) -> list[dict]:
        principals = set(match["principals"])
        name_kws = match["name_keywords"]
        primary, bedrock_pool = [], []
        for r in roles:
            name = r.get("RoleName", "") or ""
            lname = name.lower()
            role_principals = _principals_of(r.get("AssumeRolePolicyDocument"))
            name_hit = any(kw in lname for kw in name_kws)
            principal_hit = bool(principals & role_principals)
            if name_hit or principal_hit:
                primary.append(r)
            elif match["via_bedrock"] and ({"bedrock.amazonaws.com", "bedrock-agentcore.amazonaws.com"} & role_principals):
                bedrock_pool.append(r)
        # For via-Bedrock vendors, widen with the Bedrock role set so we can inspect
        # their policies for model references. Rank everything by relevance.
        pool = primary + (bedrock_pool if match["via_bedrock"] else [])
        pool.sort(key=lambda r: (-_priority(r.get("RoleName", "")), r.get("RoleName", "")))
        return pool

    def _deep_dive(self, iam, role_names: list[str], self_account: Optional[str]) -> list[dict]:
        policy_doc_cache: dict[str, tuple] = {}  # managed policy arn -> (actions, resources)

        def worker(role_name: str):
            try:
                return self._role_detail(iam, role_name, self_account, policy_doc_cache)
            except Exception as e:  # noqa: BLE001 — one bad role never drops the lookup
                logger.info("Deep-dive skip role %s: %s", role_name, e)
                return None

        results: list[dict] = []
        if not role_names:
            return results
        with ThreadPoolExecutor(max_workers=min(8, len(role_names))) as pool:
            for res in pool.map(worker, role_names):
                if res is not None:
                    results.append(res)
        # Preserve the relevance order of the input names.
        order = {n: i for i, n in enumerate(role_names)}
        results.sort(key=lambda d: order.get(d["role"].name, 999))
        return results

    def _role_detail(self, iam, role_name: str, self_account, policy_doc_cache) -> dict:
        role = iam.get_role(RoleName=role_name)["Role"]
        arn = role.get("Arn", "")
        last_used_dt = (role.get("RoleLastUsed") or {}).get("LastUsedDate")
        trust_summary, external_trust = _trust_summary(role.get("AssumeRolePolicyDocument"), self_account)

        policies: list[VendorIAMPolicy] = []
        actions: set[str] = set()
        sensitive: set[str] = set()
        resource_refs: set[str] = set()

        # Attached managed policies.
        attached = iam.list_attached_role_policies(RoleName=role_name).get("AttachedPolicies", [])
        for ap in attached[:_MAX_POLICIES_PER_ROLE]:
            parn = ap.get("PolicyArn", "")
            pname = ap.get("PolicyName", parn.split("/")[-1])
            if parn in policy_doc_cache:
                acts, res = policy_doc_cache[parn]
            else:
                acts, res = _fetch_managed_policy(iam, parn)
                policy_doc_cache[parn] = (acts, res)
            _accumulate(acts, res, actions, sensitive, resource_refs)
            policies.append(_policy_model(pname, "managed", parn, acts, res))

        # Inline policies.
        inline_names = iam.list_role_policies(RoleName=role_name).get("PolicyNames", [])
        for pn in inline_names[:_MAX_POLICIES_PER_ROLE]:
            doc = iam.get_role_policy(RoleName=role_name, PolicyName=pn).get("PolicyDocument")
            acts, res = _extract_allow(doc)
            _accumulate(acts, res, actions, sensitive, resource_refs)
            policies.append(_policy_model(pn, "inline", None, acts, res))

        role_model = VendorIAMRole(
            name=role.get("RoleName", role_name),
            arn=arn,
            last_used=_iso(last_used_dt),
            trust_policy_summary=trust_summary,
            created_date=_iso(role.get("CreateDate")),
        )
        return {
            "role": role_model,
            "policies": policies,
            "actions": actions,
            "sensitive": sensitive,
            "resource_refs": resource_refs,
            "last_used_dt": last_used_dt,
            "external_trust": external_trust,
        }

    # ── Access Analyzer ──
    def _analyzer_findings(self, role_arns: set[str]) -> tuple[set[str], set[str], bool]:
        """Correlate ACTIVE Access Analyzer findings to the selected role ARNs.

        Returns (external-access ARNs, unused-access ARNs, analyzer_reachable).
        """
        external: set[str] = set()
        unused: set[str] = set()
        if not role_arns:
            return external, unused, False
        try:
            aa = self._access_analyzer()
            analyzers = [a for a in aa.list_analyzers().get("analyzers", [])
                         if a.get("status") == "ACTIVE"
                         and a.get("type") in ("ACCOUNT", "ACCOUNT_UNUSED_ACCESS")]
            if not analyzers:
                return external, unused, True  # reachable, just nothing relevant
            for a in analyzers:
                arn = a["arn"]
                findings: list[dict] = []
                try:
                    if aa.can_paginate("list_findings_v2"):
                        for page in aa.get_paginator("list_findings_v2").paginate(
                            analyzerArn=arn, filter={"status": {"eq": ["ACTIVE"]}},
                            PaginationConfig={"MaxItems": 400, "PageSize": 100},
                        ):
                            findings.extend(page.get("findings", []))
                    else:
                        findings = aa.list_findings_v2(
                            analyzerArn=arn, filter={"status": {"eq": ["ACTIVE"]}},
                            maxResults=100,
                        ).get("findings", [])
                except (ClientError, BotoCoreError) as e:
                    logger.info("Access Analyzer ListFindingsV2 failed for %s: %s", arn, e)
                    continue
                for f in findings:
                    res = f.get("resource")
                    if res not in role_arns:
                        continue
                    ftype = (f.get("findingType") or "")
                    if ftype.lower().startswith("unused") or a.get("type") == "ACCOUNT_UNUSED_ACCESS":
                        unused.add(res)
                    else:
                        external.add(res)
            return external, unused, True
        except (ClientError, BotoCoreError) as e:
            logger.info("Access Analyzer unavailable: %s", e)
            return external, unused, False
        except Exception as e:  # noqa: BLE001
            logger.info("Access Analyzer unexpected error: %s", e)
            return external, unused, False

    # ── assembly / scoring ──
    def _assemble(self, *, vendor_id, vendor_name, match, selected, total_matches,
                  external_hits, unused_hits, aa_ok, broad_only) -> VendorIAMAccess:
        has_access = len(selected) > 0
        roles = [d["role"] for d in selected]
        policies = [p for d in selected for p in d["policies"]]

        all_actions: set[str] = set()
        all_sensitive: set[str] = set()
        external_trust = False
        last_dts = []
        for d in selected:
            all_actions |= d["actions"]
            all_sensitive |= d["sensitive"]
            external_trust = external_trust or d["external_trust"]
            if d["last_used_dt"]:
                last_dts.append(d["last_used_dt"])

        last_activity_dt = max(last_dts) if last_dts else None
        last_activity = _iso(last_activity_dt)
        total_permissions = len(all_actions)
        sensitive_permissions = sorted(all_sensitive)[:_MAX_SENSITIVE]

        wildcard_admin = any(a == "*" or a.lower() in ("iam:*", "*:*") for a in all_actions)
        service_wide = any(a.lower().endswith(":*") for a in all_actions)
        stale = has_access and _is_stale(last_activity_dt)

        # Risk scoring from real signals.
        score = 0
        if external_hits:
            score += 2
        if external_trust:
            score += 1
        if wildcard_admin:
            score += 2
        elif service_wide:
            score += 1
        if unused_hits:
            score += 1
        if stale:
            score += 1
        if sensitive_permissions:
            score += 1
        if not has_access:
            risk_level = "low"
        elif score >= 6:
            risk_level = "critical"
        elif score >= 4:
            risk_level = "high"
        elif score >= 2:
            risk_level = "medium"
        else:
            risk_level = "low"

        recs: list[str] = []
        if external_hits:
            recs.append(f"IAM Access Analyzer flagged external/cross-account access on "
                        f"{len(external_hits)} of these role(s) — review trust relationships.")
        if unused_hits:
            recs.append(f"Access Analyzer flagged unused access on {len(unused_hits)} role(s) — "
                        "remove unused permissions or deactivate the role.")
        if wildcard_admin:
            recs.append("Wildcard/administrative permissions (e.g. \"*\") are granted — scope to the "
                        "specific actions and resources the integration needs.")
        elif service_wide:
            recs.append("Service-wide permissions (e.g. bedrock:*, s3:*) are granted — scope to the "
                        "required actions and resource ARNs.")
        if stale:
            recs.append(f"Role(s) not used in over {_STALE_DAYS} days — consider deactivating stale access.")
        if match["via_bedrock"] and broad_only:
            recs.append(f"No IAM role scopes explicitly to {vendor_name} model ARNs; access is granted via "
                        "broad Bedrock permissions — consider model-scoped policies for least privilege.")
        if has_access and not recs:
            recs.append("IAM access appears scoped; continue monitoring via IAM Access Analyzer.")
        if not has_access:
            if match["via_bedrock"]:
                recs.append(f"{vendor_name} models are consumed via Amazon Bedrock; no IAM role explicitly "
                            "references them. Access is governed by the broader Bedrock roles (see AWS Bedrock).")
            else:
                recs.append("No IAM role or policy references this vendor — confirm the integration is "
                            "API-key based and review key management / data handling.")

        # Mask account IDs in the EXPOSED ARNs/scopes. Correlation above (Access Analyzer,
        # scoring) used the raw ARNs; from here on only masked values leave the backend.
        for r in roles:
            r.arn = mask_account_id(r.arn)
            r.trust_policy_summary = mask_account_id(r.trust_policy_summary)
        for p in policies:
            p.arn = mask_account_id(p.arn)
            p.resource_scope = mask_account_id(p.resource_scope) or p.resource_scope

        source = "iam+access-analyzer" if aa_ok else "iam"
        note_bits = []
        if has_access:
            note_bits.append(f"{len(roles)} of {total_matches} matching role(s) shown"
                             if total_matches > len(roles) else f"{len(roles)} role(s)")
        else:
            note_bits.append("no matching IAM roles found")
        if not aa_ok:
            note_bits.append("Access Analyzer unavailable")
        note = "; ".join(note_bits)

        return VendorIAMAccess(
            vendor_id=vendor_id, vendor_name=vendor_name, has_aws_access=has_access,
            roles=roles, policies=policies, risk_level=risk_level,
            last_activity=last_activity, total_permissions=total_permissions,
            sensitive_permissions=sensitive_permissions,
            recommendations=recs[:_MAX_RECOMMENDATIONS],
            live=True, source=source, note=note,
        )


# ── module helpers ────────────────────────────────────────────────────────────
def _principals_of(trust_doc) -> set[str]:
    out: set[str] = set()
    for s in _statements(trust_doc):
        p = s.get("Principal")
        if p == "*":
            out.add("*")
        elif isinstance(p, dict):
            for vals in p.values():
                for v in _as_list(vals):
                    out.add(str(v))
    return out


def _account_from_roles(roles: list[dict]) -> Optional[str]:
    for r in roles:
        m = re.search(r"arn:aws:iam::(\d+):", r.get("Arn", "") or "")
        if m:
            return m.group(1)
    return None


def _fetch_managed_policy(iam, policy_arn: str) -> tuple[list[str], set[str]]:
    pol = iam.get_policy(PolicyArn=policy_arn).get("Policy", {})
    vid = pol.get("DefaultVersionId")
    if not vid:
        return [], set()
    doc = iam.get_policy_version(PolicyArn=policy_arn, VersionId=vid).get("PolicyVersion", {}).get("Document")
    return _extract_allow(doc)


def _accumulate(acts: list[str], res: set[str], actions: set[str],
                sensitive: set[str], resource_refs: set[str]) -> None:
    has_wildcard_resource = (not res) or ("*" in res)
    resource_refs |= {r.lower() for r in res}
    for a in acts:
        actions.add(a)
        if _is_sensitive(a, has_wildcard_resource):
            sensitive.add(a)


def _policy_model(name: str, ptype: str, arn: Optional[str],
                  acts: list[str], res: set[str]) -> VendorIAMPolicy:
    distinct = sorted(dict.fromkeys(acts))  # de-dup, stable
    return VendorIAMPolicy(
        name=name, policy_type=ptype, arn=arn,
        permissions=distinct[:_MAX_PERMS_PER_POLICY],
        resource_scope=_scope_summary(res),
    )


def _filter_via_bedrock(details: list[dict], model_keywords: list[str]) -> tuple[list[dict], bool]:
    """Keep Bedrock roles that grant the vendor's models. Prefer explicit model-ARN
    references; fall back to roles with broad Bedrock invoke. Returns (kept, broad_only)."""
    explicit, broad = [], []
    for d in details:
        refs = d["resource_refs"]
        actions_l = {a.lower() for a in d["actions"]}
        has_invoke = ("*" in actions_l or "bedrock:*" in actions_l
                      or any(a.startswith("bedrock:invokemodel") for a in actions_l))
        if any(any(kw in r for kw in model_keywords) for r in refs):
            explicit.append(d)
        elif has_invoke:
            broad.append(d)
    if explicit:
        return explicit + broad, False
    return broad, True


def _is_stale(dt) -> bool:
    if dt is None:
        return True
    try:
        ref = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ref) > timedelta(days=_STALE_DAYS)
    except Exception:  # noqa: BLE001
        return False


# ── illustrative mock (not-live fallback) ─────────────────────────────────────
def _mock_fallback(vendor_id: str, reason: str) -> VendorIAMAccess:
    base = mock_vendor_access(vendor_id)
    base.note = f"{reason}. {base.note}" if base.note else reason
    return base


def mock_vendor_access(vendor_id: str) -> VendorIAMAccess:
    """Illustrative, clearly-labeled sample used only when live AWS access fails.

    live=False, source="mock" — the UI badge stays "Mock". Never returned on the
    happy path; happy-path responses are always live from IAM.
    """
    aws_integrated_vendors = {
        "aws-bedrock": {
            "vendor_name": "AWS Bedrock",
            "roles": [
                VendorIAMRole(
                    name="AmazonBedrockExecutionRole",
                    arn="arn:aws:iam::000000000000:role/AmazonBedrockExecutionRole",
                    last_used=(datetime.now() - timedelta(hours=2)).isoformat(),
                    trust_policy_summary="Trusted by bedrock.amazonaws.com",
                    created_date="2024-01-15",
                ),
                VendorIAMRole(
                    name="BedrockAgentRole",
                    arn="arn:aws:iam::000000000000:role/BedrockAgentRole",
                    last_used=(datetime.now() - timedelta(days=1)).isoformat(),
                    trust_policy_summary="Trusted by bedrock.amazonaws.com for agent execution",
                    created_date="2024-03-20",
                ),
            ],
            "policies": [
                VendorIAMPolicy(
                    name="AmazonBedrockFullAccess",
                    policy_type="managed",
                    arn="arn:aws:iam::aws:policy/AmazonBedrockFullAccess",
                    permissions=[
                        "bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream",
                        "bedrock:CreateModelCustomizationJob", "bedrock:GetFoundationModel",
                        "bedrock:ListFoundationModels",
                    ],
                    resource_scope="* (all resources)",
                ),
                VendorIAMPolicy(
                    name="BedrockKnowledgeBasePolicy",
                    policy_type="inline",
                    permissions=["s3:GetObject", "s3:ListBucket", "opensearchserverless:APIAccessAll"],
                    resource_scope="Knowledge base S3 buckets and OpenSearch collections",
                ),
            ],
            "risk_level": "medium",
            "last_activity": (datetime.now() - timedelta(hours=2)).isoformat(),
            "total_permissions": 15,
            "sensitive_permissions": ["s3:GetObject", "opensearchserverless:APIAccessAll"],
            "recommendations": [
                "Consider scoping S3 access to specific bucket ARNs",
                "Enable CloudTrail logging for all Bedrock API calls",
            ],
        },
        "anthropic": {
            "vendor_name": "Anthropic",
            "roles": [
                VendorIAMRole(
                    name="AnthropicClaudeServiceRole",
                    arn="arn:aws:iam::000000000000:role/AnthropicClaudeServiceRole",
                    last_used=(datetime.now() - timedelta(hours=6)).isoformat(),
                    trust_policy_summary="Cross-account trust to Anthropic AWS account for model serving",
                    created_date="2024-02-10",
                ),
            ],
            "policies": [
                VendorIAMPolicy(
                    name="ClaudeModelInvocationPolicy",
                    policy_type="inline",
                    permissions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                    resource_scope="arn:aws:bedrock:*:*:foundation-model/anthropic.*",
                ),
                VendorIAMPolicy(
                    name="ClaudeLoggingPolicy",
                    policy_type="inline",
                    permissions=["logs:CreateLogStream", "logs:PutLogEvents"],
                    resource_scope="arn:aws:logs:*:*:log-group:/aws/bedrock/*",
                ),
            ],
            "risk_level": "low",
            "last_activity": (datetime.now() - timedelta(hours=6)).isoformat(),
            "total_permissions": 4,
            "sensitive_permissions": [],
            "recommendations": ["IAM access is well-scoped to Bedrock model invocation"],
        },
    }
    external_vendors = {
        "openai": "OpenAI", "cursor": "Cursor AI",
        "github-copilot": "GitHub Copilot", "cohere": "Cohere",
    }

    if vendor_id in aws_integrated_vendors:
        d = aws_integrated_vendors[vendor_id]
        return VendorIAMAccess(
            vendor_id=vendor_id, vendor_name=d["vendor_name"], has_aws_access=True,
            roles=d["roles"], policies=d["policies"], risk_level=d["risk_level"],
            last_activity=d["last_activity"], total_permissions=d["total_permissions"],
            sensitive_permissions=d["sensitive_permissions"], recommendations=d["recommendations"],
            live=False, source="mock",
            note="Illustrative sample — live IAM data was unavailable.",
        )
    if vendor_id in external_vendors:
        return VendorIAMAccess(
            vendor_id=vendor_id, vendor_name=external_vendors[vendor_id], has_aws_access=False,
            roles=[], policies=[], risk_level="low", last_activity=None,
            total_permissions=0, sensitive_permissions=[],
            recommendations=[
                "External SaaS vendor - no direct AWS IAM access",
                "Review API key management and data handling practices",
            ],
            live=False, source="mock", note="External vendor with no direct AWS access",
        )
    return VendorIAMAccess(
        vendor_id=vendor_id, vendor_name=vendor_id.replace("-", " ").title(),
        has_aws_access=False, roles=[], policies=[], risk_level="unknown",
        last_activity=None, total_permissions=0, sensitive_permissions=[],
        recommendations=["Vendor not found in registry - manual review required"],
        live=False, source="mock", note="Unknown vendor",
    )
