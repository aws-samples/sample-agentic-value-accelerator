"""
Template job extraction and validation helpers.

Provides functions for reading onboarding/offboarding jobs from a template's
metadata and validating that templates with jobs define both lifecycle entries.
"""

from typing import Optional

from models.template import Job, Template


def extract_onboarding_job(template: Template) -> Optional[Job]:
    """Return the job entry with name == 'onboarding', or None if not found."""
    for job in template.metadata.jobs:
        if job.name == "onboarding":
            return job
    return None


def extract_offboarding_job(template: Template) -> Optional[Job]:
    """Return the job entry with name == 'offboarding', or None if not found."""
    for job in template.metadata.jobs:
        if job.name == "offboarding":
            return job
    return None


def validate_template_jobs(template: Template) -> bool:
    """Validate that a template with jobs has both onboarding and offboarding.

    Returns True if the template has both jobs or has no jobs at all.
    Raises ValueError if only one of onboarding/offboarding is present.
    """
    if not template.metadata.jobs:
        return True

    has_onboarding = extract_onboarding_job(template) is not None
    has_offboarding = extract_offboarding_job(template) is not None

    if has_onboarding and has_offboarding:
        return True

    missing = []
    if not has_onboarding:
        missing.append("onboarding")
    if not has_offboarding:
        missing.append("offboarding")

    raise ValueError(
        f"Template '{template.metadata.id}' has jobs but is missing: {', '.join(missing)}"
    )


def has_pipeline_jobs(template: Template) -> bool:
    """Return True if the template has a non-empty jobs array."""
    return len(template.metadata.jobs) > 0
