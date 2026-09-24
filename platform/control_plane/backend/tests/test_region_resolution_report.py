"""The startup region report has to distinguish STATED from INHERITED.

A resolved region alone cannot tell you whether anybody chose it. Both of these print
`us-east-2` for the governed fleet:

  - a single-region deployment whose operator knows AVA and the Bedrock estate are together
  - a deployment whose operator never learned a second region exists

The first is correct, the second renders the AI estate as zero under a Live badge - AWS
answers the wrong region with that region's inventory rather than with an error, so there is
no exception to catch and nothing else in the logs. The report's whole job is to make those
two cases look different, which means the tests here assert on `source`, not on `region`.

Both directions are asserted throughout. A suite that only checks the INHERITED wording
passes against a report hardwired to say INHERITED, which would be worse than no report:
it would label a correctly-stated region as a guess.
"""

import logging
import os

import pytest

from core import region_config
from core.config import settings


@pytest.fixture(autouse=True)
def _isolated_governed_set(monkeypatch, tmp_path):
    """Point the governed-region config at a path that does not exist, and drop the cache.

    get_governed_regions() caches on file mtime across calls, and the cache is module
    global - without this the first test to run decides what every later test sees.
    """
    monkeypatch.setattr(
        settings, "GOVERN_REGIONS_CONFIG_PATH", str(tmp_path / "governed_regions.json")
    )
    monkeypatch.setattr(region_config, "_cache", None)
    monkeypatch.setattr(region_config, "_cache_mtime", None)
    monkeypatch.delenv("GUARDRAILS_TABLE_REGION", raising=False)
    monkeypatch.setattr(settings, "CONTROL_PLANE_TABLE_REGION", "")
    yield


def _rows(report):
    return {r["tier"]: r for r in report}


def _configure(monkeypatch, control, governed, declared):
    monkeypatch.setattr(settings, "AWS_REGION", control)
    monkeypatch.setattr(settings, "GOVERN_AWS_REGION", governed)
    monkeypatch.setattr(settings, "GOVERN_AWS_REGION_DECLARED", declared)


# ---------------------------------------------------------------------------
# STATED vs INHERITED
# ---------------------------------------------------------------------------


def test_a_stated_governed_region_is_not_labelled_inherited(monkeypatch):
    _configure(monkeypatch, control="us-east-2", governed="us-east-1", declared=True)

    row = _rows(region_config.resolution_report())["2 governed fleet"]

    assert row["region"] == "us-east-1"
    assert "stated explicitly" in row["source"]
    assert "INHERITED" not in row["source"]


def test_an_inherited_governed_region_says_so_and_names_the_region_to_check(monkeypatch):
    # Settings.__init__ fills GOVERN_AWS_REGION from AWS_REGION when it was not declared, so
    # the resolved value is non-empty either way. That fill is exactly what the report has to
    # see through.
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)

    row = _rows(region_config.resolution_report())["2 governed fleet"]

    assert row["region"] == "us-east-2"
    assert "INHERITED" in row["source"]
    assert "us-east-2" in row["source"], "the operator needs to know which region to compare"
    assert "stated explicitly" not in row["source"]


def test_the_control_plane_row_shows_the_region_its_own_source_claims(monkeypatch):
    """The row's two halves must agree - this caught them disagreeing.

    CONTROL_PLANE_TABLE_REGION relocates every control-plane table and wins over AWS_REGION,
    but `control_region()` returns AWS_REGION alone. The first version of this report printed
    control_region() while labelling the source CONTROL_PLANE_TABLE_REGION, so it reported a
    region no table was actually in - the exact confusion between two regions that this
    module exists to prevent, reproduced inside the thing built to warn about it.
    """
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)
    monkeypatch.setattr(settings, "CONTROL_PLANE_TABLE_REGION", "eu-west-1")

    row = _rows(region_config.resolution_report())["1 control plane"]

    assert row["region"] == "eu-west-1", "the override wins, so the report must show it winning"
    assert "CONTROL_PLANE_TABLE_REGION" in row["source"]
    assert "us-east-2" in row["source"], "the infra is still in AWS_REGION; say so"

    # Without the override the two collapse back into one region, and the source should stop
    # mentioning a split that no longer exists.
    monkeypatch.setattr(settings, "CONTROL_PLANE_TABLE_REGION", "")
    plain = _rows(region_config.resolution_report())["1 control plane"]
    assert plain["region"] == "us-east-2"
    assert plain["source"] == "AWS_REGION"


def test_the_guardrails_row_distinguishes_a_per_table_override(monkeypatch):
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)

    inherited = _rows(region_config.resolution_report())["3 guardrails table"]
    assert inherited["region"] == "us-east-2"
    assert "INHERITED" in inherited["source"]

    monkeypatch.setenv("GUARDRAILS_TABLE_REGION", "us-east-1")
    stated = _rows(region_config.resolution_report())["3 guardrails table"]
    assert stated["region"] == "us-east-1"
    assert "stated explicitly" in stated["source"]


# ---------------------------------------------------------------------------
# The report reads the live resolution, it does not re-derive it
# ---------------------------------------------------------------------------


