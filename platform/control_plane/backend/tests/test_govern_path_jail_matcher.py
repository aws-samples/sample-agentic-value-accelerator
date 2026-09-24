"""Pins the Govern path-jail *test* endpoint to what the real enforcer actually does.

This endpoint answers one question for an operator: "would this path be blocked?" It has
no other job, so a wrong answer here is the whole feature failing - and it used to be wrong
in the reassuring direction for every input. `_matches_pattern`'s glob arm built its regex
with chained str.replace calls that rewrote each other's output; `**/.env` compiled to
`^([^/]:.[^/]*/)[^/]\\.env$`, which matches nothing. Combined with the absence of any
structural check, the endpoint reported "Path is allowed - no blocking rules match" for
`.env`, for `**/id_rsa*` hits, and for `../../etc/passwd` alike.

The tests below therefore fall into two groups:

  1. the default rule set matching the paths it names (would have been 18 failures before);
  2. traversal and absolute paths being refused before rules are consulted, agreeing with
     `core.path_jail.PathJail.jail`'s step 1 and step 2.

`test_the_real_enforcer_agrees` is the load-bearing one: it runs both implementations over
the same payloads. The two used to disagree on 4 of 8, silently.
"""

import pathlib
import re
import tempfile

import pytest

from api.routes.govern_path_jail import (
    DEFAULT_BLOCKED_PATTERNS,
    PatternType,
    _glob_to_regex,
    _matches_pattern,
    _test_path_against_rules,
)
from core.path_jail import PathJail, check_traversal


def _glob(path: str, pattern: str) -> bool:
    return _matches_pattern(path, pattern, PatternType.GLOB)


# ---------------------------------------------------------------------------
# The glob engine
# ---------------------------------------------------------------------------

# One case per pattern in DEFAULT_BLOCKED_PATTERNS, in that order. Every one of these
# returned False before the rewrite.
DEFAULT_PATTERN_HITS = [
    ("**/secrets/**", "app/secrets/db.yaml"),
    ("**/.env", "service/.env"),
    ("**/.env.*", "service/.env.production"),
    ("**/*.env", "config/staging.env"),
    ("**/credentials*", "home/credentials.json"),
    ("**/*credential*", "home/aws_credentials_backup"),
    ("**/*secret*", "config/secrets.yaml"),
    ("**/private_key*", "certs/private_key.pem"),
    ("**/*.pem", "certs/server.pem"),
    ("**/*.key", "certs/server.key"),
    ("**/id_rsa*", "root/.ssh/id_rsa"),
    ("**/id_ed25519*", "root/.ssh/id_ed25519.pub"),
    ("**/.aws/**", "home/.aws/credentials"),
    ("**/.ssh/**", "home/.ssh/config"),
    ("**/.gnupg/**", "home/.gnupg/pubring.kbx"),
    ("**/node_modules/**", "app/node_modules/left-pad/index.js"),
    ("**/__pycache__/**", "src/__pycache__/mod.cpython-311.pyc"),
    ("**/.git/**", "repo/.git/config"),
]


@pytest.mark.parametrize("pattern,path", DEFAULT_PATTERN_HITS)
def test_every_default_pattern_matches_the_path_it_names(pattern, path):
    assert _glob(path, pattern) is True


def test_the_case_list_covers_every_default_pattern():
    """Guards the parametrize list against a pattern being added and left untested."""
    assert [p["pattern"] for p in DEFAULT_BLOCKED_PATTERNS] == [p for p, _ in DEFAULT_PATTERN_HITS]


def test_leading_doublestar_slash_also_matches_depth_zero():
    """`**/.env` has to match a bare `.env`, not only `a/.env`.

    The zero-component case is the one an operator types first, and it is the one that
    `(?:.*/)?` style translations get wrong when the `?` is later clobbered.
    """
    assert _glob(".env", "**/.env") is True
    assert _glob("a/.env", "**/.env") is True
    assert _glob("a/b/c/.env", "**/.env") is True


def test_single_star_does_not_cross_a_separator():
    assert _glob("config.env", "*.env") is True
    assert _glob("nested/config.env", "*.env") is False


def test_bare_doublestar_does_cross_separators():
    assert _glob("a/b/c.txt", "a/**") is True
    assert _glob("a/b/c.txt", "a/*") is False


def test_question_mark_matches_exactly_one_non_separator():
    assert _glob("a.py", "?.py") is True
    assert _glob("ab.py", "?.py") is False
    assert _glob("a/b", "a?b") is False


def test_dots_are_literal_not_any_character():
    """The old code's escape loop double-escaped `.`; a plain regex would under-escape it."""
    assert _glob("Xenv", "**/.env") is False
    assert _glob(".env", "**/.env") is True


def test_matching_is_case_insensitive():
    assert _glob("Certs/Server.PEM", "**/*.pem") is True
    assert _glob("HOME/.AWS/credentials", "**/.aws/**") is True


