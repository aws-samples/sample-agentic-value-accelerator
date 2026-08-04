"""Regression test R16: verify no legacy path references remain.

After the evidence-attestation layout migration, no skill, validator, hook,
or script should reference the old `.service-approval/state/` or
`.service-approval/controls/` paths (except in docs/plans/ and git history).

This test greps the repo and fails if it finds hardcoded legacy paths in
production code. It runs both a literal substring search AND a regex pass
that catches dynamic constructions (Path("...") / "state", os.path.join, etc.).
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest


def _repo_root() -> Path:
    """Return repository root (anchors on manifest.yaml — project marker)."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / "manifest.yaml").exists():
            return current
        current = current.parent
    raise RuntimeError("Could not find repository root (no manifest.yaml found walking up)")


# Production-code paths must NEVER reference the legacy layout. Allowlist is
# narrow on purpose:
# - docs/plans/ — historical design docs explaining the migration (read-only)
# - tests + helpers that document the legacy path itself (paths.legacy_state_dir)
# - this test file (it contains the literal pattern by definition)
#
# skills/, powers/, scripts/, rules/ have been removed from the allowlist —
# any remaining legacy ref in those areas is a runtime bug because they
# execute on the user's machine.
_ALLOWED_PREFIXES = (
    "docs/plans/",   # plan documents reference old layout (historical)
)

_ALLOWED_FILENAMES = (
    "test_no_legacy_path_refs.py",  # this test (matches the literal in its allow rules)
    "test_intake_promotion.py",     # explicit migration test fixture
    "test_paths.py",                # W1 helper test
    "tools/paths.py",               # W1 — legacy_state_dir() documents the path
    "hook_post_tool_use.py",        # legacy detection + migration warning text
    "generate-kiro-agents.py",      # W6 generator (only describes paths in prose comments)
    "block-direct-state-writes.kiro.hook",  # Kiro guardrail prompt names the legacy paths it blocks
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "CHANGELOG",
    ".gitignore",
)


def _is_allowed_legacy_path(file_path: str) -> bool:
    """Return True if the file is on the migration-fallback allowlist.

    git grep emits relative paths (e.g., `powers/foo.md`); recursive `grep -r`
    emits absolute paths (e.g., `/Users/.../repo/powers/foo.md`). Normalize by
    accepting matches whether the prefix appears at start-of-string or with a
    leading `/`.
    """
    norm = file_path.replace("\\", "/")
    if "/.git/" in norm:
        return True
    for prefix in _ALLOWED_PREFIXES:
        if norm.startswith(prefix) or f"/{prefix}" in norm:
            return True
    for token in _ALLOWED_FILENAMES:
        if token in norm:
            return True
    return False


def _git_or_skip():
    """Return git binary path, or skip if missing under non-CI envs.

    Under CI=true (GitLab CI, GitHub Actions), R16 is a hard fail-closed gate —
    a regression-prevention test that no-ops when git is missing isn't a gate
    at all, so we error out and tell the runner to install git.
    """
    git = shutil.which("git")
    if git is None:
        ci = os.environ.get("CI", "").lower() in ("true", "1", "yes")
        if ci:
            pytest.fail(
                "R16 requires `git` to scan for legacy path references but git "
                "is not on PATH. Under CI, this is a fail-closed gate. Install "
                "git in the CI image (e.g., `apt-get install -y git`)."
            )
        pytest.skip("git not available on PATH; R16 grep test requires git (set CI=true to fail-closed instead)")
    return git


def _run_git_grep(pattern: str, root: Path, regex: bool = False) -> list[str]:
    """Run `git grep` with the given pattern and return matched lines.

    Args:
        pattern: substring (when regex=False) or POSIX-extended regex (when regex=True)
        root: repo root to search from
        regex: True → use `git grep -E`; False → fixed-string

    Returns:
        List of "file:line:content" matches.
    """
    git = _git_or_skip()
    args = [git, "grep", "-n"]
    if regex:
        args.append("-E")
    else:
        args.append("-F")
    args.append(pattern)
    result = subprocess.run(args, capture_output=True, text=True, cwd=str(root))
    if result.returncode != 0:
        return []
    return result.stdout.strip().split("\n")


