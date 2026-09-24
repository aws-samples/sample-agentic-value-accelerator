# =============================================================================
# AVA - AgentCore Deployment Pattern
# =============================================================================
# Builds ARM64 image for AWS Bedrock AgentCore Runtime deployment
#
# Usage:
#   docker buildx build \
#     --build-arg USE_CASE_ID=kyc \
#     --build-arg FRAMEWORK=langchain_langgraph \
#     --platform linux/arm64 \
#     -f platform/docker/patterns/agentcore.Dockerfile \
#     -t ava-kyc-agentcore:latest .
#
# Supported build args:
#   USE_CASE_ID  - Use case ID (default: kyc)
#   FRAMEWORK    - Framework ID (default: langchain_langgraph)
#
# Note: AgentCore REQUIRES ARM64 architecture - AMD64 will not work!
# =============================================================================

# Build arguments
ARG USE_CASE_ID=kyc
ARG FRAMEWORK=langchain_langgraph

# -----------------------------------------------------------------------------
# Base stage - common platform code
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS base

ARG USE_CASE_ID
ARG FRAMEWORK

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install base requirements
COPY applications/fsi_foundry/foundations/src/requirements/requirements.txt ./requirements/
COPY applications/fsi_foundry/foundations/src/requirements/requirements_agentcore.txt ./requirements/
COPY applications/fsi_foundry/foundations/src/requirements/requirements_strands.txt ./requirements/

# Install base + AgentCore dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements/requirements.txt && \
    pip install --no-cache-dir -r requirements/requirements_agentcore.txt && \
    pip install --no-cache-dir aws-opentelemetry-distro>=0.10.1

# Install framework-specific requirements
RUN if [ "$FRAMEWORK" = "strands" ]; then \
        pip install --no-cache-dir -r requirements/requirements_strands.txt; \
    fi

# Copy platform source code
COPY applications/fsi_foundry/foundations/src/ .

# Create use_cases directory and copy application code
RUN mkdir -p use_cases
COPY applications/fsi_foundry/use_cases/${USE_CASE_ID}/src/${FRAMEWORK}/ ./use_cases/${USE_CASE_ID}/
RUN echo '"""AVA Use Cases."""' > use_cases/__init__.py

# -----------------------------------------------------------------------------
# AgentCore Pattern - OpenTelemetry instrumented
# -----------------------------------------------------------------------------
FROM base AS agentcore

# AgentCore-specific labels
LABEL org.opencontainers.image.title="AVA - AgentCore"
LABEL org.opencontainers.image.description="AgentCore Runtime deployment pattern"
LABEL deployment.pattern="agentcore"
LABEL deployment.architecture="arm64"

# Set deployment mode
ENV DEPLOYMENT_MODE=agentcore
ENV USE_CASE_ID=${USE_CASE_ID}
ENV FRAMEWORK=${FRAMEWORK}

# Create non-root user (REQUIRED by AgentCore)
RUN useradd -m -u 1000 appuser
USER appuser

# Expose AgentCore port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run with OpenTelemetry instrumentation
CMD ["opentelemetry-instrument", "python", "-m", "main"]
