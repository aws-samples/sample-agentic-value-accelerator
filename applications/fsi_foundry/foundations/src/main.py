# SPDX-License-Identifier: Apache-2.0
"""
AVA Platform - Main Entry Point

A platform for building, deploying, and operating multi-agent AI systems on AWS.

Supports multiple deployment modes controlled by DEPLOYMENT_MODE environment variable:
- fastapi: Local development or EC2/container deployment with FastAPI (default)
- agentcore: Amazon Bedrock AgentCore Runtime deployment
- lambda: AWS Step Functions with Lambda deployment

Set DEPLOYMENT_MODE and AGENT_NAME environment variables to configure the deployment.
"""

import importlib

from config.settings import settings
from utils.logging import configure_logging, get_logger

# Configure logging first (before any other imports that might log)
configure_logging(
    level=settings.log_level,
    json_format=settings.app_env == "production"
)

logger = get_logger(__name__)

# Dynamically import use case module to trigger registration
# Each use case module registers itself with the registry on import
# The use case is determined by the AGENT_NAME setting (e.g., "kyc")
_use_case_name = settings.agent_name
try:
    importlib.import_module(f"use_cases.{_use_case_name}")
except ImportError as e:
    logger.error("use_case_import_failed", use_case=_use_case_name, error=str(e))
    raise ImportError(f"Failed to import use case '{_use_case_name}': {e}") from e

# Get configuration from settings
DEPLOYMENT_MODE = settings.deployment_mode.lower()
AGENT_NAME = settings.agent_name  # Default: "kyc_banking"

# Validate deployment mode
VALID_MODES = ["fastapi", "agentcore", "lambda"]
if DEPLOYMENT_MODE not in VALID_MODES:
    logger.warning(
        "invalid_deployment_mode",
        mode=DEPLOYMENT_MODE,
        valid_modes=VALID_MODES,
        defaulting_to="fastapi",
    )
    DEPLOYMENT_MODE = "fastapi"

logger.info(
    "initializing_application",
    deployment_mode=DEPLOYMENT_MODE,
    agent_name=AGENT_NAME,
    environment=settings.app_env,
    region=settings.aws_region,
    model_id=settings.bedrock_model_id,
)

# Select adapter based on deployment mode
if DEPLOYMENT_MODE == "fastapi":
    # Pattern 1: FastAPI mode (default) - for EC2/ALB or local development
    logger.info("selected_pattern", pattern="1_fastapi", description="EC2 with FastAPI")
    from adapters.fastapi_adapter import create_fastapi_app
    app = create_fastapi_app(AGENT_NAME)
    logger.info("fastapi_app_created", status="success", agent=AGENT_NAME)
    
    if __name__ == "__main__":
        import uvicorn
        logger.info(
            "starting_fastapi_server",
            host="0.0.0.0",
            port=8000,
            reload=settings.app_env == "development",
        )
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=settings.app_env == "development",
        )

elif DEPLOYMENT_MODE == "lambda":
    # Pattern 2: Lambda handler for Step Functions deployment
    logger.info("selected_pattern", pattern="2_lambda", description="AWS Step Functions with Lambda")
    from adapters.lambda_adapter import create_lambda_handler
    handler = create_lambda_handler(AGENT_NAME)
    logger.info("lambda_handler_created", status="success", agent=AGENT_NAME)
    
    # Export handler for Lambda runtime
    # Lambda will import this module and call: lambda_handler(event, context)
    lambda_handler = handler
    
    # For local testing
    if __name__ == "__main__":
        logger.info(
            "lambda_local_test_mode",
            hint="Lambda handler created. Deploy to AWS Lambda or test with local event.",
        )
        print("Lambda handler created successfully.")
        print("To test locally, use: python -c 'from main import lambda_handler; import asyncio; asyncio.run(lambda_handler({\"customer_id\": \"CUST001\"}, None))'")

elif DEPLOYMENT_MODE == "agentcore":
    # Pattern 3: AgentCore Runtime deployment
    logger.info("selected_pattern", pattern="3_agentcore", description="Amazon Bedrock AgentCore Runtime")
    try:
        from adapters.agentcore_adapter import create_agentcore_app
        app = create_agentcore_app(AGENT_NAME)
        logger.info("agentcore_app_created", status="success", agent=AGENT_NAME)
        
        # Run the AgentCore app when this module is executed directly
        if __name__ == "__main__":
            logger.info("starting_agentcore_runtime")
            app.run()
    except ImportError as e:
        logger.error(
            "agentcore_import_failed",
            error=str(e),
            hint="Install bedrock-agentcore: pip install -r requirements_agentcore.txt",
        )
        raise RuntimeError(
            "DEPLOYMENT_MODE=agentcore but bedrock-agentcore is not installed.\n"
            "Run: pip install -r requirements.txt -r requirements_agentcore.txt\n"
            "Or use: DEPLOYMENT_MODE=agentcore ./scripts/install_dependencies.sh"
        ) from e

else:
    raise ValueError(f"Invalid DEPLOYMENT_MODE: {DEPLOYMENT_MODE}. Valid modes: {VALID_MODES}")
