# Sales Recommend Agent — AgentCore Runtime Container
#
# AgentCore requirements:
# - ARM64 compatible
# - Expose port 8080
# - Must have /invocations path available
# Reference: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html

FROM --platform=linux/arm64 python:3.12-slim

WORKDIR /app

# Install dependencies (same as working code-deploy: strands + bedrock-agentcore)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent source
COPY src/recommend.py ./recommend.py

# Environment
ENV PYTHONUNBUFFERED=1
ENV KNOWLEDGE_BASE_ID=H1LK4MDM6O
ENV AWS_REGION=us-east-1
# CRITICAL: BedrockAgentCoreApp.run() binds to 127.0.0.1 unless it detects a
# container via /.dockerenv (Docker-only) OR the DOCKER_CONTAINER env var.
# Podman does NOT create /.dockerenv, so without this the server binds to
# localhost and AgentCore cannot reach /invocations → HTTP 504 timeout.
ENV DOCKER_CONTAINER=1

EXPOSE 8080

CMD ["python", "recommend.py"]
