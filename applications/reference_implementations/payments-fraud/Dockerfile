FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .

ARG FRAMEWORK=strands
RUN pip install --no-cache-dir ".[$FRAMEWORK]"

COPY src/${FRAMEWORK} ./src/agent

ENV PORT=8080
EXPOSE 8080

# Run as a non-root user (CKV_DOCKER_3 — least privilege).
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Liveness probe against the AgentCore /ping endpoint (CKV_DOCKER_2).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/ping').read()" || exit 1

CMD ["python", "-m", "src.agent.main"]