# R16 grep patterns — used by both the production gate and the
# trip-case (test_r16_catches_dynamic_constructions). A future regex
# tightening must update only these constants; both the production
# pass and the trip-case re-resolve to the same pattern strings.
_R16_STATE_PASS1 = r"\.service-approval/state[/\"']"
_R16_STATE_PASS2 = r"\.service-approval[\"'][^\"']*[\"']state[\"']"
_R16_STATE_PASS3 = r"\.service-approval/[^\"'/ ]+/state([-/]|[\"' ])"

_R16_CONTROLS_PASS1 = r"\.service-approval/controls[/\"']"
_R16_CONTROLS_PASS2 = r"\.service-approval[\"'][^\"']*[\"']controls[\"']"
_R16_CONTROLS_PASS3 = r"\.service-approval/[^\"'/ ]+/controls([-/]|[\"' ])"


def _violations(matches: list[str], extra_filter=None) -> list[str]:
    """Filter raw `git grep` output through the allowlist."""
    out = []
    for line in matches:
        if ":" not in line:
            continue
        parts = line.split(":", 2)
        if len(parts) < 2:
            continue
        file_path = parts[0]
        if _is_allowed_legacy_path(file_path):
            continue
        if extra_filter and extra_filter(file_path, line):
            continue
        out.append(line)
    return out


def test_no_legacy_state_refs():
    """Verify no hardcoded `.service-approval/state/` refs in production code.

    Runs three passes (each catches a different evasion vector):
    1. Literal substring search for `.service-approval/state/`
    2. Path/os.path.join construction with quote-comma-quote pattern:
         - Path(".service-approval") / "state"
         - os.path.join(".service-approval", "state", ...)
       Matches: `.service-approval"` + (whitespace, comma, slash, paren) +
       `"state"` on the same line.
    3. F-string segment search: f".service-approval/...state..." or
       f".service-approval/{slug}/state-..." — anywhere a literal "state"
       appears as a path segment after .service-approval/ even when the
       intermediate slug is a placeholder.
    """
    root = _repo_root()

    # Pass 1: literal substring `.service-approval/state` followed by `/`, `"`,
    # or `'` (close-quote). Catches both `.service-approval/state/` (path
    # continuation) and `.service-approval/state"`/`.service-approval/state'`
    # (single-string `Path(".service-approval/state")` form). Without this
    # alternation, a single-quoted-literal with no trailing slash escapes Pass 1
    # and (because there's no quote-comma split) Passes 2 and 3 too.
    matches_literal = _run_git_grep(_R16_STATE_PASS1, root, regex=True)
    # Pass 2: Path("...") / "state", os.path.join("...", "state", ...)
    # Accepts any non-quote chars (whitespace, comma, slash, paren) between
    # the closing quote of ".service-approval" and the opening quote of "state".
    matches_construct = _run_git_grep(_R16_STATE_PASS2, root, regex=True)
    # Pass 3: f-strings where 'state' is a path segment under
    # .service-approval/{anything}/state — the legacy flat layout.
    # The new per-slug layout has `state` only as a substring of `validate`
    # phase suffix (`03-validate`), never as its own segment.
    matches_fstring = _run_git_grep(_R16_STATE_PASS3, root, regex=True)

    all_matches = matches_literal[:]
    for m in matches_construct + matches_fstring:
        if m not in all_matches:
            all_matches.append(m)
    violations = _violations(all_matches)

    if violations:
        msg = (
            "R16 VIOLATION: Found hardcoded `.service-approval/state/` references in production code.\n"
            "After the evidence-attestation migration, use `tools.paths` helpers instead.\n\n"
            "Violations:\n" + "\n".join(f"  {v}" for v in violations)
        )
        raise AssertionError(msg)


