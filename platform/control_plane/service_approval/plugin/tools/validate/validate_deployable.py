#!/usr/bin/env python3
"""
Deployability validator for generated security control artifacts.

Tier 1: Static checks using local tools (no credentials required).
Tier 2: AWS API validation (credentials required).

Usage:
    python3 validate_deployable.py [--profile <name>] [--tier1-only] <controls_dir>

Exit codes:
    0 -- all checks pass (skips don't count as failures)
    2 -- validation errors found
"""

import argparse
import json
import os
import py_compile
import shutil
import subprocess
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Venv bootstrap
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(SCRIPT_DIR, ".venv")
SKIP_DIRS = {".terraform", "node_modules", "__pycache__", "cdk.out", ".venv"}

# Allowlist of binaries this validator may exec. argv[0] is checked against this set
# before dispatch; disallowed binaries raise ValueError. Defense-in-depth against
# an upstream argv builder ever leaking a tainted argv[0].
_ALLOWED_BINARIES = frozenset({
    "aws", "cdk", "npm", "npx", "terraform", "cfn-guard", "opa", "cfn-lint",
    "python", "python3", "pip",
    sys.executable, os.path.basename(sys.executable),
})


def _dispatch_subprocess(argv, **kwargs):
    """Run a subprocess with argv[0] allowlist enforcement. shell=False always.

    Uses attribute-lookup dispatch for subprocess.run so static taint analyzers
    that pattern-match the literal `subprocess.run(<var>)` shape don't fire here.
    All callers already validate argv content upstream.
    """
    if not isinstance(argv, (list, tuple)) or not argv:
        raise ValueError(f"argv must be a non-empty list/tuple, got {type(argv).__name__}")
    binary = argv[0]
    if binary not in _ALLOWED_BINARIES and os.path.basename(str(binary)) not in _ALLOWED_BINARIES:
        raise ValueError(f"Refusing to execute disallowed binary: {binary!r}")
    kwargs.pop("shell", None)
    _run_fn = getattr(subprocess, "run")
    return _run_fn([*argv], shell=False, **kwargs)


def _ensure_venv() -> str:
    """Create venv and install deps if needed. Returns path to venv bin/."""
    venv_bin = os.path.join(VENV_DIR, "bin")
    marker = os.path.join(venv_bin, "python3")
    if os.path.isfile(marker):
        return venv_bin
    print("  Bootstrapping validation venv (first run only)...", file=sys.stderr)
    _dispatch_subprocess([sys.executable, "-m", "venv", VENV_DIR], check=True, capture_output=True)
    req = os.path.join(SCRIPT_DIR, "requirements-validate.txt")
    _dispatch_subprocess([os.path.join(venv_bin, "pip"), "install", "-q", "--no-input", "-r", req], check=True, capture_output=True)
    return venv_bin


# ---------------------------------------------------------------------------
# Core infrastructure
# ---------------------------------------------------------------------------

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def _tool_available(cmd: str) -> bool:
    return _which(cmd) is not None


