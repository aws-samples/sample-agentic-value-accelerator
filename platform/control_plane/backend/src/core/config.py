"""
Configuration settings for Control Plane backend
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
import os


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
    AWS_REGION: str = Field(default="us-east-1")

    # FSI Foundry SSO — shared HMAC secret. AVA backend signs handoff tokens
    # AFTER real Cognito RS256 verification succeeds; each FSI app's edge
    # verifies the HMAC with the same secret. Empty disables the endpoint.
    FSI_APP_SIGNING_SECRET: str = Field(default="", description="HMAC secret for FSI Foundry SSO handoff tokens")
    DEPLOYMENTS_TABLE_NAME: str = Field(default="fsi-control-plane-deployments")
    GUARDRAILS_TABLE_NAME: str = Field(default="fsi-control-plane-guardrails")
    POLICIES_TABLE_NAME: str = Field(default="")
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
    GOVERN_CONFORMANCE_TABLE_NAME: str = Field(default="fsi-control-plane-govern-conformance")
    GOVERN_GRADUATION_TABLE_NAME: str = Field(default="fsi-control-plane-govern-graduation")
    GOVERN_SR26_TABLE_NAME: str = Field(default="fsi-control-plane-govern-sr26")
    GOVERN_ENFORCEMENT_TABLE_NAME: str = Field(default="fsi-control-plane-govern-enforcement")
    GOVERN_A2A_TRUST_TABLE_NAME: str = Field(default="fsi-control-plane-govern-a2a-trust")
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
        # IPv6 loopback — Vite dev server binds ::1, so a browser opened at
        # http://[::1]:5173 sends that as the Origin. Without this, cost/govern
        # API calls fail CORS and the UI shows the "unavailable" fallback.
        "http://[::1]:5173", "http://[::1]:5174",
    ]

    # Infrastructure
    CONTROL_PLANE_VPC_ID: str = Field(default="", description="Control plane VPC ID for foundation stack reuse")

    # Templates
    TEMPLATES_DIR: str = Field(default="templates", description="Templates directory path")
    REFERENCE_IMPLEMENTATIONS_DIR: str = Field(default="", description="Reference implementations directory path")

    # FSI Foundry
    FOUNDRY_OFFERINGS_PATH: str = Field(default="", description="Path to FSI Foundry offerings.json")
    FOUNDRY_IAC_PATH: str = Field(default="", description="Path to FSI Foundry IaC foundations directory")
    FOUNDRY_SRC_PATH: str = Field(default="", description="Path to FSI Foundry foundations source")
    FOUNDRY_USE_CASES_PATH: str = Field(default="", description="Path to FSI Foundry use cases")
    FOUNDRY_DOCKER_PATH: str = Field(default="", description="Path to FSI Foundry Docker files")
    FOUNDRY_UI_PATH: str = Field(default="", description="Path to FSI Foundry per-use-case UI directory")
    FRONTIER_AGENTS_REGISTRY_PATH: str = Field(default="", description="Path to the Frontier Agents catalog JSON")
    FRONTIER_AGENTS_PATH: str = Field(default="", description="Path to the Frontier Agents source tree (iac/ lives under {id}/iac/{type}/)")

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
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

        # Resolve foundry source, use cases, and docker paths
        fsi_root = Path(self.FOUNDRY_IAC_PATH).parent.parent  # foundations/iac -> foundations -> fsi_foundry root
        docker_root = "/app/fsi_foundry" if os.path.exists("/app/fsi_foundry") else str(fsi_root)

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