def test_the_governed_row_reflects_the_persisted_multi_region_set(monkeypatch, tmp_path):
    """A report that printed GOVERN_AWS_REGION would understate a multi-region fleet.

    Tier 2 is a set, not a scalar: `set_governed_regions` persists additions and
    get_governed_regions() is what the services fan out over. The report has to show the set
    the services will actually read, or it reassures an operator about one region while AVA
    is reading three.
    """
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)
    path = tmp_path / "governed_regions.json"
    path.write_text('{"regions": ["us-east-1", "eu-west-1", "ap-southeast-2"]}', encoding="utf-8")
    monkeypatch.setattr(settings, "GOVERN_REGIONS_CONFIG_PATH", str(path))
    monkeypatch.setattr(region_config, "_cache", None)
    monkeypatch.setattr(region_config, "_cache_mtime", None)

    row = _rows(region_config.resolution_report())["2 governed fleet"]

    assert row["region"] == "us-east-1, eu-west-1, ap-southeast-2"
    assert str(path) in row["source"], "say where the set came from, so it can be inspected"


def test_every_tier_is_reported(monkeypatch):
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)

    rows = _rows(region_config.resolution_report())

    assert set(rows) == {"1 control plane", "2 governed fleet", "3 guardrails table"}
    for tier, row in rows.items():
        assert row["region"], f"{tier} resolved to an empty region"
        assert row["holds"], f"{tier} does not say what lives there"
        assert row["source"], f"{tier} does not say where the value came from"


# ---------------------------------------------------------------------------
# The warning fires on the omission, and only on the omission
# ---------------------------------------------------------------------------


def test_nothing_stated_and_nothing_persisted_earns_a_warning(monkeypatch, caplog):
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)

    with caplog.at_level(logging.INFO, logger=region_config.__name__):
        region_config.log_resolution()

    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert len(warnings) == 1
    msg = warnings[0].getMessage()
    assert "GOVERN_AWS_REGION" in msg
    assert "us-east-2" in msg
    assert "rather than an error" in msg, "the point is that this failure is silent"


def test_a_stated_region_earns_no_warning(monkeypatch, caplog):
    _configure(monkeypatch, control="us-east-2", governed="us-east-1", declared=True)

    with caplog.at_level(logging.INFO, logger=region_config.__name__):
        region_config.log_resolution()

    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


def test_a_persisted_governed_set_earns_no_warning(monkeypatch, tmp_path, caplog):
    """Pulling a region into governance at runtime is a decision too.

    The warning is about an unanswered question, not about an unset env var. Someone who
    used the governance API to add regions has answered it, and re-warning them every boot
    is how a warning becomes noise that gets filtered.
    """
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)
    path = tmp_path / "governed_regions.json"
    path.write_text('{"regions": ["eu-west-1"]}', encoding="utf-8")
    monkeypatch.setattr(settings, "GOVERN_REGIONS_CONFIG_PATH", str(path))
    monkeypatch.setattr(region_config, "_cache", None)
    monkeypatch.setattr(region_config, "_cache_mtime", None)

    with caplog.at_level(logging.INFO, logger=region_config.__name__):
        region_config.log_resolution()

    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


def test_grepping_the_marker_returns_the_whole_report(monkeypatch, caplog):
    """`grep REGION-TIER` has to yield a self-contained block, not a fragment.

    The first version marked only the tier lines while the header said "grep REGION-TIER",
    so the grep returned the header plus half the report and dropped every `holds` line. A
    marker that matches an incomplete subset of its own block is worse than no marker: it
    looks like the whole answer.
    """
    _configure(monkeypatch, control="us-east-2", governed="us-east-1", declared=True)

    with caplog.at_level(logging.INFO, logger=region_config.__name__):
        region_config.log_resolution()

    logged = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    marked = [m for m in logged if "REGION-TIER" in m]

    assert marked == logged, "an INFO line in this report is not findable by the marker"
    for tier in ("1 control plane", "2 governed fleet", "3 guardrails table"):
        assert any(tier in m for m in marked)
    assert sum("holds:" in m for m in marked) == 3, "the holds lines fell outside the grep"
    assert any("us-east-1" in m for m in marked)


# ---------------------------------------------------------------------------
# Reporting must never be the reason startup fails
# ---------------------------------------------------------------------------


def test_a_broken_report_does_not_break_startup(monkeypatch, caplog):
    """main.py calls this before init_db, so an exception here would take the API down.

    There are two guards - the try/except in log_resolution and the one in main.py - and this
    pins the inner one, because the outer one would still let the report kill the region
    context of every log line after it.
    """
    def boom():
        raise RuntimeError("settings exploded")

    monkeypatch.setattr(region_config, "resolution_report", boom)

    with caplog.at_level(logging.INFO, logger=region_config.__name__):
        region_config.log_resolution()  # must not raise

    assert any("non-fatal" in r.getMessage() for r in caplog.records)


def test_an_unreadable_governed_config_does_not_break_the_report(monkeypatch, tmp_path):
    """get_governed_regions() falls back on unreadable JSON; the report must survive that too."""
    _configure(monkeypatch, control="us-east-2", governed="us-east-2", declared=False)
    path = tmp_path / "governed_regions.json"
    path.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(settings, "GOVERN_REGIONS_CONFIG_PATH", str(path))
    monkeypatch.setattr(region_config, "_cache", None)
    monkeypatch.setattr(region_config, "_cache_mtime", None)

    row = _rows(region_config.resolution_report())["2 governed fleet"]

    assert row["region"] == "us-east-2", "fall back to the resolved single region, not to empty"
    assert os.path.basename(str(path)) in row["source"]