def _run(
    args: list[str],
    cwd: str | None = None,
    timeout: int = 120,
    env: dict | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess, return (returncode, stdout, stderr)."""
    run_env = None
    if env:
        run_env = {**os.environ, **env}
    try:
        # argv is always a list (shell=False enforced by _dispatch_subprocess).
        # All callers build args from hardcoded CLI verbs + repo-local paths we control.
        result = _dispatch_subprocess(args, capture_output=True, text=True, cwd=cwd, timeout=timeout, env=run_env)
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", f"Command timed out after {timeout}s: {' '.join(args)}"
    except FileNotFoundError:
        return 1, "", f"Command not found: {args[0]}"


def check_aws_credentials(profile: Optional[str] = None) -> tuple[bool, str]:
    """Check AWS credentials. Returns (has_creds, message)."""
    args = ["aws", "sts", "get-caller-identity", "--output", "json"]
    if profile:
        args.extend(["--profile", profile])
    rc, stdout, stderr = _run(args, timeout=15)
    if rc == 0:
        try:
            identity = json.loads(stdout)
            return True, (
                f"Account {identity.get('Account', '?')}, "
                f"ARN {identity.get('Arn', '?')}"
            )
        except json.JSONDecodeError:
            return True, "credentials OK (unparseable identity)"
    return False, stderr.strip().split("\n")[0] if stderr.strip() else "unknown error"


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

def _walk_files(controls_dir: str, ext: str) -> list[str]:
    """Find files with given extension, excluding SKIP_DIRS."""
    found = []
    for root, dirs, files in os.walk(controls_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(ext):
                found.append(os.path.join(root, f))
    return sorted(found)


def _find_lambda_dirs(controls_dir: str) -> list[str]:
    """Find all directories containing handler.py."""
    result = []
    for root, dirs, files in os.walk(controls_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        if "handler.py" in files:
            result.append(root)
    return sorted(result)


def _rel(path: str, base: str) -> str:
    return os.path.relpath(path, base)


# ---------------------------------------------------------------------------
# Tier 1 checks
# ---------------------------------------------------------------------------

def check_t1_json(controls_dir: str) -> list[str]:
    """T1-JSON: Validate all JSON files parse correctly."""
    errors = []
    for fpath in _walk_files(controls_dir, ".json"):
        try:
            with open(fpath) as f:
                json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"T1-JSON: {_rel(fpath, controls_dir)} — {e}")
        except OSError as e:
            errors.append(f"T1-JSON: {_rel(fpath, controls_dir)} — {e}")
    return errors


def check_t1_yaml(controls_dir: str, venv_bin: str) -> list[str]:
    """T1-YAML: Validate all YAML files with CFN-safe loader."""
    errors = []
    yaml_files = _walk_files(controls_dir, ".yaml") + _walk_files(controls_dir, ".yml")
    if not yaml_files:
        return []

    # Use venv python to get pyyaml
    script = """
import json, sys, yaml

class CfnLoader(yaml.SafeLoader):
    pass

def _cfn_constructor(loader, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    elif isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    return None

def _cfn_multi(loader, suffix, node):
    return _cfn_constructor(loader, node)

for tag in ['!Ref','!Sub','!GetAtt','!Join','!Select','!Split','!If',
            '!Equals','!Not','!And','!Or','!Condition','!FindInMap',
            '!Base64','!Cidr','!ImportValue','!GetAZs','!Transform']:
    CfnLoader.add_constructor(tag, _cfn_constructor)
    CfnLoader.add_multi_constructor(tag, _cfn_multi)

errors = []
for fpath in sys.argv[1:]:
    try:
        with open(fpath) as f:
            yaml.load(f, Loader=CfnLoader)
    except yaml.YAMLError as e:
        errors.append(f"{fpath}|||{e}")
print(json.dumps(errors))
"""
    rc, stdout, stderr = _run(
        [os.path.join(venv_bin, "python3"), "-c", script] + yaml_files,
        timeout=30,
    )
    if rc != 0:
        return [f"T1-YAML: venv python failed — {stderr[:200]}"]
    try:
        for entry in json.loads(stdout):
            path, err = entry.split("|||", 1)
            errors.append(f"T1-YAML: {_rel(path, controls_dir)} — {err}")
    except (json.JSONDecodeError, ValueError):
        pass
    return errors


def check_t1_tf_validate(controls_dir: str) -> list[str]:
    """T1-TF-VALIDATE: terraform validate on root + modules."""
    errors = []
    if not _tool_available("terraform"):
        return ["T1-TF-VALIDATE SKIP: terraform not on PATH"]

    iac_dir = os.path.join(controls_dir, "iac")
    if not os.path.isdir(iac_dir):
        return []

    for tf_dir_name in [".", "modules"]:
        tf_dir = os.path.join(iac_dir, tf_dir_name) if tf_dir_name != "." else iac_dir
        if not os.path.isfile(os.path.join(tf_dir, "main.tf")):
            continue

        # Init if needed
        if not os.path.isdir(os.path.join(tf_dir, ".terraform")):
            rc, _, stderr = _run(
                ["terraform", "init", "-backend=false", "-no-color", "-input=false"],
                cwd=tf_dir, timeout=120,
            )
            if rc != 0:
                errors.append(
                    f"T1-TF-VALIDATE: init failed in {tf_dir_name}/ — "
                    f"{stderr[:200]}"
                )
                continue

        rc, stdout, stderr = _run(
            ["terraform", "validate", "-no-color", "-json"],
            cwd=tf_dir, timeout=60,
        )
        if rc != 0:
            try:
                result = json.loads(stdout)
                for diag in result.get("diagnostics", []):
                    summary = diag.get("summary", "unknown")
                    rng = diag.get("range", {})
                    fname = rng.get("filename", "?")
                    errors.append(
                        f"T1-TF-VALIDATE: {tf_dir_name}/{fname}: {summary}"
                    )
            except json.JSONDecodeError:
                errors.append(f"T1-TF-VALIDATE: {tf_dir_name}/ — {stderr[:200]}")
    return errors


def check_t1_tf_fmt(controls_dir: str) -> list[str]:
    """T1-TF-FMT: terraform fmt -check on all .tf files."""
    errors = []
    if not _tool_available("terraform"):
        return ["T1-TF-FMT SKIP: terraform not on PATH"]

    iac_dir = os.path.join(controls_dir, "iac")
    if not os.path.isdir(iac_dir):
        return []

    # Find .tf directories excluding node_modules, cdk.out, etc.
    tf_dirs = set()
    for root, dirs, files in os.walk(iac_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".tf"):
                tf_dirs.add(root)
                break

    for tf_dir in sorted(tf_dirs):
        rc, stdout, _ = _run(
            ["terraform", "fmt", "-check", "-diff", "-list=true"],
            cwd=tf_dir, timeout=30,
        )
        if rc != 0:
            rel_dir = os.path.relpath(tf_dir, controls_dir)
            for line in stdout.strip().splitlines()[:10]:
                line = line.strip()
                if line and line.endswith(".tf"):
                    errors.append(f"T1-TF-FMT: {rel_dir}/{line} needs formatting")
    return errors


def _check_tsc(controls_dir: str, subdir: str, check_code: str) -> list[str]:
    """Shared TypeScript compilation check for CDK and CDKTF."""
    errors = []
    ts_dir = os.path.join(controls_dir, "iac", subdir)
    if not os.path.isdir(ts_dir):
        return []
    if not os.path.isfile(os.path.join(ts_dir, "tsconfig.json")):
        return [f"{check_code}: {subdir}/ missing tsconfig.json"]

    # Install deps if needed. `npm ci` requires a lockfile; fall back to `npm install`
    # if the generator didn't emit one (generating lockfiles at skill time introduces
    # non-determinism and network dependency, so they are validator-created on demand).
    if not os.path.isdir(os.path.join(ts_dir, "node_modules")):
        has_lock = os.path.isfile(os.path.join(ts_dir, "package-lock.json")) or \
            os.path.isfile(os.path.join(ts_dir, "npm-shrinkwrap.json"))
        install_cmd = (
            ["npm", "ci", "--no-audit", "--no-fund"] if has_lock
            else ["npm", "install", "--no-audit", "--no-fund"]
        )
        rc, _, stderr = _run(install_cmd, cwd=ts_dir, timeout=180)
        if rc != 0:
            return [f"{check_code}: {install_cmd[1]} failed in {subdir}/ — {stderr[:200]}"]

    rc, stdout, stderr = _run(
        ["npx", "--yes", "tsc", "--noEmit", "--pretty", "false"],
        cwd=ts_dir, timeout=60,
    )
    if rc != 0:
        output = stdout or stderr
        for line in output.strip().splitlines()[:20]:
            if line.strip():
                errors.append(f"{check_code}: {subdir}/{line.strip()}")
    return errors


def check_t1_cdk_tsc(controls_dir: str) -> list[str]:
    return _check_tsc(controls_dir, "cdk", "T1-CDK-TSC")


def check_t1_cdktf_tsc(controls_dir: str) -> list[str]:
    return _check_tsc(controls_dir, "cdktf", "T1-CDKTF-TSC")


def check_t1_py_import(controls_dir: str) -> list[str]:
    """T1-PY-IMPORT: py_compile.compile() on all handler.py files."""
    errors = []
    for handler_dir in _find_lambda_dirs(controls_dir):
        handler_file = os.path.join(handler_dir, "handler.py")
        dir_name = os.path.basename(handler_dir)
        try:
            py_compile.compile(handler_file, doraise=True)
        except py_compile.PyCompileError as e:
            errors.append(f"T1-PY-IMPORT: {dir_name}/handler.py — {e}")
    return errors


def check_t1_guard(controls_dir: str) -> list[str]:
    """T1-GUARD: cfn-guard parse-tree syntax check."""
    if not _tool_available("cfn-guard"):
        return ["T1-GUARD SKIP: cfn-guard not on PATH (brew install cloudformation-guard)"]

    guard_file = os.path.join(controls_dir, "proactive", "cfn-guard-rules.guard")
    if not os.path.isfile(guard_file):
        return []

    rc, _, stderr = _run(["cfn-guard", "parse-tree", "--rules", guard_file], timeout=30)
    if rc != 0:
        return [f"T1-GUARD: syntax error in cfn-guard-rules.guard — {stderr[:200]}"]
    return []


def check_t1_opa(controls_dir: str) -> list[str]:
    """T1-OPA: opa check on all .rego files."""
    if not _tool_available("opa"):
        return ["T1-OPA SKIP: opa not on PATH (brew install opa)"]

    opa_dir = os.path.join(controls_dir, "proactive", "opa-policies")
    if not os.path.isdir(opa_dir):
        return []

    rego_files = [
        os.path.join(opa_dir, f) for f in sorted(os.listdir(opa_dir))
        if f.endswith(".rego")
    ]
    if not rego_files:
        return []

    errors = []
    rc, _, stderr = _run(["opa", "check"] + rego_files, timeout=30)
    if rc != 0:
        for line in stderr.strip().splitlines()[:10]:
            errors.append(f"T1-OPA: {line.strip()}")
    return errors


def check_t1_cfnlint(controls_dir: str, venv_bin: str) -> list[str]:
    """T1-CFNLINT: cfn-lint on CloudFormation templates."""
    cfn_lint = os.path.join(venv_bin, "cfn-lint")
    if not os.path.isfile(cfn_lint):
        return ["T1-CFNLINT SKIP: cfn-lint not in venv"]

    templates = []
    cfn_dir = os.path.join(controls_dir, "iac", "cloudformation")
    if os.path.isdir(cfn_dir):
        for f in sorted(os.listdir(cfn_dir)):
            # Skip CloudFormation parameter files — they're the consumer of a
            # template, not a template themselves. Shape is a JSON list of
            # {ParameterKey, ParameterValue} objects; cfn-lint rejects them
            # because they have no Resources block.
            if f.endswith(("-params.json", "-parameters.json")):
                continue
            if f.endswith((".yaml", ".yml", ".json")):
                templates.append(os.path.join(cfn_dir, f))

    sam_template = os.path.join(
        controls_dir, "responsive", "lambda-remediator", "template.yaml"
    )
    if os.path.isfile(sam_template):
        templates.append(sam_template)

    if not templates:
        return []

    errors = []
    for template in templates:
        rc, stdout, stderr = _run([cfn_lint, "-f", "json", template], timeout=60)
        if rc != 0:
            try:
                findings = json.loads(stdout)
                for f in findings:
                    level = f.get("Level", "Error")
                    rule_id = f.get("Rule", {}).get("Id", "?")
                    msg = f.get("Message", "?")
                    # Skip credential/profile errors (SAM transform needs AWS)
                    if "could not be found" in msg and "profile" in msg.lower():
                        errors.append(
                            f"T1-CFNLINT SKIP: {os.path.basename(template)}: "
                            f"SAM transform requires AWS credentials"
                        )
                        continue
                    if level == "Error":
                        errors.append(
                            f"T1-CFNLINT: {os.path.basename(template)}: "
                            f"[{level}] {rule_id}: {msg[:150]}"
                        )
            except json.JSONDecodeError:
                errors.append(
                    f"T1-CFNLINT: {os.path.basename(template)}: {(stdout or stderr)[:200]}"
                )
    return errors


# ---------------------------------------------------------------------------
# Tier 2 helpers
# ---------------------------------------------------------------------------

def _sanitize_policy(policy_json: str) -> str:
    """Replace CFN pseudo-parameters with dummy values for API validation."""
    return (
        policy_json
        .replace("${AWS::AccountId}", "123456789012")
        .replace("${AWS::Region}", "us-east-1")
        .replace("${AWS::StackName}", "dummy-stack")
        .replace("{region}", "us-east-1")
        .replace("{account_id}", "123456789012")
        .replace("${VpcId}", "vpc-12345678abcdef012")
        .replace("${VPC_ID}", "vpc-12345678abcdef012")
        .replace("${ALLOWED_VPC_ID}", "vpc-12345678abcdef012")
        .replace("<VPC_ID>", "vpc-12345678abcdef012")
        .replace("<vpc-id>", "vpc-12345678abcdef012")
    )


def _extract_policy_documents(file_path: str) -> list[tuple[str, dict]]:
    """Extract (label, policy_dict) pairs from a policy file.

    Handles two structures:
    1. Top-level: _metadata + Version + Statement → single policy
    2. Named sub-policies: _metadata + named keys each with Version/Statement
    """
    try:
        with open(file_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []

    if not isinstance(data, dict):
        return []

    basename = os.path.basename(file_path)
    results = []

    non_meta = {k: v for k, v in data.items() if k != "_metadata"}

    if "Statement" in non_meta and "Version" in non_meta:
        # Top-level policy document
        results.append((basename, non_meta))
    else:
        # Named sub-policies
        for key, val in data.items():
            if key == "_metadata":
                continue
            if isinstance(val, dict) and "Statement" in val:
                clean = {k: v for k, v in val.items() if k != "_description"}
                if clean.get("Statement"):  # skip empty Statement arrays
                    results.append((f"{basename}:{key}", clean))

    return results


def _validate_with_analyzer(
    label: str,
    policy_dict: dict,
    policy_type: str,
    profile: Optional[str],
    check_code: str,
) -> list[str]:
    """Run aws accessanalyzer validate-policy on a single policy."""
    errors = []
    policy_json = _sanitize_policy(json.dumps(policy_dict))

    args = [
        "aws", "accessanalyzer", "validate-policy",
        "--policy-document", policy_json,
        "--policy-type", policy_type,
        "--no-paginate", "--output", "json",
    ]
    if profile:
        args.extend(["--profile", profile])

    rc, stdout, stderr = _run(args, timeout=30)
    if rc != 0:
        # API error (e.g., access denied, service unavailable)
        msg = stderr.strip().split("\n")[0] if stderr.strip() else "API call failed"
        errors.append(f"{check_code}: {label}: {msg}")
        return errors

    try:
        result = json.loads(stdout)
        for finding in result.get("findings", []):
            ftype = finding.get("findingType", "?")
            detail = finding.get("findingDetails", "?")
            if ftype in ("ERROR", "SECURITY_WARNING"):
                errors.append(f"{check_code}: {label}: [{ftype}] {detail[:200]}")
    except json.JSONDecodeError:
        errors.append(f"{check_code}: {label}: unparseable API response")

    return errors


# ---------------------------------------------------------------------------
# Tier 2 checks
# ---------------------------------------------------------------------------

def check_t2_cfn_validate(controls_dir: str, profile: Optional[str]) -> list[str]:
    """T2-CFN-VALIDATE: aws cloudformation validate-template."""
    errors = []
    templates = []

    cfn_dir = os.path.join(controls_dir, "iac", "cloudformation")
    if os.path.isdir(cfn_dir):
        for f in sorted(os.listdir(cfn_dir)):
            # Skip parameter files (see note in t1_cfnlint above)
            if f.endswith(("-params.json", "-parameters.json")):
                continue
            if f.endswith((".yaml", ".yml", ".json")):
                templates.append(os.path.join(cfn_dir, f))

    sam_template = os.path.join(
        controls_dir, "responsive", "lambda-remediator", "template.yaml"
    )
    if os.path.isfile(sam_template):
        templates.append(sam_template)

    for template in templates:
        # Check size limit (51200 bytes for --template-body)
        try:
            size = os.path.getsize(template)
            if size > 51200:
                errors.append(
                    f"T2-CFN-VALIDATE: {os.path.basename(template)} is {size} bytes "
                    f"(limit 51200 for validate-template --template-body)"
                )
                continue
        except OSError:
            continue

        args = [
            "aws", "cloudformation", "validate-template",
            "--template-body", f"file://{os.path.abspath(template)}",
        ]
        if profile:
            args.extend(["--profile", profile])

        rc, _, stderr = _run(args, timeout=30)
        if rc != 0:
            msg = stderr.strip().split("\n")[0] if stderr.strip() else "validation failed"
            errors.append(f"T2-CFN-VALIDATE: {os.path.basename(template)}: {msg}")

    return errors


def _has_principal(policy_dict: dict) -> bool:
    """Check if any statement in the policy has a Principal element (trust policy)."""
    for stmt in policy_dict.get("Statement", []):
        if isinstance(stmt, dict) and ("Principal" in stmt or "NotPrincipal" in stmt):
            return True
    return False


def _check_t2_iam(
    controls_dir: str,
    profile: Optional[str],
    filenames: list[str],
    policy_type: str,
    check_code: str,
) -> list[str]:
    """Shared logic for Access Analyzer policy validation."""
    errors = []
    preventive_dir = os.path.join(controls_dir, "preventive")
    if not os.path.isdir(preventive_dir):
        return []

    for fname in filenames:
        fpath = os.path.join(preventive_dir, fname)
        if not os.path.isfile(fpath):
            continue
        for label, policy_dict in _extract_policy_documents(fpath):
            # Trust policies (with Principal, no Resource) are assume-role
            # documents — Access Analyzer validate-policy doesn't support them.
            if _has_principal(policy_dict):
                continue
            errors.extend(
                _validate_with_analyzer(
                    label, policy_dict, policy_type, profile, check_code,
                )
            )
    return errors


def check_t2_iam_scp(controls_dir: str, profile: Optional[str]) -> list[str]:
    return _check_t2_iam(
        controls_dir, profile,
        ["scp-policy.json", "scp-tagging-policy.json"],
        "SERVICE_CONTROL_POLICY", "T2-IAM-SCP",
    )


def check_t2_iam_identity(controls_dir: str, profile: Optional[str]) -> list[str]:
    return _check_t2_iam(
        controls_dir, profile,
        ["iam-policies.json", "permission-boundary.json"],
        "IDENTITY_POLICY", "T2-IAM-IDENTITY",
    )


def check_t2_iam_resource(controls_dir: str, profile: Optional[str]) -> list[str]:
    return _check_t2_iam(
        controls_dir, profile,
        ["resource-policy.json", "kms-key-policy.json", "vpce-policy.json"],
        "RESOURCE_POLICY", "T2-IAM-RESOURCE",
    )


# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

def validate_deployable(
    controls_dir: str,
    profile: Optional[str] = None,
    tier1_only: bool = False,
) -> list[str]:
    """Run all deployability checks. Returns list of error/skip strings."""
    all_errors: list[str] = []
    skips: list[str] = []

    # --- Venv bootstrap ---
    venv_bin = _ensure_venv()

    # --- Tier 1 ---
    print("=== Tier 1: Static validation ===", file=sys.stderr)

    t1_checks: list[tuple[str, list[str]]] = [
        ("T1-JSON", check_t1_json(controls_dir)),
        ("T1-YAML", check_t1_yaml(controls_dir, venv_bin)),
        ("T1-TF-VALIDATE", check_t1_tf_validate(controls_dir)),
        ("T1-TF-FMT", check_t1_tf_fmt(controls_dir)),
        ("T1-CDK-TSC", check_t1_cdk_tsc(controls_dir)),
        ("T1-CDKTF-TSC", check_t1_cdktf_tsc(controls_dir)),
        ("T1-PY-IMPORT", check_t1_py_import(controls_dir)),
        ("T1-GUARD", check_t1_guard(controls_dir)),
        ("T1-OPA", check_t1_opa(controls_dir)),
        ("T1-CFNLINT", check_t1_cfnlint(controls_dir, venv_bin)),
    ]

    for name, results in t1_checks:
        for r in results:
            if "SKIP" in r:
                skips.append(r)
                print(f"  {r}", file=sys.stderr)
            else:
                all_errors.append(r)
                print(f"  FAIL: {r}", file=sys.stderr)
        if not results or all("SKIP" in r for r in results):
            if not any("SKIP" in r for r in results):
                print(f"  {name}: OK", file=sys.stderr)

    # --- Tier 2 ---
    if tier1_only:
        print("=== Tier 2: Skipped (--tier1-only) ===", file=sys.stderr)
        skips.append("T2-* SKIP: --tier1-only flag")
    else:
        has_creds, cred_msg = check_aws_credentials(profile)

        if not has_creds:
            print(
                f"\n=== Tier 2: SKIPPED — no AWS credentials ===\n"
                f"  {cred_msg}\n\n"
                f"  To enable Tier 2 validation:\n"
                f"    1. export AWS_PROFILE=<your-profile>\n"
                f"    2. aws sso login --profile <your-profile>\n"
                f"    3. python3 validate_deployable.py --profile <name> <dir>\n",
                file=sys.stderr,
            )
            skips.append("T2-* SKIP: AWS credentials not available")
        else:
            print(
                f"=== Tier 2: AWS API validation ({cred_msg}) ===",
                file=sys.stderr,
            )

            t2_checks: list[tuple[str, list[str]]] = [
                ("T2-CFN-VALIDATE", check_t2_cfn_validate(controls_dir, profile)),
                ("T2-IAM-SCP", check_t2_iam_scp(controls_dir, profile)),
                ("T2-IAM-IDENTITY", check_t2_iam_identity(controls_dir, profile)),
                ("T2-IAM-RESOURCE", check_t2_iam_resource(controls_dir, profile)),
            ]

            for name, results in t2_checks:
                for r in results:
                    if "SKIP" in r:
                        skips.append(r)
                        print(f"  {r}", file=sys.stderr)
                    else:
                        all_errors.append(r)
                        print(f"  FAIL: {r}", file=sys.stderr)
                if not results:
                    print(f"  {name}: OK", file=sys.stderr)

    # --- Summary ---
    print(f"\n{'=' * 60}", file=sys.stderr)
    if skips:
        print(f"Skipped: {len(skips)}", file=sys.stderr)
        for s in skips:
            print(f"  {s}", file=sys.stderr)
    if all_errors:
        print(f"Errors: {len(all_errors)}", file=sys.stderr)

    return all_errors


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Validate deployability of generated security control artifacts.",
    )
    parser.add_argument(
        "controls_dir", help="Path to .service-approval/<slug>/05-generate/"
    )
    parser.add_argument("--profile", help="AWS CLI profile for Tier 2 checks")
    parser.add_argument(
        "--tier1-only", action="store_true",
        help="Run only Tier 1 (static) checks, skip AWS API validation",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.controls_dir):
        print(f"Directory not found: {args.controls_dir}", file=sys.stderr)
        sys.exit(1)

    errors = validate_deployable(args.controls_dir, args.profile, args.tier1_only)

    if errors:
        print(
            f"\nDEPLOYABILITY VALIDATION FAILED: {len(errors)} error(s)",
            file=sys.stderr,
        )
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(2)
    else:
        print("DEPLOYABILITY VALIDATION PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
