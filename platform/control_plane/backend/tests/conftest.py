"""Shared pytest configuration for the control-plane backend suite.

Currently this exists for one reason: to take Hypothesis's per-example wall-clock
deadline off the property tests. See the profile below.
"""

from hypothesis import HealthCheck, settings


# ---------------------------------------------------------------------------
# Hypothesis: no per-example wall-clock deadline.
#
# Hypothesis defaults to failing any example that takes over 200ms. Every property
# test in this suite is pure in-process work - build a MagicMock or a model, call the
# function, assert on the result - and not one of them asserts anything about how long
# that takes. So the deadline does not measure the property under test. It measures how
# busy the machine was, which means it fails under load and passes in isolation.
#
# That was observed, not theorised: test_event_service.py's
# test_detail_type_matches_event_type failed at 372ms inside the full suite and passed
# standalone on the same commit. Roughly fifty other @settings decorators across
# test_api_properties, test_deployment_failure, test_deployment_history,
# test_deployment_status_transitions, test_outputs_roundtrip, test_script_properties
# and test_transformation_value_model carry the same latent flake; the one that fired
# was chance.
#
# A red suite on a healthy codebase is worse than a slow one. It trains everyone to
# re-run until green, and a re-run-until-green habit is how a real regression ships. So
# this is set once here rather than fifty times inline, which also covers property tests
# added later - the failure mode is a property of the default, not of any one test.
#
# This weakens no assertion: every property still runs its full max_examples and every
# assert is unchanged. Only the clock is gone. If a genuine performance regression ever
# needs guarding, that belongs in an explicit benchmark asserting a real bound, not in a
# 200ms default nobody chose.
#
# too_slow is suppressed for the same reason and no other: it is the same clock
# complaining that data generation was slow, again a property of the host.
# ---------------------------------------------------------------------------
settings.register_profile(
    "no-deadline",
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile("no-deadline")
