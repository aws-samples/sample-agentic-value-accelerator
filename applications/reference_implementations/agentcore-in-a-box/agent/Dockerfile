# Base image PINNED to a specific patch tag + multi-arch index digest (supply-chain hardening —
# a floating `python:3.12-slim` can silently change under you). The digest is the manifest-list
# (index) digest for python:3.12-slim-bookworm, so `--platform linux/arm64` (set by deploy.sh)
# still resolves the arm64 variant. To refresh: `docker buildx imagetools inspect python:3.12-slim-bookworm`.
FROM public.ecr.aws/docker/library/python:3.12-slim-bookworm
# Note: target platform (linux/arm64) is set by deploy.sh via --platform flag;
# it does not need to be declared here.
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Copy the agent modules: main.py (entrypoint) + swarm_strands.py (the Strands SDK Swarm
# engine, used when topology=swarm) + graph_strands.py (the Strands SDK Graph engine, used
# when topology=graph — reuses swarm_strands) + evolve.py (the pure-stdlib evolutionary
# portfolio GA whose SOURCE the agent ships into the Code Interpreter sandbox) + the persona
# registry (personas.py) and the per-vertical desk modules that self-register on import
# (persona_insurance / persona_banking / persona_fintech), which select the roster/prompts/
# tools/graph per request from the `persona` field. All required.
COPY main.py swarm_strands.py graph_strands.py evolve.py ./
COPY personas.py persona_insurance.py persona_banking.py persona_fintech.py ./
# entitlements.py: the single-sourced RBAC catalog + decision logic (also copied into the
# tool Lambdas by deploy.sh). The runtime is the PRIMARY per-user enforcement point.
COPY entitlements.py ./
# guardrail.py: the Bedrock Guardrails content filter (PII/secret scan on the inbound prompt).
COPY guardrail.py ./
EXPOSE 8080
# Wrap startup with ADOT auto-instrumentation so spans/traces/metrics flow to
# CloudWatch GenAI Observability. AgentCore auto-injects the OTEL_* env vars in
# the runtime; opentelemetry-instrument picks them up at launch.
CMD ["opentelemetry-instrument", "python", "main.py"]
