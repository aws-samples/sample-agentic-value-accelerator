"""
Property-Based Tests for Template Job Extraction and Validation

# Feature: cicd-deployment-pipeline, Property 16: Template job extraction correctly identifies onboarding and offboarding events
# Feature: cicd-deployment-pipeline, Property 17: Jobless templates fall back to S3 packaging
# Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding

Uses Hypothesis to verify that template_job_service functions correctly
extract onboarding/offboarding jobs, detect jobless templates, and validate
that templates with jobs contain both lifecycle entries.

**Validates: Requirements 10.1, 10.2, 10.4, 10.5**
"""

import os
import sys
import importlib.util

import pytest
from hypothesis import given, strategies as st, settings, assume

# ---------------------------------------------------------------------------
# Import template models via importlib
# ---------------------------------------------------------------------------
_template_model_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "models", "template.py"
)
_tm_spec = importlib.util.spec_from_file_location(
    "template", os.path.abspath(_template_model_path)
)
_template_mod = importlib.util.module_from_spec(_tm_spec)
_tm_spec.loader.exec_module(_template_mod)

Template = _template_mod.Template
TemplateMetadata = _template_mod.TemplateMetadata
Job = _template_mod.Job
Framework = _template_mod.Framework
DeploymentPattern = _template_mod.DeploymentPattern

# ---------------------------------------------------------------------------
# Import template_job_service via importlib
# ---------------------------------------------------------------------------
# The service imports from ..models.template, so we register the template
# module under the expected relative-import path so the source can resolve it.
_models_pkg_name = "template_job_service_models"
sys.modules[_models_pkg_name] = _template_mod

_tjs_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "services", "template_job_service.py"
)
_tjs_abs = os.path.abspath(_tjs_path)

# Read the source and patch the relative import
with open(_tjs_abs) as _f:
    _tjs_source = _f.read()

_tjs_source = _tjs_source.replace(
    "from ..models.template import Job, Template",
    "from template_job_service_models import Job, Template",
)

import types

_tjs_code = compile(_tjs_source, _tjs_abs, "exec")
_tjs_mod = types.ModuleType("template_job_service")
_tjs_mod.__file__ = _tjs_abs
exec(_tjs_code, _tjs_mod.__dict__)

extract_onboarding_job = _tjs_mod.extract_onboarding_job
extract_offboarding_job = _tjs_mod.extract_offboarding_job
validate_template_jobs = _tjs_mod.validate_template_jobs
has_pipeline_jobs = _tjs_mod.has_pipeline_jobs


# ---------------------------------------------------------------------------
# Helper: create a Template with a given jobs list
# ---------------------------------------------------------------------------
def _make_template(jobs):
    """Create a minimal Template instance with the given jobs list."""
    return Template(
        metadata=TemplateMetadata(
            id="test-template",
            name="Test Template",
            description="Test",
            version="1.0.0",
            pattern_type="single_agent",
            frameworks=[Framework(id="test_fw", name="Test", path="test/")],
            deployment_patterns=[
                DeploymentPattern(
                    id="test_dp", name="Test", description="Test", path="test/"
                )
            ],
            jobs=jobs,
        ),
        path="/tmp/test",
    )


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Event name strategy: non-empty alphanumeric strings with underscores
event_name_strategy = st.text(
    min_size=1,
    max_size=80,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_"),
)


# Strategy for a Job with a specific name
def job_strategy(name: str):
    return st.builds(
        Job,
        name=st.just(name),
        incoming_event=event_name_strategy,
        outgoing_event=event_name_strategy,
    )


# Strategy for a "noise" job that is neither onboarding nor offboarding
noise_job_name = st.text(
    min_size=1,
    max_size=40,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_"),
).filter(lambda n: n not in ("onboarding", "offboarding"))

noise_job_strategy = st.builds(
    Job,
    name=noise_job_name,
    incoming_event=event_name_strategy,
    outgoing_event=event_name_strategy,
)


# ---------------------------------------------------------------------------
# Property 16: Template job extraction correctly identifies onboarding and
#              offboarding events
# Feature: cicd-deployment-pipeline, Property 16
# **Validates: Requirements 10.1, 10.2**
# ---------------------------------------------------------------------------