def test_no_legacy_controls_refs():
    """Verify no hardcoded `.service-approval/controls/` refs in production code.

    After migration, controls live at `<slug>/05-generate/`.
    """
    root = _repo_root()

    matches_literal = _run_git_grep(_R16_CONTROLS_PASS1, root, regex=True)
    matches_construct = _run_git_grep(_R16_CONTROLS_PASS2, root, regex=True)
    # Same pattern as state: legacy `controls/` is a top-level segment.
    # The new layout puts `controls` only inside file names
    # (`controls-catalog.md`, `map-controls-generated.json`) or after a
    # longer prefix (`05-generate/...`), never as `<slug>/controls`.
    matches_fstring = _run_git_grep(
        _R16_CONTROLS_PASS3,
        root,
        regex=True,
    )

    def _migration_fallback_filter(file_path: str, line: str) -> bool:
        # validate_kms_consumers.py has legacy fallback for migration
        if "validate_kms_consumers.py" in file_path and "/controls/iac/" in line:
            return True
        # hook_post_tool_use.py has legacy dispatch for migration
        if "hook_post_tool_use.py" in file_path and "/controls/" in line:
            return True
        return False

    all_matches = matches_literal[:]
    for m in matches_construct + matches_fstring:
        if m not in all_matches:
            all_matches.append(m)
    violations = _violations(all_matches, extra_filter=_migration_fallback_filter)

    if violations:
        msg = (
            "R16 VIOLATION: Found hardcoded `.service-approval/controls/` references in production code.\n"
            "After the evidence-attestation migration, use `tools.paths.phase_dir(slug, 'generate')` instead.\n\n"
            "Violations:\n" + "\n".join(f"  {v}" for v in violations)
        )
        raise AssertionError(msg)


# ---------------------------------------------------------------------------
# Positive trip case — assert the gate actually catches violations
# ---------------------------------------------------------------------------

