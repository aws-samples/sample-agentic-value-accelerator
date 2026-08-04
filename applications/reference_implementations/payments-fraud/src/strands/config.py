"""Configuration loaded from environment variables.

Follows the AVA control-plane template convention (flat env-var module, see
templates/supervisor-specialists/src/strands/config.py) rather than the heavier
market-surveillance config. Adds two things the supervisor template doesn't need
but this app does: a faster model for the high-volume scorer, and a Langfuse OTLP
helper aligned with the agent-observability template.
"""

import base64
import os

# --- Models ---
# Supervisor, investigation, and SAR drafting use a Sonnet-class model; the
# Transaction Scorer runs on every payment, so it defaults to a faster model.
MODEL_ID = os.getenv("MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
SCORER_MODEL_ID = os.getenv("SCORER_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.1"))  # deterministic — auditable fraud decisions
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))
MEMORY_WINDOW_SIZE = int(os.getenv("MEMORY_WINDOW_SIZE", "20"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
PORT = int(os.getenv("PORT", "8080"))

# --- Data stores (injected by Terraform) ---
TXN_TABLE = os.getenv("TXN_TABLE", "")
CASES_TABLE = os.getenv("CASES_TABLE", "")
SARS_TABLE = os.getenv("SARS_TABLE", "")
DATA_BUCKET = os.getenv("DATA_BUCKET", "")
DATA_PREFIX = os.getenv("DATA_PREFIX", "samples/payments_fraud")

# --- Guardrails (optional) ---
GUARDRAIL_ID = os.getenv("GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.getenv("GUARDRAIL_VERSION", "DRAFT")

# --- Decision thresholds (mirror case-management for comparability) ---
STEP_UP_THRESHOLD = float(os.getenv("STEP_UP_THRESHOLD", "0.85"))
HOLD_AND_CASE_THRESHOLD = float(os.getenv("HOLD_AND_CASE_THRESHOLD", "0.95"))


def configure_observability() -> None:
    """Wire Langfuse tracing via OpenTelemetry, if configured.

    Strands auto-instruments agents and emits OTLP spans; Langfuse exposes an OTLP
    endpoint. We set the standard OTEL_* env vars from the Langfuse key pair provided
    by the agent-observability / foundation-stack template. No-ops (CloudWatch/X-Ray
    only) when Langfuse env vars are absent, e.g. local dev.
    """
    host = os.getenv("LANGFUSE_HOST", "")
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    if not (host and public_key and secret_key):
        return

    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    os.environ.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", f"{host.rstrip('/')}/api/public/otel")
    os.environ.setdefault("OTEL_EXPORTER_OTLP_HEADERS", f"Authorization=Basic {auth}")
    os.environ.setdefault("OTEL_SERVICE_NAME", "payments-fraud")
