"""Tests for the ENVIRONMENT gate on the development auth bypass.

`get_current_user_dev` ignores the credential it is handed and returns an admin
unconditionally, so `USE_DEV_AUTH` is not a convenience flag - it is the whole
authentication decision. It defaults to True, which means the failure mode is not
"someone switched auth off" but "nobody switched it on", and a working bypass is
indistinguishable from working auth from the outside.

These tests exist because that class of defect cannot be caught by reading the
code: every path returns the answer a reader wants to see.
"""

from __future__ import annotations

import pytest

from core.config import Settings

# Every variable that feeds the gate. Cleared before each case so a real .env or a
# shell export in the developer's environment cannot decide the outcome - which
# would make these tests pass or fail for reasons unrelated to the code.
_GATE_VARS = ("ENVIRONMENT", "USE_DEV_AUTH", "DEBUG")


@pytest.fixture
def clean_env(monkeypatch):
    for var in _GATE_VARS:
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


@pytest.mark.parametrize("environment", ["development", "dev", "local", "test"])
def test_bypass_is_permitted_in_development_environments(clean_env, environment):
    """The deployments that rely on this must keep working.

    docker-compose.yaml sets USE_DEV_AUTH=true and no ENVIRONMENT (so it inherits
    the "development" default); environments/dev/main.tf sets it with "dev".
    """
    settings = Settings(ENVIRONMENT=environment, USE_DEV_AUTH=True)
    assert settings.USE_DEV_AUTH is True


def test_compose_configuration_still_bypasses(clean_env):
    """The exact shape of docker-compose.yaml:122 - USE_DEV_AUTH set, ENVIRONMENT not."""
    settings = Settings(USE_DEV_AUTH=True)
    assert settings.ENVIRONMENT == "development"
    assert settings.USE_DEV_AUTH is True


@pytest.mark.parametrize("environment", ["production", "prod", "staging", "gamma"])
def test_bypass_is_refused_outside_development(clean_env, environment):
    settings = Settings(ENVIRONMENT=environment, USE_DEV_AUTH=True)
    assert settings.USE_DEV_AUTH is False


def test_nobody_setting_anything_in_production_is_refused(clean_env):
    """The case that actually ships.

    USE_DEV_AUTH's default is True, so a deployment that never mentions the
    variable had an unauthenticated admin API. Nothing raised, because the bypass
    worked.
    """
    settings = Settings(ENVIRONMENT="production")
    assert settings.USE_DEV_AUTH is False


def test_debug_alone_does_not_bypass_auth_in_production(clean_env):
    """DEBUG was the second door.

    core/auth.py switched on `USE_DEV_AUTH or DEBUG`, so DEBUG=true replaced every
    route's auth dependency even with USE_DEV_AUTH explicitly false.
    """
    settings = Settings(ENVIRONMENT="production", USE_DEV_AUTH=False, DEBUG=True)
    assert settings.USE_DEV_AUTH is False


def test_debug_still_bypasses_in_development(clean_env):
    """Folding DEBUG in must not silently remove the behaviour it used to have."""
    settings = Settings(ENVIRONMENT="development", USE_DEV_AUTH=False, DEBUG=True)
    assert settings.USE_DEV_AUTH is True


@pytest.mark.parametrize("environment", ["PRODUCTION", "Production", "  production  "])
def test_the_gate_is_case_and_whitespace_insensitive(clean_env, environment):
    """An env var set to "Production" must not read as an unrecognised value that
    happens to fail open somewhere else later."""
    settings = Settings(ENVIRONMENT=environment, USE_DEV_AUTH=True)
    assert settings.USE_DEV_AUTH is False


@pytest.mark.parametrize("environment", ["", "banana", "dev-2", "development-eu"])
def test_an_unrecognised_environment_fails_closed(clean_env, environment):
    """Including the empty string, and including values that merely LOOK dev-ish.

    "dev-2" and "development-eu" are the tempting near-misses: a substring or
    prefix match would admit them, and a stamp named that way would be silently
    unauthenticated.
    """
    settings = Settings(ENVIRONMENT=environment, USE_DEV_AUTH=True)
    assert settings.USE_DEV_AUTH is False


def test_auth_module_reads_only_the_resolved_flag():
    """core/auth.py must not re-add `or settings.DEBUG`.

    Reading DEBUG again at the import site would reopen the door the gate closes,
    and it would do so invisibly, because config would still report the correct
    resolved value.
    """
    from pathlib import Path

    source = Path(__file__).resolve().parents[1] / "src" / "core" / "auth.py"
    text = source.read_text(encoding="utf-8")
    # Strip comments so the explanatory note mentioning DEBUG does not fail this.
    code = "\n".join(line.split("#", 1)[0] for line in text.splitlines())
    assert "settings.DEBUG" not in code
    assert "settings.USE_DEV_AUTH" in code
