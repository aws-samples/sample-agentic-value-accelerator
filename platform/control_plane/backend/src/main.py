"""
Control Plane FastAPI Application
Main entry point for the backend API
"""
# Reload trigger: 2026-08-10T14:58

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
import logging

from core.config import settings
from core.database import init_db

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# ASGI middleware to strip ROOT_PATH prefix
class StripPathPrefixMiddleware:
    def __init__(self, app: ASGIApp, prefix: str):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http" and self.prefix:
            path = scope["path"]
            if path.startswith(self.prefix):
                scope["path"] = path[len(self.prefix):]
                if not scope["path"]:
                    scope["path"] = "/"
                logger.info(f"Stripped prefix: {path} -> {scope['path']}")
        await self.app(scope, receive, send)

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """
    Initialize application on startup
    """
    logger.info("Starting Control Plane API...")

    # State the resolved region tiers before anything reads AWS. Deliberately first: every
    # log line after this one is easier to read once you know which regions produced it, and
    # a wrong governed-fleet region is the one misconfiguration here that never raises - AWS
    # answers the wrong region with that region's inventory, so the symptom is an AI estate
    # of zero rather than an error. See core/region_config.log_resolution().
    try:
        from core.region_config import log_resolution
        log_resolution()
    except Exception as e:
        logger.warning(f"Region resolution report failed (non-fatal): {e}")

    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

    # Import the transformation reference catalog seed on FIRST boot only. The
    # import is gated on a persisted "seed_applied" latch (catalog_meta) so that
    # a user who empties the catalog ("start from scratch") or prunes individual
    # seed rows does not get them silently re-created on the next restart.
    # Re-seeding after that is an explicit user action via the lifecycle API.
    from core.config import settings as _settings
    if _settings.TRANSFORMATION_SEED_ON_STARTUP:
        try:
            from core.database import SessionLocal
            from services.seed_importer import run_seed_import
            from services import catalog_meta
            db = SessionLocal()
            try:
                if catalog_meta.is_seed_applied(db):
                    logger.info(
                        "Reference catalog seed already applied (mode=%s) — skipping "
                        "startup import to preserve user changes.",
                        catalog_meta.get_mode(db),
                    )
                else:
                    report = run_seed_import(db, _settings.TRANSFORMATION_SEED_PATH)
                    catalog_meta.mark_seed_applied(db, commit=False)
                    catalog_meta.set_mode(db, catalog_meta.MODE_EXAMPLES, commit=False)
                    db.commit()
                    logger.info(
                        "Reference catalog seed: %s entities, %s relationships imported",
                        report.total_entities, report.total_relationships,
                    )
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Reference catalog seed import failed (continuing): {e}")

    # Seed Approval Policies defaults — turns Approval Policies from
    # UI-only into operational. Idempotent by name; safe to run every
    # boot. Failures are logged, not raised, so a partial DDB outage
    # doesn't block the whole API surface.
    try:
        from services.approval_policy_bootstrap import seed_defaults
        result = seed_defaults()
        logger.info(f"approval_policy_bootstrap result: {result}")
    except Exception as e:
        logger.warning(f"approval_policy_bootstrap failed (non-fatal): {e}")

    # Keep the Govern dashboard AWS-backed caches hot so the first (and idle-then-return)
    # load is fast instead of showing a ~40s cold "Degraded Mode" window. Best-effort,
    # runs in a daemon thread; never blocks startup or request handling.
    try:
        from core.cache_prewarm import start_prewarmer
        start_prewarmer()
    except Exception as e:
        logger.warning(f"Govern cache pre-warmer failed to start (non-fatal): {e}")

    # Publish REAL, telemetry-derived LLM-quality metrics into the AVA/LLMQuality
    # CloudWatch namespace so the Govern "LLM Quality" dashboard reads live values
    # instead of mock fallbacks. Best-effort daemon thread that only publishes the
    # dimensions whose source signal (Bedrock evals / guardrails / invocation logs)
    # is actually live each cycle. Never blocks startup or request handling.
    try:
        from core.llm_quality_producer import start_llm_quality_producer
        start_llm_quality_producer()
    except Exception as e:
        logger.warning(f"LLM quality producer failed to start (non-fatal): {e}")

    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} started")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Cleanup on application shutdown
    """
    logger.info("Shutting down Control Plane API...")


@app.get("/")
async def root():
    """
    Root endpoint

    Returns:
        API information
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


