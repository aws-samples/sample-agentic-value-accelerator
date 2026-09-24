"""ai_tool_provenance — where an AI tool call went, and how the tool got installed.

WHY THIS EXISTS

Every AI-tool detector in this platform shares one blind spot: it only sees tools that
already talk to AWS or already emit telemetry. Shadow AI is, by definition, the part that
does neither. A developer who installs a CLI and points it at a vendor's public API
produces no CloudTrail event, no CloudWatch metric and no repo config, and is therefore
invisible to all of them.

That gap cannot be closed by guessing. It can only be closed by new signals (DNS query
logging, endpoint inventory) — so until those land, the honest move is to say which
questions the available evidence can and cannot answer, per record and in aggregate.

Hence two independent classifications, each with an explicit unknown:

    call_path:          bedrock | public_api | unknown
    install_provenance: managed | managed_runtime | self_installed | unknown_host

NEITHER MAY DEFAULT TO A CONFIDENT VALUE. `unknown` is a measurement, not a gap to be
filled with the safe-looking bucket, and it must be counted and displayed. Collapsing
"no endpoint coverage on that host" into "self-installed" would manufacture findings; the
reverse — collapsing it into "managed" — would manufacture assurance. Both are the class
of error this module exists to prevent.

THE COVERAGE DENOMINATOR IS PART OF THE ANSWER

"3 shadow AI findings" is unreadable on its own: it could describe a clean estate or 5%
visibility. So every aggregate ships with what fraction of the estate could have produced
a finding at all (see `ProvenanceCoverage`). A count without its denominator is the thing
that makes a zero look like good news when it means no telemetry.

WHAT IS DELIBERATELY NOT HERE

No network egress inference. `public_api` requires positive DNS or proxy evidence, which
is why `classify_call_path` cannot return it without a resolver-log match being passed in.
Absence of a Bedrock call is NOT evidence of a public-API call — the tool may simply not
have run. And nothing here covers a laptop off the corporate network; that is an endpoint
agent's job, and the UI should say so rather than imply coverage it does not have.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple


class CallPath(str, Enum):
    """Where an observed AI call went."""

    BEDROCK = "bedrock"
    """Proven by a CloudTrail bedrock event or a Bedrock invocation log record."""

    PUBLIC_API = "public_api"
    """Proven by a DNS/proxy match on a provider domain. Never inferred from absence."""

    UNKNOWN = "unknown"
    """A tool was identified but no call was observed on either path. Common and honest."""


class InstallProvenance(str, Enum):
    """How the tool got onto the host it ran from."""

    MANAGED = "managed"
    """Host is under endpoint management AND the tool appears in its package inventory."""

    SELF_INSTALLED = "self_installed"
    """Host IS inventoried, the tool ran, and the tool is absent from that inventory."""

    MANAGED_RUNTIME = "managed_runtime"
    """An AWS-managed serverless execution environment — Lambda, Fargate, AgentCore.

    Separate from both MANAGED and UNKNOWN_HOST because neither describes it. There is no
    host to enrol in endpoint management and no user-installed software: the environment is
    provisioned per invocation from a deployment package or image.

    Getting this wrong in the obvious direction matters. Filing a Lambda under
    `unknown_host` counts a fully-governed deployment as a visibility gap, which inflates
    the apparent blind spot and buries the gaps that are real.
    """

    UNKNOWN_HOST = "unknown_host"
    """The call came from a host with no endpoint coverage at all.

    Deliberately NOT `self_installed`. "We cannot see this host" and "we can see this
    host and the tool was hand-installed" are different facts, and the first is usually
    the more important one — it sizes the blind spot rather than adding to a finding count.
    """


class ToolClass(str, Enum):
    """What kind of caller this is. Not every Bedrock caller is a developer AI tool."""

    CODING_TOOL = "coding_tool"
    """An identified AI coding assistant (Claude Code, Cursor, Copilot, Q, …)."""

    SDK_CALLER = "sdk_caller"
    """A generic SDK/CLI user agent (boto3, aws-cli, …) — almost always an application.

    Kept separate because a deployed workload calling Bedrock through boto3 is not a
    shadow developer tool, and presenting it as one is a false positive. The prior
    detector had exactly this bug: it split the user agent on "/" and surfaced
    "Boto3 1.42.97" in a local-agent-discovery panel at high risk.
    """

    UNIDENTIFIED = "unidentified"
    """A user agent that matches neither list. Reported as-is, never guessed into a tool."""


# ──────────────────────────────────────────────────────────────────────────────
# Signatures
# ──────────────────────────────────────────────────────────────────────────────

# Order matters: the FIRST match wins, so more specific patterns must precede broader
# ones. "claude-cli" before "claude", "amazon-q"/"amazonq" before "amazon".
CODING_TOOL_SIGNATURES: Sequence[Dict[str, str]] = (
    {"pattern": "claude-cli", "tool": "Claude Code", "icon": "CC"},
    {"pattern": "claude-code", "tool": "Claude Code", "icon": "CC"},
    {"pattern": "cursor", "tool": "Cursor", "icon": "C"},
    {"pattern": "windsurf", "tool": "Windsurf", "icon": "WS"},
    {"pattern": "copilot", "tool": "GitHub Copilot", "icon": "GH"},
    {"pattern": "kiro", "tool": "Kiro", "icon": "K"},
    {"pattern": "amazonq", "tool": "Q Developer", "icon": "Q"},
    {"pattern": "amazon-q", "tool": "Q Developer", "icon": "Q"},
    {"pattern": "q-cli", "tool": "Q Developer", "icon": "Q"},
    {"pattern": "codewhisperer", "tool": "CodeWhisperer", "icon": "CW"},
    {"pattern": "cline", "tool": "Cline", "icon": "CL"},
    {"pattern": "aider", "tool": "Aider", "icon": "AI"},
    {"pattern": "continue", "tool": "Continue", "icon": "CT"},
    {"pattern": "codex", "tool": "OpenAI Codex", "icon": "OA"},
    {"pattern": "openai", "tool": "OpenAI Tools", "icon": "OA"},
)

# Generic SDK / CLI agents. A match here means "an application called Bedrock", which is
# a legitimate governed workload, not a developer tool finding.
SDK_SIGNATURES: Sequence[Dict[str, str]] = (
    {"pattern": "aws-cli", "tool": "AWS CLI", "icon": "CLI"},
    {"pattern": "boto3", "tool": "Boto3 (SDK)", "icon": "SDK"},
    {"pattern": "botocore", "tool": "Boto3 (SDK)", "icon": "SDK"},
    {"pattern": "aws-sdk-js", "tool": "AWS SDK for JavaScript", "icon": "SDK"},
    {"pattern": "aws-sdk-java", "tool": "AWS SDK for Java", "icon": "SDK"},
    {"pattern": "aws-sdk-go", "tool": "AWS SDK for Go", "icon": "SDK"},
    {"pattern": "aws-sdk-net", "tool": "AWS SDK for .NET", "icon": "SDK"},
    {"pattern": "aws-sdk-ruby", "tool": "AWS SDK for Ruby", "icon": "SDK"},
    {"pattern": "aws-sdk-php", "tool": "AWS SDK for PHP", "icon": "SDK"},
    {"pattern": "langchain", "tool": "LangChain", "icon": "LC"},
    {"pattern": "llamaindex", "tool": "LlamaIndex", "icon": "LI"},
    {"pattern": "strands", "tool": "Strands Agents", "icon": "ST"},
    {"pattern": "bedrock-agentcore", "tool": "Bedrock AgentCore", "icon": "AC"},
    {"pattern": "python-requests", "tool": "python-requests", "icon": "SDK"},
)

# Provider API hostnames. Used ONLY to interpret a DNS/proxy log line that was actually
# observed; never to infer that such a call happened.
PROVIDER_API_DOMAINS: Sequence[Dict[str, str]] = (
    {"domain": "api.anthropic.com", "provider": "Anthropic"},
    {"domain": "api.openai.com", "provider": "OpenAI"},
    {"domain": "generativelanguage.googleapis.com", "provider": "Google Gemini"},
    {"domain": "api.mistral.ai", "provider": "Mistral"},
    {"domain": "api.cohere.ai", "provider": "Cohere"},
    {"domain": "api.groq.com", "provider": "Groq"},
    {"domain": "api.deepseek.com", "provider": "DeepSeek"},
    {"domain": "openrouter.ai", "provider": "OpenRouter"},
    {"domain": "api.x.ai", "provider": "xAI"},
)

# Bedrock CloudTrail event sources. A call recorded against one of these IS a Bedrock
# call — the strongest evidence available today, and available with no new infrastructure.
BEDROCK_EVENT_SOURCES = frozenset({
    "bedrock.amazonaws.com",
    "bedrock-runtime.amazonaws.com",
    "bedrock-agent.amazonaws.com",
    "bedrock-agent-runtime.amazonaws.com",
    "bedrock-agentcore.amazonaws.com",
})

_EC2_INSTANCE_ID = re.compile(r"\bi-[0-9a-f]{8,17}\b")
_VERSION = re.compile(r"/(\d+[\w.\-]*)")


@dataclass(frozen=True)
class ToolIdentity:
    """The outcome of matching a user agent against the signature lists."""

    tool_class: ToolClass
    tool: str
    version: Optional[str]
    icon: str
    evidence: str


def classify_tool(user_agent: Optional[str]) -> ToolIdentity:
    """Identify the caller behind a CloudTrail `userAgent`.

    Coding-tool patterns are checked before SDK patterns, because an agent string can
    contain both — Claude Code shipping through botocore, for instance. The specific
    identity is the useful one.

    An unmatched agent stays `UNIDENTIFIED` with the raw string as its name. The previous
    implementation took `user_agent.split("/")[0]` and presented the result as a
    discovered tool, which turned every SDK caller into a "local agent" finding.
    """
    if not user_agent or not user_agent.strip():
        return ToolIdentity(
            tool_class=ToolClass.UNIDENTIFIED,
            tool="Unknown caller",
            version=None,
            icon="?",
            evidence="No userAgent recorded on the event",
        )

    ua = user_agent.strip()
    lowered = ua.lower()

    for sig in CODING_TOOL_SIGNATURES:
        if sig["pattern"] in lowered:
            return ToolIdentity(
                tool_class=ToolClass.CODING_TOOL,
                tool=sig["tool"],
                version=_extract_version(ua, sig["pattern"]),
                icon=sig["icon"],
                evidence=f"userAgent contains '{sig['pattern']}'",
            )

    for sig in SDK_SIGNATURES:
        if sig["pattern"] in lowered:
            return ToolIdentity(
                tool_class=ToolClass.SDK_CALLER,
                tool=sig["tool"],
                version=_extract_version(ua, sig["pattern"]),
                icon=sig["icon"],
                evidence=f"userAgent contains '{sig['pattern']}' — generic SDK, not a coding tool",
            )

    return ToolIdentity(
        tool_class=ToolClass.UNIDENTIFIED,
        tool=ua[:60],
        version=None,
        icon="?",
        evidence="userAgent matched no known coding tool or SDK signature",
    )


def _extract_version(user_agent: str, pattern: str) -> Optional[str]:
    """Pull the version that follows the matched token, e.g. `claude-cli/2.1.220`.

    Scoped to the matched token on purpose. A blanket "first /version in the string"
    would report botocore's version for a Claude Code call, since real agent strings
    carry several: `claude-cli/2.1.220 md/botocore#1.42.97 os/linux`.
    """
    idx = user_agent.lower().find(pattern)
    if idx < 0:
        return None
    m = _VERSION.match(user_agent[idx + len(pattern):])
    return m.group(1) if m else None


# ──────────────────────────────────────────────────────────────────────────────
# Call path
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CallPathVerdict:
    call_path: CallPath
    provider: Optional[str]
    evidence: str


def classify_call_path(
    event_source: Optional[str] = None,
    dns_domain: Optional[str] = None,
) -> CallPathVerdict:
    """Classify where a call went, from evidence only.

    `event_source` — a CloudTrail event source. One of `BEDROCK_EVENT_SOURCES` proves
    a Bedrock call.

    `dns_domain` — a hostname from a Route 53 Resolver query log or egress proxy record.
    A provider match proves a public-API call. This parameter is the ONLY route to
    `PUBLIC_API`, and nothing populates it until DNS logging is configured — which is
    exactly the point: the classification stays `unknown` rather than becoming a guess.

    Returns `UNKNOWN` when neither is conclusive. Note what is NOT done here: the absence
    of a Bedrock event is not treated as evidence of a public-API call. A tool with no
    observed calls simply may not have run.
    """
    if dns_domain:
        host = dns_domain.strip().rstrip(".").lower()
        for entry in PROVIDER_API_DOMAINS:
            if host == entry["domain"] or host.endswith("." + entry["domain"]):
                return CallPathVerdict(
                    call_path=CallPath.PUBLIC_API,
                    provider=entry["provider"],
                    evidence=f"DNS resolution of {host} ({entry['provider']} public API)",
                )

    if event_source and event_source.strip().lower() in BEDROCK_EVENT_SOURCES:
        return CallPathVerdict(
            call_path=CallPath.BEDROCK,
            provider="AWS Bedrock",
            evidence=f"CloudTrail event source {event_source.strip().lower()}",
        )

    if dns_domain:
        return CallPathVerdict(
            call_path=CallPath.UNKNOWN,
            provider=None,
            evidence=f"DNS resolution of {dns_domain} matched no known AI provider",
        )

    return CallPathVerdict(
        call_path=CallPath.UNKNOWN,
        provider=None,
        evidence="No Bedrock event and no DNS/proxy evidence — call path not observable",
    )


# ──────────────────────────────────────────────────────────────────────────────
# Host attribution
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class HostAttribution:
    """Which host a call came from, and how confidently."""

    host_id: Optional[str]
    """An EC2 instance id when one could be established, else None."""

    source_ip: Optional[str]
    evidence: str


def attribute_host(
    user_identity: Optional[dict] = None,
    source_ip: Optional[str] = None,
    ip_to_instance: Optional[Dict[str, str]] = None,
) -> HostAttribution:
    """Establish the calling host from a CloudTrail identity, then from its source IP.

    Two independent signals, strongest first:

    1. **Instance-profile session name.** A call from an EC2 instance role has an ARN
       whose session name is the instance id (`.../MyRole/i-0123456789abcdef0`). This is
       exact.
    2. **Source IP → instance.** Matched against a private-IP map built from SSM/EC2.
       Weaker: NAT and shared egress make public IPs ambiguous, so only supply a map of
       addresses you actually control.

    Returns `host_id=None` when neither resolves. That is what makes the caller emit
    `UNKNOWN_HOST` rather than quietly attributing the call to an inventoried host.
    """
    if user_identity:
        for key in ("arn", "principalId"):
            value = user_identity.get(key)
            if isinstance(value, str):
                m = _EC2_INSTANCE_ID.search(value)
                if m:
                    return HostAttribution(
                        host_id=m.group(0),
                        source_ip=source_ip,
                        evidence=f"EC2 instance role session name in userIdentity.{key}",
                    )
        session = (user_identity.get("sessionContext") or {}).get("sessionIssuer") or {}
        arn = session.get("arn")
        if isinstance(arn, str):
            m = _EC2_INSTANCE_ID.search(arn)
            if m:
                return HostAttribution(
                    host_id=m.group(0),
                    source_ip=source_ip,
                    evidence="EC2 instance id in userIdentity.sessionContext.sessionIssuer.arn",
                )

    if source_ip and ip_to_instance:
        instance = ip_to_instance.get(source_ip.strip())
        if instance:
            return HostAttribution(
                host_id=instance,
                source_ip=source_ip,
                evidence=f"sourceIPAddress {source_ip} matches inventoried private IP of {instance}",
            )

    return HostAttribution(
        host_id=None,
        source_ip=source_ip,
        evidence=(
            f"No instance id in the calling identity and sourceIPAddress {source_ip} "
            "is not an inventoried host"
            if source_ip
            else "No instance id in the calling identity and no source IP recorded"
        ),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Install provenance
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InstallVerdict:
    install: InstallProvenance
    evidence: str


# Execution environments AWS provisions itself. A user agent carrying one of these tokens
# came from managed infrastructure, so there is no endpoint to inventory and nothing a
# developer could have hand-installed.
EXEC_ENV_SIGNATURES: Sequence[Dict[str, str]] = (
    {"pattern": "aws_lambda", "runtime": "AWS Lambda"},
    {"pattern": "aws-lambda", "runtime": "AWS Lambda"},
    {"pattern": "aws_ecs_fargate", "runtime": "ECS on Fargate"},
    {"pattern": "aws_ecs", "runtime": "Amazon ECS"},
    {"pattern": "aws_bedrock_agentcore", "runtime": "Bedrock AgentCore"},
    {"pattern": "aws_sagemaker", "runtime": "SageMaker"},
    {"pattern": "aws_app_runner", "runtime": "App Runner"},
    {"pattern": "aws_codebuild", "runtime": "CodeBuild"},
)


def detect_exec_env(user_agent: Optional[str]) -> Optional[str]:
    """Return the AWS-managed runtime named in a user agent, if any.

    Real strings carry it explicitly, e.g.
    `Boto3/1.42.97 … exec-env/AWS_Lambda_python3.12 …`. Matching on the token rather than
    the whole string keeps this from firing on an arbitrary mention of "lambda".
    """
    if not user_agent:
        return None
    lowered = user_agent.lower()
    if "exec-env/" not in lowered:
        return None
    fragment = lowered.split("exec-env/", 1)[1]
    for sig in EXEC_ENV_SIGNATURES:
        if fragment.startswith(sig["pattern"]):
            return sig["runtime"]
    return None


def classify_install(
    host_id: Optional[str],
    managed_hosts: Optional[Set[str]],
    host_applications: Optional[Dict[str, Set[str]]] = None,
    tool: Optional[str] = None,
    exec_env: Optional[str] = None,
) -> InstallVerdict:
    """Classify how a tool got onto its host.

    `managed_hosts` — instance ids under endpoint management (SSM `describe_instance_
    information`). `None` means the inventory could not be read AT ALL, which is different
    from an empty set: an empty set is a measured "nothing is managed", `None` is "we do
    not know". Both yield `UNKNOWN_HOST`, but with different evidence, and the caller's
    coverage figures distinguish them.

    `host_applications` — instance id -> installed package names, from SSM `AWS:Application`
    inventory. Absent (or absent for this host) means package-level provenance is
    unavailable, so a managed host can only be reported as `MANAGED` at host level.

    The important asymmetry: a tool ABSENT from a package inventory we successfully read is
    evidence of a hand install (`SELF_INSTALLED`). A tool absent because we never read any
    inventory is not evidence of anything.
    """
    # Checked before the host logic, because a serverless caller HAS no host and looking
    # for one would file managed infrastructure as a blind spot.
    if exec_env:
        return InstallVerdict(
            install=InstallProvenance.MANAGED_RUNTIME,
            evidence=(
                f"Runs in {exec_env}, an AWS-managed execution environment — provisioned from a "
                "deployment package, so there is no endpoint to enrol and nothing hand-installed"
            ),
        )

    if not host_id:
        return InstallVerdict(
            install=InstallProvenance.UNKNOWN_HOST,
            evidence="Call could not be attributed to a host, so install source is unobservable",
        )

    if managed_hosts is None:
        return InstallVerdict(
            install=InstallProvenance.UNKNOWN_HOST,
            evidence=f"Endpoint inventory unavailable, so {host_id} cannot be checked",
        )

    if host_id not in managed_hosts:
        return InstallVerdict(
            install=InstallProvenance.UNKNOWN_HOST,
            evidence=f"{host_id} is not under endpoint management — no install visibility",
        )

    apps = (host_applications or {}).get(host_id)
    if apps is None:
        return InstallVerdict(
            install=InstallProvenance.MANAGED,
            evidence=(
                f"{host_id} is under endpoint management; package inventory not collected, "
                "so this is host-level only and does not confirm the tool itself is managed"
            ),
        )

    if tool and _tool_in_applications(tool, apps):
        return InstallVerdict(
            install=InstallProvenance.MANAGED,
            evidence=f"{host_id} is managed and '{tool}' appears in its package inventory",
        )

    return InstallVerdict(
        install=InstallProvenance.SELF_INSTALLED,
        evidence=(
            f"{host_id} is managed and its package inventory was read, but '{tool}' is "
            f"absent from {len(apps)} inventoried packages — hand-installed"
        ),
    )


def _tool_in_applications(tool: str, applications: Iterable[str]) -> bool:
    """Match a display tool name against inventoried package names.

    Package names rarely equal display names ("Claude Code" ships as `claude-code`), so
    compare on a normalised token basis rather than exact equality.
    """
    needle = re.sub(r"[^a-z0-9]+", "", tool.lower())
    if not needle:
        return False
    for app in applications:
        haystack = re.sub(r"[^a-z0-9]+", "", (app or "").lower())
        if not haystack:
            continue
        if needle in haystack or haystack in needle:
            return True
    return False


# ──────────────────────────────────────────────────────────────────────────────
# Coverage
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class CoverageRatio:
    """A measured fraction of the estate, with the denominator kept.

    `pct` is `None` when the denominator is zero. Not `0.0` — "no hosts exist" and "no
    hosts are covered" are different statements, and rendering the first as 0% invites
    the reader to see a failing control where there is nothing to control.
    """

    covered: int
    total: int
    label: str
    unit: str = "hosts"
    note: Optional[str] = None

    @property
    def pct(self) -> Optional[float]:
        if self.total <= 0:
            return None
        return round((self.covered / self.total) * 100, 1)

    @property
    def complete(self) -> bool:
        """True only when a real denominator is fully covered."""
        return self.total > 0 and self.covered >= self.total


@dataclass
class ProvenanceCoverage:
    """How much of the estate could have produced a finding at all.

    Ships beside every provenance count. Without it a count is unreadable: zero findings
    from 0% coverage and zero findings from full coverage are opposite conclusions drawn
    from an identical number.
    """

    endpoint: CoverageRatio
    """Hosts under endpoint management / hosts known to exist. Gates install provenance."""

    dns: CoverageRatio
    """VPCs with resolver query logging / VPCs total. Gates `public_api` entirely."""

    call_path: CoverageRatio
    """Observed calls with a determined path / calls observed."""

    package_inventory: CoverageRatio
    """Managed hosts with package inventory / managed hosts. Gates tool-level provenance."""

    unattributed_callers: int = 0
    """Observed callers that resolved to no host at all.

    Exists to defuse a specific misreading. The endpoint ratio counts EC2 instances,
    because that is the only host population AWS can enumerate — but developer machines
    are not EC2. So "2 of 2 hosts managed, 100%" can sit directly beside a caller marked
    `unknown_host`, and a reader would reasonably conclude the estate is fully covered
    when in fact none of the observed calls came from a host in that denominator.
    """

    @property
    def blind_spots(self) -> List[str]:
        """Plain statements of what the current signal set cannot answer.

        Rendered verbatim in the UI. The point is that a reader should never have to infer
        a limitation from a suspiciously clean number.
        """
        out: List[str] = []
        if self.dns.covered == 0:
            out.append(
                "No DNS query logging: calls to vendor public APIs (api.anthropic.com, "
                "api.openai.com, …) cannot be seen at all, so public_api is never reported. "
                "A tool using one is missing from these counts entirely, not counted as unknown."
            )
        elif not self.dns.complete:
            out.append(
                f"DNS query logging covers {self.dns.covered} of {self.dns.total} VPCs — "
                "public-API use outside those VPCs is invisible."
            )
        if self.endpoint.total == 0:
            out.append("No hosts inventoried, so no install can be classified as managed or self-installed.")
        elif not self.endpoint.complete:
            out.append(
                f"Endpoint management covers {self.endpoint.covered} of {self.endpoint.total} "
                "known hosts — installs on the rest are unobservable."
            )
        if self.unattributed_callers > 0:
            # Stated whenever any caller is unattributed, and worded hardest when the
            # endpoint ratio is complete, because that is when the number is most
            # flattering and most misleading.
            qualifier = (
                f"{self.endpoint.covered} of {self.endpoint.total} EC2 hosts are managed, but "
                if self.endpoint.total > 0 else ""
            )
            out.append(
                f"{qualifier}{self.unattributed_callers} observed caller(s) could not be tied to "
                "any inventoried host, so their installs are unclassifiable. The endpoint "
                "percentage covers EC2 instances only — developer machines are not EC2, so it is "
                "not a measure of coverage over the hosts that actually made these calls."
            )
        if self.endpoint.covered > 0 and self.package_inventory.covered == 0:
            out.append(
                "No package inventory on managed hosts, so 'managed' is host-level only and "
                "a hand-installed tool on a managed host looks the same as a deployed one."
            )
        out.append(
            "Nothing here covers a developer laptop off the corporate network. That needs an "
            "endpoint agent or MDM; cloud telemetry cannot answer it."
        )
        return out


# ──────────────────────────────────────────────────────────────────────────────
# Record assembly
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ProvenanceRecord:
    """One (principal, tool) pair with everything known about its provenance."""

    principal: str
    tool: str
    tool_class: ToolClass
    call_path: CallPath
    install: InstallProvenance
    version: Optional[str] = None
    icon: str = "?"
    host_id: Optional[str] = None
    source_ip: Optional[str] = None
    provider: Optional[str] = None
    exec_env: Optional[str] = None
    user_agent: Optional[str] = None
    requests: int = 0
    models: Set[str] = field(default_factory=set)
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    tool_evidence: str = ""
    call_path_evidence: str = ""
    install_evidence: str = ""
    host_evidence: str = ""

    @property
    def is_governed(self) -> bool:
        """True only when the call path is proven to stay inside AWS.

        `unknown` is not governed. It is also not a violation — it is unmeasured, and the
        two must not be merged into a single "not compliant" bucket.
        """
        return self.call_path is CallPath.BEDROCK

    @property
    def needs_attention(self) -> bool:
        """A coding tool whose install cannot be vouched for, or that left AWS.

        Deliberately excludes `SDK_CALLER`: a deployed workload calling Bedrock via boto3
        is a governed application, not shadow developer tooling.
        """
        if self.tool_class is not ToolClass.CODING_TOOL:
            return False
        vouched = {InstallProvenance.MANAGED, InstallProvenance.MANAGED_RUNTIME}
        return self.call_path is CallPath.PUBLIC_API or self.install not in vouched


def summarise(records: Sequence[ProvenanceRecord]) -> Dict[str, Dict[str, int]]:
    """Bucket counts by each dimension.

    Every enum member is pre-seeded at zero so a dimension never silently omits a bucket.
    A missing `unknown` key reads as "no unknowns", which is the opposite of what an absent
    measurement means.
    """
    by_call_path = {member.value: 0 for member in CallPath}
    by_install = {member.value: 0 for member in InstallProvenance}
    by_tool_class = {member.value: 0 for member in ToolClass}

    for rec in records:
        by_call_path[rec.call_path.value] += 1
        by_install[rec.install.value] += 1
        by_tool_class[rec.tool_class.value] += 1

    return {
        "by_call_path": by_call_path,
        "by_install_provenance": by_install,
        "by_tool_class": by_tool_class,
    }
