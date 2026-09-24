"""
Configuration settings for Control Plane backend
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
import logging
import os

logger = logging.getLogger(__name__)

# Environments where the auth bypass is a convenience rather than a hole. Anything
# not in this set - including an unrecognised value, which is the case that matters -
# gets real Cognito verification.
_DEV_ENVIRONMENTS = frozenset({"development", "dev", "local", "test"})


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Control Plane API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = Field(default="development", description="Runtime environment: development, staging, production")
    USE_DEV_AUTH: bool = Field(default=True, description="Use development auth bypass (skips Cognito JWT validation)")

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./control_plane.db",
        description="PostgreSQL connection string"
    )
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # AWS
    AWS_REGION: str = Field(default="us-east-1", description="Control-plane region: AVA's own DynamoDB tables + infra")
    # Default is EMPTY, meaning "not configured - follow AWS_REGION". It used to be the
    # literal "us-east-1", which is a fact about one demo account and not a sane default for
    # anyone else. That literal made region_config._fallback()'s documented
    # `GOVERN_AWS_REGION -> AWS_REGION` chain unreachable: the setting was never empty, so a
    # deployer who set only AWS_REGION=eu-west-1 got a control plane in eu-west-1 and a
    # governed fleet still read from us-east-1. Bedrock/CloudWatch/CloudTrail/Service Quotas
    # are all per-region and none of them errors on the wrong region - they answer 200 with
    # that region's (empty) inventory. So the symptom was an empty AI estate under a Live
    # badge, with no exception to catch and no note to render.
    #
    # __init__ resolves empty -> AWS_REGION, so every consumer still reads a non-empty
    # region. That matters: boto3.client(region_name="") is not a soft failure, it raises
    # ValueError("Invalid endpoint: https://sts..amazonaws.com") at construction. Verified
    # in the backend container against botocore's endpoint resolver.
    GOVERN_AWS_REGION: str = Field(
        default="",
        description="Primary region where governed Bedrock/AgentCore resources live (agents, workload identities, gateways). Distinct from AWS_REGION; set it only when the governed fleet is NOT in AWS_REGION. Empty means follow AWS_REGION. Also the fallback when the governed-region set is empty.",
    )
    # Derived in __init__, never set by a deployer: whether GOVERN_AWS_REGION was declared
    # explicitly, as opposed to filled in from AWS_REGION. The distinction is load-bearing
    # exactly once, in litellm._default_inference_region(), whose documented precedence is
    # explicit GOVERN_AWS_REGION > persisted governed set > AWS_REGION. Without this flag the
    # fill would make GOVERN_AWS_REGION always non-empty, the governed-set branch would be
    # dead, and a deployer who governs eu-west-1 from a us-east-2 control plane would have
    # customer prompts routed to us-east-2 - the tier-1 mistake this file warns about, with
    # no literal left to grep for. Any env value is overwritten.
    GOVERN_AWS_REGION_DECLARED: bool = Field(
        default=False,
        description="Derived, not configurable: True when GOVERN_AWS_REGION was set explicitly rather than defaulted from AWS_REGION.",
    )
    GOVERN_REGIONS_CONFIG_PATH: str = Field(
        default="/app/data/governed_regions.json",
        description="Path to the persisted governed-region set for multi-region governance. Bind-mount this dir so the set survives container recreation.",
    )
    CONTROL_PLANE_TABLE_REGION: str = Field(
        default="",
        description=(
            "Home region for AVA's own control-plane DynamoDB tables (the *_TABLE_NAME "
            "settings below). Empty means AWS_REGION. A control-plane table has exactly one "
            "home region - these tables are read-write, so reading a union of regions would "
            "produce split-brain writes and duplicate rows. To relocate a single table, set "
            "<PREFIX>_TABLE_REGION (e.g. GUARDRAILS_TABLE_REGION=us-east-1); see "
            "core.region_config.table_region()."
        ),
    )

    # FSI Foundry SSO — shared HMAC secret. AVA backend signs handoff tokens
    # AFTER real Cognito RS256 verification succeeds; each FSI app's edge
    # verifies the HMAC with the same secret. Empty disables the endpoint.
    FSI_APP_SIGNING_SECRET: str = Field(default="", description="HMAC secret for FSI Foundry SSO handoff tokens")
    DEPLOYMENTS_TABLE_NAME: str = Field(default="fsi-control-plane-deployments")
    GUARDRAILS_TABLE_NAME: str = Field(default="fsi-control-plane-guardrails")
    EVALUATIONS_TABLE_NAME: str = Field(default="fsi-control-plane-evaluations")
    # Named, not empty. `fsi-control-plane-policies` is provisioned and ACTIVE in the
    # control-plane region with exactly the pk/sk schema PolicyService writes (verified
    # 2026-09-14: present in us-east-2, absent in us-east-1), and is declared in
    # infrastructure/modules/dynamodb/main.tf. The empty default was not a "not yet
    # provisioned" marker - it was a live failure: PolicyService's own signature already
    # defaulted to this same name, so the route passing this setting OVERRODE a working
    # default with "", and boto3 rejected the resulting Table("") with
    # ParamValidationError the first time it was touched. Region resolves via
    # region_config.table_region("POLICIES"), like every other control-plane table.
    POLICIES_TABLE_NAME: str = Field(
        default="fsi-control-plane-policies",
        description=(
            "DynamoDB table holding local policy metadata (rule configs, Cedar statements, "
            "audit events) that enriches the AgentCore policy list. Empty disables "
            "persistence: the service degrades to AgentCore-only reads instead of failing."
        ),
    )
    POLICY_ENGINE_ID: str = Field(
        default="",
        description="AgentCore Policy Engine ID. Wire from terraform; backend errors on policy CRUD if empty."
    )
    GATEWAY_ID: str = Field(default="")
    GATEWAY_ARN: str = Field(
        default="",
        description="AgentCore Gateway ARN baked into Cedar policy statements. Wire from terraform; backend errors on policy CRUD if empty."
    )
    PRIORITIZATION_TABLE_NAME: str = Field(default="fsi-control-plane-prioritization")
    MATURITY_TABLE_NAME: str = Field(default="fsi-control-plane-maturity")
    BUSINESS_CASES_TABLE_NAME: str = Field(default="fsi-control-plane-business-cases")
    KNOWLEDGE_TABLE_NAME: str = Field(default="fsi-control-plane-knowledge")
    DATALAKE_MCP_IMAGE_URI: str = Field(default="", description="ECR image URI for the data lake MCP server")
    KB_MCP_IMAGE_URI: str = Field(default="", description="ECR image URI for the knowledge base MCP server")
    OPERATING_MODEL_TABLE_NAME: str = Field(default="fsi-control-plane-operating-model")
    ORGANIZATION_DESIGN_TABLE_NAME: str = Field(default="fsi-control-plane-organization-design")
    APP_FACTORY_TABLE_NAME: str = Field(default="fsi-control-plane-app-factory")
    GOVERN_AUDIT_TABLE_NAME: str = Field(default="fsi-control-plane-govern-audit")
    # Renamed from "ava-operations-incidents", which never existed in any region. Every
    # other control-plane table is `fsi-control-plane-*`, and `table_region()` resolves a
    # table's home from its settings prefix, so an off-convention name had no provisioned
    # target and no way to be relocated. The old name is not aliased: nothing was ever
    # written under it, so there is no data to migrate.
    GOVERN_OPERATIONS_TABLE_NAME: str = Field(
        default="fsi-control-plane-govern-operations",
        description="DynamoDB table for Operations Hub data (incidents, alerts, SLAs, changes)"
    )
    GOVERN_COMPLIANCE_TABLE_NAME: str = Field(
        default="fsi-control-plane-govern-compliance",
        description=(
            "DynamoDB table for compliance control attestations and evidence. Previously "
            "hardcoded in the route as 'ava-govern-compliance' in us-east-1, which existed "
            "in neither region, so every attestation lived in process memory and died on "
            "restart. Region resolves via region_config.table_region('GOVERN_COMPLIANCE')."
        ),
    )
    GOVERN_CONFORMANCE_TABLE_NAME: str = Field(default="fsi-control-plane-govern-conformance")
    GOVERN_GRADUATION_TABLE_NAME: str = Field(default="fsi-control-plane-govern-graduation")
    GOVERN_SR26_TABLE_NAME: str = Field(default="fsi-control-plane-govern-sr26")
    GOVERN_ENFORCEMENT_TABLE_NAME: str = Field(default="fsi-control-plane-govern-enforcement")
    GOVERN_A2A_TRUST_TABLE_NAME: str = Field(default="fsi-control-plane-govern-a2a-trust")
    GOVERN_VALIDATION_PANEL_TABLE_NAME: str = Field(default="fsi-control-plane-govern-validation-panel")
    # FinOps cost-allocation tag keys the "Cost by Tag" view offers, when the
    # account's activated tags can't be auto-discovered. Comma-separated; these
    # mirror the taxonomy Plan owns (business_unit/domain/owner) + agent identity.
    GOVERN_COST_TAG_KEYS: str = Field(default="business-unit,business-domain,agent,owner")
    # FinOps per-use-case/model spend store — written by the spend_aggregator from
    # LiteLLM usage. Govern reads it (by-use-case cost) to close the Build→FinOps
    # loop: a deployed use case → its real token spend. Empty until provisioned.
    FINOPS_SPEND_TABLE_NAME: str = Field(default="")
    # Developer AI (Claude Code telemetry) configuration
    DEVELOPER_AI_NAMESPACE: str = Field(
        default="claude_code",
        description="CloudWatch namespace for OpenTelemetry developer AI metrics"
    )
    DEVELOPER_AI_APPROVED_TOOLS: str = Field(
        default="claude-code",
        description="Comma-separated list of approved AI coding tools (e.g., claude-code,cursor)"
    )
    DEVELOPER_AI_APPROVED_DOMAINS: str = Field(
        default="",
        description="Comma-separated email domains approved for AI tool access (empty = no domain restriction)"
    )
    DEVELOPER_AI_SPEND_SPIKE_THRESHOLD: float = Field(
        default=2.0,
        description="Anomaly threshold: current spend rate >= N x baseline triggers spend-spike alert"
    )
    DEVELOPER_AI_RUNAWAY_TOKEN_RATE: int = Field(
        default=100000,
        description="Anomaly threshold: hourly token rate above this triggers runaway-loop alert"
    )
    SERVICE_APPROVAL_TABLE_NAME: str = Field(
        default="",
        description="DynamoDB table for service-approval (service onboarding) runs"
    )
    SERVICE_APPROVAL_BUCKET: str = Field(
        default="",
        description="S3 bucket holding service-approval per-phase artifacts"
    )
    SERVICE_APPROVAL_AGENT_RUNTIME_ARN: str = Field(
        default="",
        description="AgentCore Runtime ARN. Backend's create_run invokes this directly — Path B is the only execution path post-Phase B decommission."
    )
    SERVICE_APPROVAL_LOCAL_ROOT: str = Field(
        default="",
        description="Local filesystem root for the dev simulator (used when DDB/S3 are not configured)"
    )
    S3_DELIVERY_BUCKET: str = Field(default="fsi-control-plane-deployments")
    ADVPO_BUCKET: str = Field(
        default="",
        description="S3 bucket for advanced prompt optimization eval datasets and results"
    )
    S3_BUCKET_NAME: str = Field(
        default="",
        description="S3 bucket for project archives (falls back to PROJECT_ARCHIVES_BUCKET)"
    )
    PROJECT_ARCHIVES_BUCKET: str = Field(default="", description="Project archives S3 bucket")
    STATE_MACHINE_ARN: str = Field(
        default="",
        description="Step Functions state machine ARN for deployment pipeline"
    )
    FRONTIER_AGENTS_STATE_MACHINE_ARN: str = Field(
        default="",
        description="Step Functions state machine ARN for the Frontier Agents (AaaS) pipeline"
    )
    HARNESS_EXECUTION_ROLE_ARN: str = Field(
        default="",
        description="AgentCore Harness execution role ARN. Backend passes this on CreateHarness so users don't have to hand-roll the docs-sample IAM policy. Auto-provisioned by the harness_execution_role Terraform module."
    )
    MCP_SERVERS_TABLE_NAME: str = Field(
        default="",
        description="DDB table for the MCP Servers registry (Build > MCP Servers page)."
    )
    A2A_AGENTS_TABLE_NAME: str = Field(
        default="",
        description="DDB table for the A2A Agents registry (Build > A2A Agents page)."
    )
    IDENTITY_PROVIDERS_TABLE_NAME: str = Field(
        default="",
        description="DDB table for the Identity Providers registry (Secure > Identity page)."
    )
    APPROVAL_POLICIES_TABLE_NAME: str = Field(
        default="",
        description="DDB table for Approval Policies (Secure > Approval Policies page)."
    )
    APPROVAL_REQUESTS_TABLE_NAME: str = Field(
        default="",
        description="DDB table for Approval Requests / Approval Queue (Operate > Approval Queue page)."
    )
    GOVERN_MARKETPLACE_TABLE_NAME: str = Field(
        default="fsi-control-plane-govern-marketplace",
        description="DDB table for Marketplace listings and subscriptions (Govern > Marketplace)."
    )

    # AWS Agent Registry (control plane) — provisioned once per environment.
    # The registry itself is owned in-account (not by Terraform yet — the
    # `aws_agent_registry_registry` TF resource doesn't exist as of the
    # boto3 1.43.67 release). Values here are wired via `AGENT_REGISTRY_*`
    # env vars set by the ECS task definition after a one-off create-registry
    # bootstrap. Backend routes wrap `agent-registry-control` boto3 calls
    # against this ID for CRUD on registry records.
    AGENT_REGISTRY_ID: str = Field(
        default="",
        description="AWS Agent Registry ID (e.g. '4h0JCw88RghhrH3v'). The 'AVA' registry that publishes managed AVA resources for cross-team discovery."
    )
    AGENT_REGISTRY_ARN: str = Field(
        default="",
        description="AWS Agent Registry ARN. Full ARN of the AVA registry — same resource as AGENT_REGISTRY_ID, ARN form for cross-account references and IAM policy conditions."
    )
    AGENT_REGISTRY_NAME: str = Field(
        default="AVA",
        description="Display name of the primary registry. Backend bootstrap creates the registry with this name if AGENT_REGISTRY_ID is empty."
    )

    # Cognito
    COGNITO_USER_POOL_ID: str = Field(
        default="",
        description="Cognito user pool ID"
    )
    COGNITO_CLIENT_ID: str = Field(
        default="",
        description="Cognito client ID"
    )
    COGNITO_REGION: str = Field(default="us-east-1")

    # API
    API_PREFIX: str = "/api/v1"
    ROOT_PATH: str = Field(default="", description="Root path for API (e.g., /dev for API Gateway stage)")
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173", "http://localhost:5174", "http://localhost:3000",
        "http://localhost:3001", "http://localhost:3002", "http://localhost:3003",
        "http://localhost:3004", "http://localhost:3005", "http://localhost:3006",
        "http://127.0.0.1:3005", "http://127.0.0.1:5173", "http://127.0.0.1:3000",
        # IPv6 loopback — Vite dev server binds ::1, so a browser opened at
        # http://[::1]:5173 sends that as the Origin. Without this, cost/govern
        # API calls fail CORS and the UI shows the "unavailable" fallback.
        "http://[::1]:5173", "http://[::1]:5174",
        "http://[::1]:3000", "http://[::1]:3005",
    ]

    # Infrastructure
    CONTROL_PLANE_VPC_ID: str = Field(default="", description="Control plane VPC ID for foundation stack reuse")

    # Templates
    TEMPLATES_DIR: str = Field(default="templates", description="Templates directory path")
    REFERENCE_IMPLEMENTATIONS_DIR: str = Field(default="", description="Reference implementations directory path")

    # Transformation Value Model (Reference Catalog)
    TRANSFORMATION_SEED_PATH: str = Field(default="", description="Path to the transformation reference seed.json")
    TRANSFORMATION_SEED_ON_STARTUP: bool = Field(default=True, description="Import the reference seed at startup (idempotent — gated by catalog_meta seed_applied latch)")

    # FSI Foundry
    FOUNDRY_OFFERINGS_PATH: str = Field(default="", description="Path to FSI Foundry offerings.json")
    FOUNDRY_IAC_PATH: str = Field(default="", description="Path to FSI Foundry IaC foundations directory")
    FOUNDRY_SRC_PATH: str = Field(default="", description="Path to FSI Foundry foundations source")
    FOUNDRY_USE_CASES_PATH: str = Field(default="", description="Path to FSI Foundry use cases")
    FOUNDRY_DOCKER_PATH: str = Field(default="", description="Path to FSI Foundry Docker files")
    FOUNDRY_UI_PATH: str = Field(default="", description="Path to FSI Foundry per-use-case UI directory")
    FRONTIER_AGENTS_REGISTRY_PATH: str = Field(default="", description="Path to the Frontier Agents catalog JSON")
    FRONTIER_AGENTS_PATH: str = Field(default="", description="Path to the Frontier Agents source tree (iac/ lives under {id}/iac/{type}/)")

    # LiteLLM gateway
    #
    # These five were referenced by api/routes/litellm.py and declared nowhere. Two of them
    # are read in a CLASS BODY at import time, so `import api.routes.litellm` raised
    # AttributeError: 'Settings' object has no attribute 'LITELLM_DEFAULT_RPM_LIMIT' - the
    # module was not importable at all. It went unnoticed because its router is never
    # mounted: api/routes/__init__.py imports llm_gateway_router from the separate
    # llm_gateway.py module, and /api/v1/gateway/* returns 404. So this was a latent startup
    # crash waiting for whoever first wired the router up.
    #
    # Declared here rather than by deleting the module, and the router is deliberately still
    # NOT mounted - making dead code importable is a bug fix, exposing new endpoints is a
    # product decision.
    #
    # Two of these are already supplied to the container (LITELLM_MASTER_KEY,
    # LITELLM_GATEWAY_URL) and were being silently discarded, because pydantic-settings
    # ignores env vars with no matching field. Operator-supplied configuration that the app
    # cannot see is the same failure shape as the region bugs this branch is about: no error,
    # just a default quietly standing in for what someone actually configured.
    #
    # LITELLM_LOCAL_CONFIG_PATH is deliberately NOT declared here even though the container
    # sets it. llm_gateway.py:332 reads it with os.getenv() and works; adding a Settings field
    # nothing reads would give one env var two sources of truth, which is the hazard this
    # branch exists to remove rather than reproduce.
    LITELLM_GATEWAY_URL: str = Field(default="", description="Base URL of the LiteLLM proxy; empty means no gateway is deployed")
    # Injected from Secrets Manager by the ECS task definition (`secrets`/`valueFrom`), so the
    # value resolves at runtime and never lands in an image or a repo. Never log or echo it.
    LITELLM_MASTER_KEY: str = Field(default="", description="LiteLLM admin key, injected at runtime from Secrets Manager; empty means not configured")
    LITELLM_DEFAULT_RPM_LIMIT: int = Field(default=0, description="Default per-key requests-per-minute cap; 0 means unlimited")
    LITELLM_DEFAULT_TPM_LIMIT: int = Field(default=0, description="Default per-key tokens-per-minute cap; 0 means unlimited")
    LITELLM_TEAM_BUDGET_CAP_USD: float = Field(default=0.0, description="Default per-team monthly budget cap in USD; 0 means uncapped")

    # Outbound HTTP
    # Empty by default, and that default is the secure one: core.safe_fetch refuses to
    # fetch a caller-supplied URL that resolves to a private address, which is what stops
    # "validate this OIDC issuer" from becoming "read this VPC-internal admin port".
    #
    # But an on-prem IdP or a VPC-internal A2A peer on 10.x is a legitimate configuration,
    # and with no escape hatch an operator's only options are to give up the feature or to
    # patch the guard out - and they will patch the guard out. So this exists to make the
    # exception narrow, explicit and reviewable: comma-separated CIDRs, opt-in per
    # deployment, named in one place.
    #
    # It can relax private, reserved and CGNAT ranges ONLY. It can never permit loopback,
    # link-local, multicast or the unspecified address, because 169.254.169.254 is the
    # actual target being defended against and no real integration lives there. See
    # safe_fetch._ALLOWLIST_CANNOT_OVERRIDE.
    SAFE_FETCH_ALLOWED_PRIVATE_CIDRS: str = Field(
        default="",
        description=(
            "Comma-separated CIDRs that caller-supplied URLs may resolve to despite being "
            "private (e.g. an on-prem OIDC issuer at 10.20.0.0/16). Empty means public "
            "addresses only. Cannot permit loopback, link-local or multicast."
        ),
    )

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # USE_DEV_AUTH becomes the single answer to "is auth bypassed", folding in DEBUG.
        #
        # core/auth.py used to switch on `USE_DEV_AUTH or DEBUG`, which is two doors to the
        # same room: DEBUG=true alone swapped every route's dependency for dev_auth, whose
        # get_current_user_dev ignores the credential it is handed and returns an admin
        # unconditionally. Resolving it here means there is one place to read, and no way to
        # satisfy one condition while believing you failed the other.
        #
        # The default is True, so the dangerous case is not "someone set this" - it is
        # "nobody set it". A deployment that forgets the variable gets an unauthenticated
        # admin API, and nothing errors, because a bypass that works looks exactly like auth
        # that works. So a non-dev ENVIRONMENT overrides the request rather than trusting it:
        # anyone who genuinely wants the bypass can say ENVIRONMENT=development and mean it.
        #
        # This is deliberately not a no-op for existing deployments:
        #   - docker-compose.yaml sets USE_DEV_AUTH=true and no ENVIRONMENT, so it inherits
        #     the "development" default and keeps working.
        #   - environments/dev/main.tf sets USE_DEV_AUTH=true with environment "dev".
        #   - modules/ecs/main.tf already pins USE_DEV_AUTH=false for real stamps.
        _environment = (self.ENVIRONMENT or "").strip().lower()
        _bypass_requested = self.USE_DEV_AUTH or self.DEBUG
        _bypass_permitted = _environment in _DEV_ENVIRONMENTS
        self.USE_DEV_AUTH = _bypass_requested and _bypass_permitted

        if _bypass_requested and not _bypass_permitted:
            logger.warning(
                "AUTH-GATE: refusing the development auth bypass because ENVIRONMENT=%r is "
                "not one of %s. Cognito JWT verification is ACTIVE. "
                "(USE_DEV_AUTH=%s, DEBUG=%s were both overridden.)",
                self.ENVIRONMENT,
                sorted(_DEV_ENVIRONMENTS),
                _bypass_requested,
                self.DEBUG,
            )
        elif self.USE_DEV_AUTH:
            # Loud on purpose. This line in a log for a real environment is the signal
            # that ENVIRONMENT is set to something it should not be.
            logger.warning(
                "AUTH-GATE: development auth bypass ACTIVE (ENVIRONMENT=%r). Every request "
                "is treated as an authenticated admin. This must never appear in a "
                "customer-facing deployment.",
                self.ENVIRONMENT,
            )

        # Tier 2 default: follow the control-plane region unless the governed fleet was
        # explicitly placed elsewhere. Resolved here rather than in the Field default so the
        # value tracks whatever AWS_REGION a deployer actually set. GOVERN_AWS_REGION_DECLARED
        # is overwritten unconditionally - it is derived state, not an input, so a stray
        # GOVERN_AWS_REGION_DECLARED in the environment cannot forge "explicitly declared".
        _govern_region = (self.GOVERN_AWS_REGION or "").strip()
        self.GOVERN_AWS_REGION_DECLARED = bool(_govern_region)
        self.GOVERN_AWS_REGION = _govern_region or (self.AWS_REGION or "").strip() or "us-east-1"

        # Use TEMPLATES_PATH env var if set (for Docker), otherwise resolve relative to backend dir
        templates_path_env = os.getenv("TEMPLATES_PATH")
        if templates_path_env:
            self.TEMPLATES_DIR = templates_path_env
        elif not os.path.isabs(self.TEMPLATES_DIR):
            # Get backend directory (parent of src/)
            backend_dir = Path(__file__).parent.parent.parent
            self.TEMPLATES_DIR = str((backend_dir / self.TEMPLATES_DIR).resolve())

        # Resolve offerings path
        if not self.FOUNDRY_OFFERINGS_PATH:
            offerings_env = os.getenv("FOUNDRY_OFFERINGS_PATH")
            if offerings_env:
                self.FOUNDRY_OFFERINGS_PATH = offerings_env
            else:
                # Try Docker path first, then local dev path
                docker_path = "/app/fsi_foundry/data/registry/offerings.json"
                if os.path.exists(docker_path):
                    self.FOUNDRY_OFFERINGS_PATH = docker_path
                else:
                    backend_dir = Path(__file__).parent.parent.parent
                    local_path = backend_dir.parent.parent.parent / "applications" / "fsi_foundry" / "data" / "registry" / "offerings.json"
                    self.FOUNDRY_OFFERINGS_PATH = str(local_path)

        # Resolve transformation reference seed path (Docker-aware, mirrors offerings)
        if not self.TRANSFORMATION_SEED_PATH:
            seed_env = os.getenv("TRANSFORMATION_SEED_PATH")
            if seed_env:
                self.TRANSFORMATION_SEED_PATH = seed_env
            else:
                # Dockerfile copies backend/src/ to /app/src/, so the seed sits at /app/src/data/...
                docker_path = "/app/src/data/transformation_value_model/seed.json"
                if os.path.exists(docker_path):
                    self.TRANSFORMATION_SEED_PATH = docker_path
                else:
                    backend_dir = Path(__file__).parent.parent.parent
                    local_path = backend_dir / "src" / "data" / "transformation_value_model" / "seed.json"
                    self.TRANSFORMATION_SEED_PATH = str(local_path)

        # Resolve foundry IaC path
        if not self.FOUNDRY_IAC_PATH:
            iac_env = os.getenv("FOUNDRY_IAC_PATH")
            if iac_env:
                self.FOUNDRY_IAC_PATH = iac_env
            else:
                docker_path = "/app/fsi_foundry/foundations/iac"
                if os.path.exists(docker_path):
                    self.FOUNDRY_IAC_PATH = docker_path
                else:
                    backend_dir = Path(__file__).parent.parent.parent
                    local_path = backend_dir.parent.parent.parent / "applications" / "fsi_foundry" / "foundations" / "iac"
                    self.FOUNDRY_IAC_PATH = str(local_path)

        # Resolve foundry source, use cases, and docker paths.
        # A `docker_root` local was computed here and never read. It was also redundant: in
        # the container FOUNDRY_IAC_PATH is /app/fsi_foundry/foundations/iac, so fsi_root is
        # already /app/fsi_foundry, and outside it the expression fell back to str(fsi_root)
        # anyway - both branches produced the value fsi_root already held. Verified in the
        # running container that all five foundry paths resolve and exist without it.
        fsi_root = Path(self.FOUNDRY_IAC_PATH).parent.parent  # foundations/iac -> foundations -> fsi_foundry root

        if not self.FOUNDRY_SRC_PATH:
            self.FOUNDRY_SRC_PATH = os.getenv("FOUNDRY_SRC_PATH", str(fsi_root / "foundations" / "src"))
        if not self.FOUNDRY_USE_CASES_PATH:
            self.FOUNDRY_USE_CASES_PATH = os.getenv("FOUNDRY_USE_CASES_PATH", str(fsi_root / "use_cases"))
        if not self.FOUNDRY_DOCKER_PATH:
            self.FOUNDRY_DOCKER_PATH = os.getenv("FOUNDRY_DOCKER_PATH", str(fsi_root / "foundations" / "docker"))
        if not self.FOUNDRY_UI_PATH:
            self.FOUNDRY_UI_PATH = os.getenv("FOUNDRY_UI_PATH", str(fsi_root / "ui"))

        # Frontier Agents — aaas/frontier_agents/ in the repo. Ships with the backend
        # image at /app/aaas/frontier_agents in Docker.
        if not self.FRONTIER_AGENTS_PATH:
            fa_env = os.getenv("FRONTIER_AGENTS_PATH")
            if fa_env:
                self.FRONTIER_AGENTS_PATH = fa_env
            elif os.path.exists("/app/aaas/frontier_agents"):
                self.FRONTIER_AGENTS_PATH = "/app/aaas/frontier_agents"
            else:
                backend_dir = Path(__file__).parent.parent.parent
                self.FRONTIER_AGENTS_PATH = str(backend_dir.parent / "aaas" / "frontier_agents")

        if not self.FRONTIER_AGENTS_REGISTRY_PATH:
            fa_reg_env = os.getenv("FRONTIER_AGENTS_REGISTRY_PATH")
            if fa_reg_env:
                self.FRONTIER_AGENTS_REGISTRY_PATH = fa_reg_env
            elif os.path.exists("/app/aaas/frontier_agents.json"):
                self.FRONTIER_AGENTS_REGISTRY_PATH = "/app/aaas/frontier_agents.json"
            else:
                self.FRONTIER_AGENTS_REGISTRY_PATH = str(Path(self.FRONTIER_AGENTS_PATH).parent / "frontier_agents.json")


# Global settings instance
settings = Settings()