# Add stage-prefixed routes for API Gateway (e.g., /dev, /prod, /staging)
if settings.ROOT_PATH:
    @app.get(f"{settings.ROOT_PATH}/test")
    async def test_stage():
        return {"message": "stage test endpoint works", "ROOT_PATH": settings.ROOT_PATH}

    @app.get(f"{settings.ROOT_PATH}/ping")
    async def ping_stage():
        return {"message": "pong"}

    @app.get(f"{settings.ROOT_PATH}/")
    async def root_stage():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "ROOT_PATH": settings.ROOT_PATH
        }

    @app.get(f"{settings.ROOT_PATH}/health")
    async def health_stage():
        """Health check endpoint with stage prefix"""
        return {
            "status": "healthy",
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION
        }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc):
    """
    Global exception handler

    Args:
        request: FastAPI request
        exc: Exception

    Returns:
        JSON error response
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    response = JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if settings.DEBUG else "An error occurred"
        }
    )
    # Ensure CORS headers are present on error responses
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
    return response


# Import and include routers
from api.routes import projects_router, langfuse_router, health_router, templates_router, bootstrap_router, deployments_router, applications_router, app_factory_router, users_router, codecommit_router, frontier_agents_router, harness_router, catalog_router, memory_router, mcp_router, a2a_router, identity_providers_router, approval_policies_router, approval_requests_router, skills_router, agents_router, custom_resources_router, guardrails_router, policies_router, llm_gateway_router, prioritization_router, maturity_router, business_cases_router, knowledge_router, operating_model_router, organization_design_router, transformation_value_model_router, service_approval_router, advpo_router, govern_audit_router, govern_conformance_router, govern_graduation_router, govern_sr26_router, govern_enforcement_router, govern_a2a_trust_router, govern_cost_router, govern_models_router, govern_posture_router, govern_evals_router, evaluations_router, govern_risk_posture_router, govern_trail_router, govern_security_router, govern_agentcore_router, govern_guardrails_router, govern_invocation_safety_router, govern_regions_router, govern_data_sources_router, govern_data_catalog_router, fsi_sso_router, govern_fleet_router, govern_compliance_router, govern_sagemaker_router, govern_controls_router, govern_developer_ai_router, govern_guardduty_ai_router, govern_aidlc_router, govern_harness_audit_router, govern_validation_router, govern_harness_policy_router, govern_policy_drift_router, govern_posture_score_router, govern_compliance_evidence_router, govern_llm_quality_router, govern_path_jail_router, govern_capacity_router, govern_iam_router, govern_operations_router, govern_marketplace_router, govern_command_center_router, govern_knowledge_bases_router, govern_xray_router, govern_bedrock_assets_router, govern_security_lake_router, govern_audit_manager_router, govern_governance_router, govern_ctlake_router, govern_macie_router, govern_cost_resource_router, govern_invocations_router, govern_resource_tags_router, govern_trusted_advisor_router, govern_service_quotas_router, govern_compute_optimizer_router, govern_verified_permissions_router, govern_health_router, multicloud_router

# Include routers
app.include_router(projects_router, prefix=settings.API_PREFIX)
app.include_router(langfuse_router, prefix=settings.API_PREFIX)
# health_router is mounted TWICE on purpose, and both mounts have a caller:
#   - unprefixed /health + /ping: the ALB target group health check probes /ping, and
#     it cannot be moved without a target-group change. Removing this mount takes the
#     backend out of service.
#   - API_PREFIX /api/v1/health + /api/v1/ping: every other route in this app lives
#     under API_PREFIX, so clients built on the same base URL (the frontend api client,
#     curl checks, uptime probes copied off an existing call) reasonably expect liveness
#     there too. Prefix-only-once meant GET /api/v1/health returned 404, which reads as
#     "the backend is down" while the process is perfectly healthy.
# No collision with govern_health_router (AWS Health service, /govern/health/*, mounted
# under API_PREFIX below): app liveness owns /health and /ping, not /govern/health.
app.include_router(health_router)
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(templates_router, prefix=settings.API_PREFIX)
app.include_router(bootstrap_router, prefix=settings.API_PREFIX)
app.include_router(deployments_router, prefix=settings.API_PREFIX)
app.include_router(applications_router, prefix=settings.API_PREFIX)
app.include_router(app_factory_router, prefix=settings.API_PREFIX)
app.include_router(users_router, prefix=settings.API_PREFIX)
app.include_router(fsi_sso_router, prefix=settings.API_PREFIX)
app.include_router(codecommit_router, prefix=settings.API_PREFIX)
app.include_router(frontier_agents_router, prefix=settings.API_PREFIX)
app.include_router(harness_router, prefix=settings.API_PREFIX)
app.include_router(catalog_router, prefix=settings.API_PREFIX)
app.include_router(memory_router, prefix=settings.API_PREFIX)
app.include_router(mcp_router, prefix=settings.API_PREFIX)
app.include_router(a2a_router, prefix=settings.API_PREFIX)
app.include_router(identity_providers_router, prefix=settings.API_PREFIX)
app.include_router(approval_policies_router, prefix=settings.API_PREFIX)
app.include_router(approval_requests_router, prefix=settings.API_PREFIX)
app.include_router(skills_router, prefix=settings.API_PREFIX)
app.include_router(agents_router, prefix=settings.API_PREFIX)
app.include_router(custom_resources_router, prefix=settings.API_PREFIX)
app.include_router(guardrails_router, prefix=settings.API_PREFIX)
app.include_router(policies_router, prefix=settings.API_PREFIX)
app.include_router(llm_gateway_router, prefix=settings.API_PREFIX)
app.include_router(prioritization_router, prefix=settings.API_PREFIX)
app.include_router(maturity_router, prefix=settings.API_PREFIX)
app.include_router(business_cases_router, prefix=settings.API_PREFIX)
app.include_router(knowledge_router, prefix=settings.API_PREFIX)
app.include_router(operating_model_router, prefix=settings.API_PREFIX)
app.include_router(organization_design_router, prefix=settings.API_PREFIX)
app.include_router(transformation_value_model_router, prefix=settings.API_PREFIX)
app.include_router(service_approval_router, prefix=settings.API_PREFIX)
app.include_router(advpo_router, prefix=settings.API_PREFIX)
app.include_router(govern_audit_router, prefix=settings.API_PREFIX)
app.include_router(govern_conformance_router, prefix=settings.API_PREFIX)
app.include_router(govern_graduation_router, prefix=settings.API_PREFIX)
app.include_router(govern_sr26_router, prefix=settings.API_PREFIX)
app.include_router(govern_enforcement_router, prefix=settings.API_PREFIX)
app.include_router(govern_a2a_trust_router, prefix=settings.API_PREFIX)
app.include_router(govern_cost_router, prefix=settings.API_PREFIX)
app.include_router(govern_models_router, prefix=settings.API_PREFIX)
app.include_router(govern_posture_router, prefix=settings.API_PREFIX)
app.include_router(govern_evals_router, prefix=settings.API_PREFIX)
app.include_router(evaluations_router, prefix=settings.API_PREFIX)
app.include_router(govern_risk_posture_router, prefix=settings.API_PREFIX)
app.include_router(govern_trail_router, prefix=settings.API_PREFIX)
app.include_router(govern_security_router, prefix=settings.API_PREFIX)
app.include_router(govern_agentcore_router, prefix=settings.API_PREFIX)
app.include_router(govern_guardrails_router, prefix=settings.API_PREFIX)
app.include_router(govern_invocation_safety_router, prefix=settings.API_PREFIX)
app.include_router(govern_regions_router, prefix=settings.API_PREFIX)
app.include_router(govern_data_sources_router, prefix=settings.API_PREFIX)
app.include_router(govern_data_catalog_router, prefix=settings.API_PREFIX)
app.include_router(govern_fleet_router, prefix=settings.API_PREFIX)
app.include_router(govern_compliance_router, prefix=settings.API_PREFIX)
app.include_router(govern_sagemaker_router, prefix=settings.API_PREFIX)
app.include_router(govern_controls_router, prefix=settings.API_PREFIX)
app.include_router(govern_developer_ai_router, prefix=settings.API_PREFIX)
app.include_router(govern_guardduty_ai_router, prefix=settings.API_PREFIX)
app.include_router(govern_aidlc_router, prefix=settings.API_PREFIX)
app.include_router(govern_harness_audit_router, prefix=settings.API_PREFIX)
app.include_router(govern_harness_policy_router, prefix=settings.API_PREFIX)
app.include_router(govern_validation_router, prefix=settings.API_PREFIX)
app.include_router(govern_policy_drift_router, prefix=settings.API_PREFIX)
app.include_router(govern_posture_score_router, prefix=settings.API_PREFIX)
app.include_router(govern_compliance_evidence_router, prefix=settings.API_PREFIX)
app.include_router(govern_llm_quality_router, prefix=settings.API_PREFIX)
app.include_router(govern_path_jail_router, prefix=settings.API_PREFIX)
app.include_router(govern_capacity_router, prefix=settings.API_PREFIX)
app.include_router(govern_iam_router, prefix=settings.API_PREFIX)
app.include_router(govern_operations_router, prefix=settings.API_PREFIX)
app.include_router(govern_marketplace_router, prefix=settings.API_PREFIX)
app.include_router(govern_command_center_router, prefix=settings.API_PREFIX)
app.include_router(govern_knowledge_bases_router, prefix=settings.API_PREFIX)
app.include_router(govern_xray_router, prefix=settings.API_PREFIX)
app.include_router(govern_bedrock_assets_router, prefix=settings.API_PREFIX)
app.include_router(govern_security_lake_router, prefix=settings.API_PREFIX)
app.include_router(govern_audit_manager_router, prefix=settings.API_PREFIX)
app.include_router(govern_governance_router, prefix=settings.API_PREFIX)
app.include_router(govern_ctlake_router, prefix=settings.API_PREFIX)
app.include_router(govern_macie_router, prefix=settings.API_PREFIX)
app.include_router(govern_cost_resource_router, prefix=settings.API_PREFIX)
app.include_router(govern_invocations_router, prefix=settings.API_PREFIX)
app.include_router(govern_resource_tags_router, prefix=settings.API_PREFIX)
app.include_router(govern_trusted_advisor_router, prefix=settings.API_PREFIX)
app.include_router(govern_service_quotas_router, prefix=settings.API_PREFIX)
app.include_router(govern_compute_optimizer_router, prefix=settings.API_PREFIX)
app.include_router(govern_verified_permissions_router, prefix=settings.API_PREFIX)
app.include_router(govern_health_router, prefix=settings.API_PREFIX)

# Multi-cloud connectors (Azure, GCP, ServiceNow, Salesforce, Copilot Studio)
app.include_router(multicloud_router)

# Include routers with stage prefix for API Gateway (e.g., /dev, /prod)
if settings.ROOT_PATH:
    app.include_router(projects_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(langfuse_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    # Same two mounts again behind the API Gateway stage prefix, so a stage deployment
    # keeps both shapes: {stage}/ping for the probe, {stage}/api/v1/health for clients.
    app.include_router(health_router, prefix=settings.ROOT_PATH)
    app.include_router(health_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(templates_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(bootstrap_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(deployments_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(applications_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(app_factory_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(users_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(fsi_sso_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(codecommit_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(frontier_agents_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(harness_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(catalog_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(memory_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(mcp_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(a2a_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(identity_providers_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(approval_policies_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(approval_requests_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(skills_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(agents_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(custom_resources_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(guardrails_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(policies_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(llm_gateway_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(prioritization_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(maturity_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(business_cases_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(knowledge_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(operating_model_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(organization_design_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(transformation_value_model_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(service_approval_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(advpo_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(evaluations_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_audit_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_conformance_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_graduation_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_sr26_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_enforcement_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_a2a_trust_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_cost_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_models_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_posture_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_evals_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_risk_posture_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_trail_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_security_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_agentcore_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_guardrails_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_invocation_safety_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_regions_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_fleet_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_compliance_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_sagemaker_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_controls_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_developer_ai_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_guardduty_ai_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_aidlc_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_harness_audit_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_harness_policy_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_policy_drift_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_posture_score_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_compliance_evidence_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_llm_quality_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_path_jail_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_capacity_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_iam_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_operations_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_marketplace_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_command_center_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_knowledge_bases_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_xray_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_bedrock_assets_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_security_lake_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_audit_manager_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_governance_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_ctlake_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_macie_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_cost_resource_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_invocations_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_resource_tags_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_trusted_advisor_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_service_quotas_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_compute_optimizer_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_verified_permissions_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(govern_health_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(multicloud_router, prefix=settings.ROOT_PATH)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
