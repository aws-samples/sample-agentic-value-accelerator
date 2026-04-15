#checkov:skip=CKV_DOCKER_2:Container runs on AgentCore Runtime with ALB health checks
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

ENV UV_SYSTEM_PYTHON=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_PROGRESS=1 \
    PYTHONUNBUFFERED=1 \
    DOCKER_CONTAINER=1 \
    AWS_REGION=us-east-1 \
    AWS_DEFAULT_REGION=us-east-1 \
    PYTHONPATH=/app:$PYTHONPATH

COPY agent.py config.py ./
COPY agents/ ./agents/
COPY configs/ ./configs/

RUN uv pip install \
    strands-agents>=1.0.0 \
    strands-agents-tools>=0.2.3 \
    bedrock-agentcore>=1.0.0 \
    pyyaml>=6.0.0 \
    boto3>=1.34.0 \
    python-dotenv>=1.0.0 \
    psycopg2-binary>=2.9.0 \
    aws-opentelemetry-distro==0.12.2 \
    --no-cache

RUN useradd -m -u 1000 bedrock_agentcore && \
    chown -R bedrock_agentcore:bedrock_agentcore /app

USER bedrock_agentcore

EXPOSE 9000
EXPOSE 8000
EXPOSE 8080

LABEL org.opencontainers.image.title="Market Surveillance Risk Analyst Agent"

# Run the agent with OpenTelemetry instrumentation
CMD ["opentelemetry-instrument", "python", "agent.py"]
