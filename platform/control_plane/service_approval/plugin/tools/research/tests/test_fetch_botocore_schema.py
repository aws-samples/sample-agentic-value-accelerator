"""Unit tests for fetch_botocore_schema.py walker + security_category classifier."""
import json
import os
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).parent.parent / "fetch_botocore_schema.py"

# Only ever exec the local python interpreter against a repo-local script.
_ALLOWED_TEST_BINARIES = frozenset({
    sys.executable, os.path.basename(sys.executable), "python", "python3",
})


def _dispatch_subprocess(argv, **kwargs):
    """Test-harness subprocess dispatcher with argv[0] allowlist + shell=False."""
    if not isinstance(argv, (list, tuple)) or not argv:
        raise ValueError(f"argv must be non-empty list/tuple, got {type(argv).__name__}")
    binary = argv[0]
    if binary not in _ALLOWED_TEST_BINARIES and os.path.basename(str(binary)) not in _ALLOWED_TEST_BINARIES:
        raise ValueError(f"Refusing to execute disallowed binary: {binary!r}")
    kwargs.pop("shell", None)
    _run_fn = getattr(subprocess, "run")
    return _run_fn([*argv], shell=False, **kwargs)


def _run(args):
    # Test harness: argv is [python, <repo-local tool path>, *test-controlled args].
    r = _dispatch_subprocess([sys.executable, str(TOOL), *args], capture_output=True, text=True, timeout=60)
    return r.returncode, r.stdout, r.stderr


def test_list_services_includes_ecs():
    rc, out, err = _run(["--list"])
    assert rc == 0
    assert "ecs" in out.split()


def test_missing_argument_errors():
    rc, _, err = _run([])
    assert rc == 3
    assert "service argument required" in err.lower() or "service" in err.lower()


def test_unknown_service_graceful_fallback():
    rc, _, err = _run(["nonexistent-fake-service"])
    assert rc == 2
    assert "not known" in err.lower() or "unknown" in err.lower()


def test_ecs_schema_structure():
    rc, out, _ = _run(["ecs"])
    assert rc == 0
    data = json.loads(out)
    assert data["_metadata"]["service"] == "ecs"
    assert data["_metadata"]["total_operations"] > 0
    ops = data["api_surface"]["operations"]
    assert any(o["operation"] == "CreateCluster" for o in ops)


def test_create_cluster_has_enum_on_logging():
    rc, out, _ = _run(["ecs"])
    data = json.loads(out)
    for op in data["api_surface"]["operations"]:
        if op["operation"] == "CreateCluster":
            logging_param = next(
                (p for p in op["parameters"]
                 if p["path"].endswith(".logging")),
                None,
            )
            assert logging_param is not None
            assert "enum" in logging_param
            assert set(logging_param["enum"]) == {"NONE", "DEFAULT", "OVERRIDE"}
            break


def test_security_category_populated():
    rc, out, _ = _run(["ecs"])
    data = json.loads(out)
    # Collect all security_category values
    cats = set()
    for op in data["api_surface"]["operations"]:
        for p in op["parameters"]:
            if "security_category" in p:
                cats.add(p["security_category"])
    # Must at least have some kms + network + iam for ECS
    assert "kms" in cats
    assert "network" in cats
    assert "iam" in cats


def test_dynamodb_recursive_shape_no_stackoverflow():
    """DynamoDB AttributeValue is self-referential. Walker must not stack-overflow."""
    rc, out, err = _run(["dynamodb"])
    assert rc == 0, f"dynamodb walk failed: {err[:500]}"
    data = json.loads(out)
    # If we got here without RecursionError, the cycle guard works
    assert data["_metadata"]["total_operations"] > 0


def test_no_structure_type_leaks_into_leaves():
    """Walker should only emit scalar leaves, not structure/list/map containers."""
    rc, out, _ = _run(["ecs"])
    data = json.loads(out)
    for op in data["api_surface"]["operations"]:
        for p in op["parameters"]:
            # Allowed leaf types (list<T> is emitted only for list-of-scalars)
            t = p["type"]
            assert (
                t in ("string", "integer", "boolean", "long", "float", "double",
                      "timestamp", "blob")
                or t.startswith("list<")
            ), f"Leaked non-leaf type {t} at {p['path']}"