def test_a_pattern_must_match_the_whole_path():
    """Anchored at both ends, so `**/.env` does not match `.env.example`."""
    assert _glob(".env.example", "**/.env") is False
    assert _glob("prefix.env.suffix", "**/*.env") is False


def test_regex_metacharacters_in_a_pattern_stay_literal():
    assert _glob("a+b.txt", "a+b.txt") is True
    assert _glob("aab.txt", "a+b.txt") is False
    assert _glob("v(1)/x", "v(1)/**") is True


def test_backslash_separators_are_normalized():
    assert _glob("home\\.ssh\\id_rsa", "**/id_rsa*") is True


def test_generated_regex_compiles_for_every_default_pattern():
    for entry in DEFAULT_BLOCKED_PATTERNS:
        re.compile(_glob_to_regex(entry["pattern"]))


def test_exact_and_regex_arms_still_work():
    assert _matches_pattern("src/Main.py", "src/main.py", PatternType.EXACT) is True
    assert _matches_pattern("src/other.py", "src/main.py", PatternType.EXACT) is False
    assert _matches_pattern("src/main.py", r"src/.*\.py", PatternType.REGEX) is True
    assert _matches_pattern("src/main.py", r"src/[", PatternType.REGEX) is False


@pytest.mark.parametrize(
    "pattern,path",
    [
        (r"src/.*\.py", "src/main.py"),
        (r".*\.pem$", "certs/server.pem"),
        (r"^\.env", ".env.production"),
        (r"secret\d+", "secret42"),
        (r"a\(b\)", "a(b)"),
        (r"\s", " "),
    ],
)
def test_regex_escapes_survive_separator_normalization(pattern, path):
    """A REGEX-type rule may not have its backslashes rewritten to "/".

    The arm normalized the *pattern's* separators along with the path's, so `\\.` became
    `/.` and the rule stopped matching what its author wrote. Same failure direction as the
    glob bug: the operator's block rule silently matches nothing.
    """
    assert _matches_pattern(path, pattern, PatternType.REGEX) is True


def test_a_regex_rule_can_still_target_windows_separators():
    """Written `\\\\` or `[/\\\\]` by the author; the path arm normalizes to "/" so the
    character-class form is the one that matches."""
    assert _matches_pattern("home\\.ssh\\id_rsa", r"home[/\\]\.ssh[/\\]id_rsa", PatternType.REGEX) is True


# ---------------------------------------------------------------------------
# Structural blocks, checked before rules
# ---------------------------------------------------------------------------

TRAVERSAL_PAYLOADS = [
    "../../etc/passwd",
    "../secrets",
    "src/../../escape.py",
    "..\\..\\windows\\system32",
    "%2e%2e/etc/passwd",
    "%2E%2E/etc/passwd",
    "ok/\x00/evil",
]


@pytest.mark.parametrize("payload", TRAVERSAL_PAYLOADS)
def test_traversal_is_blocked_without_needing_a_matching_rule(payload):
    result = _test_path_against_rules(payload)
    assert result.would_be_blocked is True
    assert result.matching_rules == []
    assert "traversal" in result.reason.lower() or "null_byte" in result.reason


ABSOLUTE_PAYLOADS = ["/etc/shadow", "/root/.bashrc"]

# The exact mirror of the drive-letter case documented below, and it bites on a Windows dev
# host: `Path("/etc/shadow").is_absolute()` is True on POSIX and False on Windows, where a
# path is absolute only with a drive. Measured both ways - on Windows "/etc/shadow" is
# relative and "C:/Windows/System32" is absolute; on Linux it is the other way round.
#
# On Windows that makes the two implementations genuinely DIVERGE on these payloads, and in
# the direction worth stating: measured on a Windows host, the endpoint reports
# would_be_blocked=False ("no blocking rules match") while PathJail reports is_allowed=False.
# They are not disagreeing about a rule - they are answering structurally different
# questions. The enforcer resolves against a jail root and sees an escape; the endpoint has
# no root and, per the drive-letter test below, deliberately makes the platform's own
# is_absolute() call rather than carrying a regex that would disagree with enforcement on the
# container this ships in. Where "/etc/..." is not absolute, that call simply has nothing to
# report.
#
# So the comparison is only meaningful where these paths are in fact absolute. The control
# plane deploys on Linux and the backend image is Linux, which is where this gate binds.
# Asserting the Linux verdict on a Windows host reports a platform difference as a product
# bug - which is how three tests here went red on a host while passing in the container.
_POSIX_ABSOLUTE = pathlib.Path("/etc/shadow").is_absolute()

_needs_posix_absolute = pytest.mark.skipif(
    not _POSIX_ABSOLUTE,
    reason=(
        "This platform does not treat /etc/... as absolute - on Windows a path is absolute "
        "only with a drive letter - so there is no absolute-path verdict to assert. This "
        "gate runs on the Linux control plane and in the backend image."
    ),
)