def test_r16_positive_trip(tmp_path, monkeypatch):
    """R16 must FAIL on a synthetic repo containing a legacy ref.

    Without this, R16 is "absence of evidence" rather than a tested gate.
    Construct a tmp git repo with a single offending file; run the same
    `git grep` invocation; assert the result is non-empty.
    """
    git = _git_or_skip()

    # Initialize a tmp git repo
    subprocess.run([git, "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run([git, "config", "user.email", "r16-test@example.com"], cwd=tmp_path, check=True)
    subprocess.run([git, "config", "user.name", "r16-test"], cwd=tmp_path, check=True)

    # Create a file that should trigger R16 (NOT in allowlist; manifest-anchored root)
    (tmp_path / "manifest.yaml").write_text("name: r16-positive-trip\n")
    bad = tmp_path / "tools" / "validate" / "fake_module.py"
    bad.parent.mkdir(parents=True)
    bad.write_text(
        'import os\n'
        'OUTPUT = ".service-approval/state/output.json"\n'
    )
    subprocess.run([git, "add", "."], cwd=tmp_path, check=True)
    subprocess.run([git, "commit", "-qm", "synthetic violation"], cwd=tmp_path, check=True)

    # Verify git grep finds the offending line
    result = subprocess.run(
        [git, "grep", "-n", ".service-approval/state/"],
        capture_output=True, text=True, cwd=tmp_path,
    )
    assert result.returncode == 0, "git grep should have found the violation"
    assert ".service-approval/state/" in result.stdout, (
        "Synthetic violation not detected — R16 mechanism is broken"
    )
    # And critically: tools/validate/fake_module.py is NOT in the allowlist
    assert not _is_allowed_legacy_path("tools/validate/fake_module.py"), (
        "tools/validate/fake_module.py was unexpectedly allowlisted — R16 would fail open"
    )


def _exercise_r16_trip(tmp_path, offending_line: str, patterns: list[str]) -> None:
    """Build a tmp git repo containing `offending_line` and assert that at
    least one of the given R16 regex patterns matches via `git grep -E`.

    Shared by the state-side and controls-side parametrized trip-cases so
    both gates exercise the same fixture-build flow against the same
    module-level constants the production tests use.
    """
    git = _git_or_skip()
    subprocess.run([git, "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run([git, "config", "user.email", "r16-test@example.com"], cwd=tmp_path, check=True)
    subprocess.run([git, "config", "user.name", "r16-test"], cwd=tmp_path, check=True)

    (tmp_path / "manifest.yaml").write_text("name: r16-dynamic-trip\n")
    bad = tmp_path / "tools" / "fake_module.py"
    bad.parent.mkdir(parents=True)
    bad.write_text(f"import os\nfrom pathlib import Path\n{offending_line}\n")
    subprocess.run([git, "add", "."], cwd=tmp_path, check=True)
    subprocess.run([git, "commit", "-qm", "synthetic"], cwd=tmp_path, check=True)

    results = [
        subprocess.run(
            [git, "grep", "-nE", pat],
            capture_output=True, text=True, cwd=tmp_path,
        )
        for pat in patterns
    ]
    matched = any(r.returncode == 0 for r in results)
    assert matched, (
        f"R16 failed to catch offending line: {offending_line}\n"
        + "\n".join(
            f"  {pat!r}: rc={r.returncode} {r.stdout!r}"
            for pat, r in zip(patterns, results)
        )
    )


@pytest.mark.parametrize("offending_line", [
    # Literal substring (pass 1)
    'OUTPUT = ".service-approval/state/output.json"',
    # Path() / "state" (pass 2 — quote-comma-quote / Path-slash construction)
    'OUTPUT = Path(".service-approval") / "state" / "output.json"',
    'OUTPUT = os.path.join(".service-approval", "state", "output.json")',
    # F-string with placeholder slug + state segment (pass 3 — the M1 evasion)
    'OUTPUT = f".service-approval/{slug}/state/output.json"',
    'OUTPUT = f".service-approval/{slug}/state-x/output.json"',
    # PurePath / single-quoted Path construction (matches pass 2)
    "OUTPUT = Path('.service-approval') / 'state' / 'a.json'",
    # F-string with bare `state` segment, no trailing slash (matches pass 3
    # via the [-/\"' ] character class)
    'OUTPUT = f".service-approval/{slug}/state"  # bare segment',
])
def test_r16_state_catches_dynamic_constructions(tmp_path, offending_line):
    """Every state-side parametrize case must trip _R16_STATE_PASS1/2/3."""
    _exercise_r16_trip(
        tmp_path, offending_line,
        [_R16_STATE_PASS1, _R16_STATE_PASS2, _R16_STATE_PASS3],
    )


@pytest.mark.parametrize("offending_line", [
    # Literal substring with trailing slash
    'OUTPUT = ".service-approval/controls/output.json"',
    # Path() / "controls" (quote-comma-quote / Path-slash construction)
    'OUTPUT = Path(".service-approval") / "controls" / "output.json"',
    'OUTPUT = os.path.join(".service-approval", "controls", "output.json")',
    # F-string with placeholder slug + controls segment
    'OUTPUT = f".service-approval/{slug}/controls/output.json"',
    # PurePath / single-quoted Path construction
    "OUTPUT = Path('.service-approval') / 'controls' / 'a.json'",
    # F-string with bare `controls` segment, no trailing slash — matches
    # PASS3 via the terminal `[\"' ]` char class
    'OUTPUT = f".service-approval/{slug}/controls"  # bare segment',
])
def test_r16_controls_catches_dynamic_constructions(tmp_path, offending_line):
    """Every controls-side parametrize case must trip _R16_CONTROLS_PASS1/2/3."""
    _exercise_r16_trip(
        tmp_path, offending_line,
        [_R16_CONTROLS_PASS1, _R16_CONTROLS_PASS2, _R16_CONTROLS_PASS3],
    )


if __name__ == "__main__":
    test_no_legacy_state_refs()
    test_no_legacy_controls_refs()
    print("R16 PASS: No legacy path references found.")
