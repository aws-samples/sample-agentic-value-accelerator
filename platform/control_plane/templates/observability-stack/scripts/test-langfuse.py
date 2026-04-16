#!/usr/bin/env python3
"""Test Langfuse deployment — verifies health, auth, tracing, scoring, and datasets."""

import argparse
import json
import sys
import time

try:
    import requests
    from requests.auth import HTTPBasicAuth
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

try:
    from langfuse import Langfuse, observe
    HAS_SDK = True
except ImportError:
    HAS_SDK = False


def test_health(host):
    """Test the health endpoint."""
    resp = requests.get(f"{host}/api/public/health", timeout=10)
    assert resp.status_code == 200, f"Health check returned {resp.status_code}"
    data = resp.json()
    assert data.get("status") == "OK", f"Health status: {data}"
    return data.get("version", "unknown")


def test_auth(host, public_key, secret_key):
    """Test API authentication."""
    resp = requests.get(
        f"{host}/api/public/health",
        auth=HTTPBasicAuth(public_key, secret_key),
        timeout=10,
    )
    assert resp.status_code == 200, f"Auth check failed: {resp.status_code}"


def test_sdk_trace(host, public_key, secret_key):
    """Test trace creation via SDK."""
    langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)

    assert langfuse.auth_check(), "SDK auth check failed"

    with langfuse.start_as_current_observation(
        name="test-trace",
        input={"query": "What is Langfuse?"},
        output={"answer": "Langfuse is an open-source LLM observability platform."},
    ):
        with langfuse.start_as_current_observation(
            name="llm-call",
            as_type="generation",
            model="test-model",
            input=[{"role": "user", "content": "What is Langfuse?"}],
            output="Langfuse is an open-source LLM observability platform.",
            usage_details={"input": 10, "output": 15},
        ):
            pass
        langfuse.score_current_trace(name="quality", value=0.95, comment="Test score")

    langfuse.flush()
    return True


def test_sdk_observe_decorator(host, public_key, secret_key):
    """Test the @observe decorator."""
    langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)

    @observe()
    def inner_step(text):
        return f"processed: {text}"

    @observe()
    def pipeline(text):
        return inner_step(text)

    result = pipeline("hello from test")
    langfuse.flush()
    assert result == "processed: hello from test", f"Unexpected result: {result}"
    return True


def test_dataset(host, public_key, secret_key):
    """Test dataset creation."""
    langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)

    dataset_name = f"test-dataset-{int(time.time())}"
    dataset = langfuse.create_dataset(name=dataset_name)
    assert dataset.name == dataset_name, f"Dataset name mismatch: {dataset.name}"

    langfuse.create_dataset_item(
        dataset_name=dataset_name,
        input={"query": "test"},
        expected_output="test response",
    )
    langfuse.flush()
    return dataset_name


def test_api_traces(host, public_key, secret_key):
    """Verify traces are queryable via API."""
    time.sleep(3)  # allow async processing
    resp = requests.get(
        f"{host}/api/public/traces",
        auth=HTTPBasicAuth(public_key, secret_key),
        params={"limit": 5},
        timeout=10,
    )
    assert resp.status_code == 200, f"Traces API returned {resp.status_code}"
    data = resp.json()
    traces = data.get("data", [])
    assert len(traces) > 0, "No traces found"
    return len(traces)


def test_otel_endpoint(host):
    """Verify OTEL endpoint exists."""
    resp = requests.options(f"{host}/api/public/otel/v1/traces", timeout=10)
    # OTEL endpoint should respond (even if it rejects without proper headers)
    assert resp.status_code < 500, f"OTEL endpoint returned {resp.status_code}"
    return True


def main():
    parser = argparse.ArgumentParser(description="Test Langfuse deployment")
    parser.add_argument("--host", required=True, help="Langfuse URL (e.g. http://langfuse-xxx.elb.amazonaws.com)")
    parser.add_argument("--public-key", required=True, help="Langfuse public key (pk-lf-...)")
    parser.add_argument("--secret-key", required=True, help="Langfuse secret key (sk-lf-...)")
    args = parser.parse_args()

    host = args.host.rstrip("/")
    passed = 0
    failed = 0
    total = 0

    tests = [
        ("Health check", lambda: test_health(host)),
        ("API authentication", lambda: test_auth(host, args.public_key, args.secret_key)),
        ("OTEL endpoint", lambda: test_otel_endpoint(host)),
    ]

    if HAS_SDK:
        tests.extend([
            ("SDK auth + trace + generation + score", lambda: test_sdk_trace(host, args.public_key, args.secret_key)),
            ("SDK @observe decorator", lambda: test_sdk_observe_decorator(host, args.public_key, args.secret_key)),
            ("Dataset creation", lambda: test_dataset(host, args.public_key, args.secret_key)),
            ("API trace query", lambda: test_api_traces(host, args.public_key, args.secret_key)),
        ])
    else:
        print("NOTE: 'langfuse' SDK not installed — skipping SDK tests (pip install langfuse)\n")

    for name, fn in tests:
        total += 1
        try:
            result = fn()
            passed += 1
            detail = f" -> {result}" if result is not None and result is not True else ""
            print(f"  PASS  {name}{detail}")
        except Exception as e:
            failed += 1
            print(f"  FAIL  {name} -> {e}")

    print(f"\n{passed}/{total} tests passed", end="")
    if failed:
        print(f", {failed} failed")
        sys.exit(1)
    else:
        print()
        sys.exit(0)


if __name__ == "__main__":
    main()