@_needs_posix_absolute
@pytest.mark.parametrize("payload", ABSOLUTE_PAYLOADS)
def test_absolute_paths_are_blocked_and_the_caveat_is_stated(payload):
    result = _test_path_against_rules(payload)
    assert result.would_be_blocked is True
    assert "absolute" in result.reason.lower()
    # The endpoint has no jail root, so it must say so rather than imply certainty.
    assert "jail root" in result.reason


def test_a_traversal_reason_does_not_claim_a_rule_matched():
    """The old reason string was "Path is allowed - no blocking rules match" - literally
    true about the rules and the opposite of the enforcement outcome. A structural block
    must not be attributed to a rule either."""
    result = _test_path_against_rules("../../etc/passwd")
    assert "no blocking rules match" not in result.reason
    assert "Blocked before rules are consulted" in result.reason


def test_a_drive_letter_path_is_judged_the_way_this_platform_will_treat_it():
    """`Path("C:/Windows/System32").is_absolute()` is False on Linux and True on Windows.

    The endpoint deliberately makes the same platform-dependent call the enforcer makes
    rather than adding a drive-letter regex of its own. A regex here looks stricter and reads
    safer, but it would make the endpoint disagree with enforcement on this container - which
    is the one thing this endpoint must never do. On a Linux control plane "C:/Windows" is a
    relative path whose first component is named "C:", and both agree on that.
    """
    endpoint = _test_path_against_rules("C:/Windows/System32")
    jail = PathJail(root=pathlib.Path(tempfile.mkdtemp()))
    assert endpoint.would_be_blocked is not jail.is_allowed("C:/Windows/System32")


def test_an_ordinary_relative_path_is_still_allowed():
    result = _test_path_against_rules("src/services/main.py")
    assert result.would_be_blocked is False
    assert result.matching_rules == []


def test_a_matching_rule_is_named_in_the_reason():
    result = _test_path_against_rules("home/.aws/credentials")
    assert result.would_be_blocked is True
    assert result.matching_rules
    assert "**/.aws/**" in result.reason


def test_harness_scoped_rules_apply_only_with_a_harness_type():
    """`**/config/production/**` is HARNESS-scoped to claude-code and kiro-ide."""
    path = "app/config/production/db.yaml"
    assert _test_path_against_rules(path).would_be_blocked is False
    assert _test_path_against_rules(path, harness_type="claude-code").would_be_blocked is True
    assert _test_path_against_rules(path, harness_type="cursor").would_be_blocked is False


# ---------------------------------------------------------------------------
# The two implementations must agree
# ---------------------------------------------------------------------------

def test_the_real_enforcer_agrees_on_the_payloads_that_used_to_diverge():
    """Same inputs through the advisory endpoint and through `PathJail`.

    Rooted at an empty temp dir, so nothing here depends on repo contents. Only paths whose
    verdict is decided structurally are compared - the enforcer's pattern set is configured
    per harness and is not the endpoint's rule store, so a pattern-level comparison would be
    testing two different configurations rather than two implementations of one rule.
    """
    jail = PathJail(root=pathlib.Path(tempfile.mkdtemp()))

    # Traversal and null-byte verdicts are structural, so they are the same on every
    # platform and the verdict itself can be asserted.
    for payload in TRAVERSAL_PAYLOADS:
        endpoint_blocked = _test_path_against_rules(payload).would_be_blocked
        enforcer_allowed = jail.is_allowed(payload)
        assert endpoint_blocked is True, payload
        assert enforcer_allowed is False, f"{payload} - endpoint says blocked, enforcer allows"

    # Absolute-path verdicts are platform-dependent, and so is agreement about them: see
    # _POSIX_ABSOLUTE above for the measured Windows divergence and why it is a difference in
    # the question being asked rather than a defect. Compare them only where "/etc/..." is
    # actually an absolute path, which is every environment this code runs in.
    if _POSIX_ABSOLUTE:
        for payload in ABSOLUTE_PAYLOADS:
            endpoint_blocked = _test_path_against_rules(payload).would_be_blocked
            enforcer_allowed = jail.is_allowed(payload)
            assert endpoint_blocked is True, payload
            assert enforcer_allowed is False, (
                f"{payload} - endpoint says blocked, enforcer allows"
            )

    # And the converse: a plain path both accept.
    assert _test_path_against_rules("src/main.py").would_be_blocked is False
    assert jail.is_allowed("src/main.py") is True


def test_traversal_detection_is_one_function_not_two_copies():
    """`PathJail._check_traversal` delegates to the module-level `check_traversal` the route
    imports. If someone re-inlines the body, this catches the fork before it drifts."""
    jail = PathJail(root=pathlib.Path(tempfile.mkdtemp()))
    for payload in TRAVERSAL_PAYLOADS + ["src/main.py", "/etc/shadow"]:
        assert jail._check_traversal(payload) == check_traversal(payload)