class TestTemplateJobExtraction:
    """Property 16: Template job extraction correctly identifies onboarding
    and offboarding events.

    For any template with a jobs array containing both onboarding and
    offboarding entries, extracting the onboarding job should return the
    entry with name == "onboarding" and extracting the offboarding job
    should return the entry with name == "offboarding", each with their
    correct incoming_event and outgoing_event.
    """

    @settings(max_examples=100)
    @given(
        onboarding_job=job_strategy("onboarding"),
        offboarding_job=job_strategy("offboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_extract_onboarding_returns_correct_job(
        self, onboarding_job, offboarding_job, extra_jobs
    ):
        """Extracting the onboarding job returns the entry with name == 'onboarding'
        and preserves its incoming_event and outgoing_event."""
        # Feature: cicd-deployment-pipeline, Property 16: Template job extraction correctly identifies onboarding and offboarding events
        jobs = extra_jobs + [onboarding_job, offboarding_job]
        template = _make_template(jobs)

        result = extract_onboarding_job(template)

        assert result is not None
        assert result.name == "onboarding"
        assert result.incoming_event == onboarding_job.incoming_event
        assert result.outgoing_event == onboarding_job.outgoing_event

    @settings(max_examples=100)
    @given(
        onboarding_job=job_strategy("onboarding"),
        offboarding_job=job_strategy("offboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_extract_offboarding_returns_correct_job(
        self, onboarding_job, offboarding_job, extra_jobs
    ):
        """Extracting the offboarding job returns the entry with name == 'offboarding'
        and preserves its incoming_event and outgoing_event."""
        # Feature: cicd-deployment-pipeline, Property 16: Template job extraction correctly identifies onboarding and offboarding events
        jobs = extra_jobs + [onboarding_job, offboarding_job]
        template = _make_template(jobs)

        result = extract_offboarding_job(template)

        assert result is not None
        assert result.name == "offboarding"
        assert result.incoming_event == offboarding_job.incoming_event
        assert result.outgoing_event == offboarding_job.outgoing_event

    @settings(max_examples=100)
    @given(
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_extract_onboarding_returns_none_when_absent(self, extra_jobs):
        """When no onboarding job exists, extract_onboarding_job returns None."""
        # Feature: cicd-deployment-pipeline, Property 16: Template job extraction correctly identifies onboarding and offboarding events
        template = _make_template(extra_jobs)

        result = extract_onboarding_job(template)
        assert result is None

    @settings(max_examples=100)
    @given(
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_extract_offboarding_returns_none_when_absent(self, extra_jobs):
        """When no offboarding job exists, extract_offboarding_job returns None."""
        # Feature: cicd-deployment-pipeline, Property 16: Template job extraction correctly identifies onboarding and offboarding events
        template = _make_template(extra_jobs)

        result = extract_offboarding_job(template)
        assert result is None


# ---------------------------------------------------------------------------
# Property 17: Jobless templates fall back to S3 packaging
# Feature: cicd-deployment-pipeline, Property 17
# **Validates: Requirements 10.4**
# ---------------------------------------------------------------------------


class TestJoblessTemplateFallback:
    """Property 17: Jobless templates fall back to S3 packaging.

    For any template whose jobs array is empty or absent,
    has_pipeline_jobs should return False.
    """

    @settings(max_examples=100)
    @given(st.just([]))
    def test_empty_jobs_returns_false(self, jobs):
        """A template with an empty jobs array has no pipeline jobs."""
        # Feature: cicd-deployment-pipeline, Property 17: Jobless templates fall back to S3 packaging
        template = _make_template(jobs)
        assert has_pipeline_jobs(template) is False

    @settings(max_examples=100)
    @given(
        onboarding_job=job_strategy("onboarding"),
        offboarding_job=job_strategy("offboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_non_empty_jobs_returns_true(self, onboarding_job, offboarding_job, extra_jobs):
        """A template with a non-empty jobs array has pipeline jobs."""
        # Feature: cicd-deployment-pipeline, Property 17: Jobless templates fall back to S3 packaging
        jobs = [onboarding_job, offboarding_job] + extra_jobs
        template = _make_template(jobs)
        assert has_pipeline_jobs(template) is True

    @settings(max_examples=100)
    @given(
        single_job=noise_job_strategy,
    )
    def test_single_noise_job_returns_true(self, single_job):
        """Even a single non-onboarding/offboarding job means has_pipeline_jobs is True."""
        # Feature: cicd-deployment-pipeline, Property 17: Jobless templates fall back to S3 packaging
        template = _make_template([single_job])
        assert has_pipeline_jobs(template) is True


# ---------------------------------------------------------------------------
# Property 18: Template job validation requires both onboarding and offboarding
# Feature: cicd-deployment-pipeline, Property 18
# **Validates: Requirements 10.5**
# ---------------------------------------------------------------------------


class TestTemplateJobValidation:
    """Property 18: Template job validation requires both onboarding and offboarding.

    For any template with a non-empty jobs array, validation should pass if
    and only if the array contains exactly one entry with name == "onboarding"
    and exactly one entry with name == "offboarding".
    """

    @settings(max_examples=100)
    @given(
        onboarding_job=job_strategy("onboarding"),
        offboarding_job=job_strategy("offboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=5),
    )
    def test_valid_when_both_present(self, onboarding_job, offboarding_job, extra_jobs):
        """Validation passes when both onboarding and offboarding jobs are present."""
        # Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding
        jobs = [onboarding_job, offboarding_job] + extra_jobs
        template = _make_template(jobs)

        result = validate_template_jobs(template)
        assert result is True

    @settings(max_examples=100)
    @given(
        offboarding_job=job_strategy("offboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=3),
    )
    def test_invalid_when_onboarding_missing(self, offboarding_job, extra_jobs):
        """Validation raises ValueError when onboarding job is missing."""
        # Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding
        jobs = [offboarding_job] + extra_jobs
        template = _make_template(jobs)

        with pytest.raises(ValueError, match="onboarding"):
            validate_template_jobs(template)

    @settings(max_examples=100)
    @given(
        onboarding_job=job_strategy("onboarding"),
        extra_jobs=st.lists(noise_job_strategy, min_size=0, max_size=3),
    )
    def test_invalid_when_offboarding_missing(self, onboarding_job, extra_jobs):
        """Validation raises ValueError when offboarding job is missing."""
        # Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding
        jobs = [onboarding_job] + extra_jobs
        template = _make_template(jobs)

        with pytest.raises(ValueError, match="offboarding"):
            validate_template_jobs(template)

    @settings(max_examples=100)
    @given(
        extra_jobs=st.lists(noise_job_strategy, min_size=1, max_size=5),
    )
    def test_invalid_when_both_missing(self, extra_jobs):
        """Validation raises ValueError when both onboarding and offboarding are missing."""
        # Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding
        template = _make_template(extra_jobs)

        with pytest.raises(ValueError, match="onboarding"):
            validate_template_jobs(template)

    @settings(max_examples=100)
    @given(st.just([]))
    def test_empty_jobs_passes_validation(self, jobs):
        """Validation passes for templates with no jobs (fallback to S3)."""
        # Feature: cicd-deployment-pipeline, Property 18: Template job validation requires both onboarding and offboarding
        template = _make_template(jobs)

        result = validate_template_jobs(template)
        assert result is True
