# Service Approval — AgentCore-hosted plugin runner.
#
# Build context is the module root (platform/control_plane/service_approval/) so
# the COPY for the canonical plugin/ tree lives as a sibling of agent/.
# Build with:
#   docker build --platform linux/arm64 \
#     -t <repo>:<tag> platform/control_plane/service_approval/
#
# AgentCore microVMs require linux/arm64 — building for amd64 fails at
# first invocation with "exec format error".
FROM public.ecr.aws/docker/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CLAUDE_CODE_USE_BEDROCK=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    DISABLE_AUTOUPDATER=1 \
    UV_INSTALL_DIR=/usr/local/bin \
    HOME=/home/runner \
    PATH=/usr/local/bin:/usr/local/lib/node_modules/.bin:$PATH

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && npm install -g @anthropic-ai/claude-code \
 && curl -LsSf https://astral.sh/uv/install.sh | sh \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --home-dir /home/runner --shell /bin/bash runner \
 && mkdir -p /home/runner/.cache /home/runner/.config \
 && chown -R runner:runner /home/runner

COPY agent/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Plugin tree at the path the agent's RunnerContext expects (PLUGIN_SRC
# in agent/v1_entrypoint.py). Plugin sits as a sibling of agent/ — build
# context is the v2 module root so we can COPY both without coupling them.
COPY --chown=runner:runner plugin/ /opt/service-approval-plugin/

# AgentCore wrapper + entrypoint. main.py imports v1_entrypoint at call
# time (after env-var injection).
COPY --chown=runner:runner agent/v1_entrypoint.py /app/v1_entrypoint.py
COPY --chown=runner:runner agent/main.py          /app/main.py

USER runner
EXPOSE 8080
CMD ["python", "/app/main.py"]
