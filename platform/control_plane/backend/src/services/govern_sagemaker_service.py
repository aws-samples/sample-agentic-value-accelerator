"""Govern SageMaker service — real SageMaker control evaluation data.

Read-through (no DynamoDB). Four live AWS sources:
  - sagemaker:ListModels           -> deployed models
  - sagemaker:ListEndpoints        -> inference endpoints with status
  - sagemaker:ListModelPackages    -> model registry packages
  - sagemaker:ListProcessingJobs   -> Clarify bias/explainability jobs

Follows the govern_models / govern_guardrails convention: lazy boto3 clients,
honest live/source/note flags, graceful live=False fallback that never raises,
TTL caching.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_sagemaker import (
    ClarifyJob,
    ClarifyJobsResponse,
    ModelPackageSummary,
    ModelRegistryResponse,
    SageMakerEndpoint,
    SageMakerEndpointsResponse,
    SageMakerModel,
    SageMakerModelsResponse,
)

logger = logging.getLogger(__name__)

# Read-through cache TTLs (seconds).
_MODELS_TTL = 300       # 5 min - models don't change often
_ENDPOINTS_TTL = 120    # 2 min - endpoint status may change
_REGISTRY_TTL = 300     # 5 min - model packages change infrequently
_CLARIFY_TTL = 180      # 3 min - jobs may complete


def _with_cache_note(result, cached_at: float):
    """Stamp an honest 'cached as of' age onto a live response's note.

    Only annotates live results served from cache (age > ~2s); fresh loads and
    non-live fallbacks are returned untouched so their own note is preserved.
    """
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    result.note = f"{result.note} . {stamp}" if result.note else stamp
    return result


class GovernSageMakerService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._sagemaker = None

    def _sm_client(self):
        if self._sagemaker is None:
            self._sagemaker = boto3.client("sagemaker", region_name=self.region)
        return self._sagemaker

    # -------------------------------------------------------------------------
    # Models
    # -------------------------------------------------------------------------
    def get_models(self, max_results: int = 100) -> SageMakerModelsResponse:
        """Cached wrapper around the live SageMaker models fetch."""
        key = f"sagemaker:models:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _MODELS_TTL, lambda: self._fetch_models(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_models(self, max_results: int = 100) -> SageMakerModelsResponse:
        """Real SageMaker models (sagemaker:ListModels)."""
        try:
            client = self._sm_client()
            models: list[SageMakerModel] = []
            next_token = None

            while len(models) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(models))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_models(**kwargs)

                for m in resp.get("Models", []):
                    ct = m.get("CreationTime")
                    models.append(SageMakerModel(
                        model_name=m.get("ModelName", ""),
                        model_arn=m.get("ModelArn", ""),
                        creation_time=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            models.sort(key=lambda m: m.model_name.lower())
            return SageMakerModelsResponse(
                models=models,
                total=len(models),
                live=True,
                source="sagemaker-list-models",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListModels unavailable, returning fallback: %s", e)
            return SageMakerModelsResponse(
                models=[], total=0, live=False, source="unavailable-fallback",
                note="SageMaker unreachable or sagemaker:ListModels not granted.",
            )

    # -------------------------------------------------------------------------
    # Endpoints
    # -------------------------------------------------------------------------
    def get_endpoints(self, max_results: int = 100) -> SageMakerEndpointsResponse:
        """Cached wrapper around the live SageMaker endpoints fetch."""
        key = f"sagemaker:endpoints:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _ENDPOINTS_TTL, lambda: self._fetch_endpoints(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_endpoints(self, max_results: int = 100) -> SageMakerEndpointsResponse:
        """Real SageMaker inference endpoints (sagemaker:ListEndpoints)."""
        try:
            client = self._sm_client()
            endpoints: list[SageMakerEndpoint] = []
            next_token = None

            while len(endpoints) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(endpoints))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_endpoints(**kwargs)

                for ep in resp.get("Endpoints", []):
                    ct = ep.get("CreationTime")
                    lmt = ep.get("LastModifiedTime")
                    endpoints.append(SageMakerEndpoint(
                        endpoint_name=ep.get("EndpointName", ""),
                        endpoint_arn=ep.get("EndpointArn", ""),
                        endpoint_status=ep.get("EndpointStatus", ""),
                        creation_time=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                        last_modified_time=lmt.isoformat() if hasattr(lmt, "isoformat") else (str(lmt) if lmt else None),
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # Count by status
            in_service = sum(1 for ep in endpoints if ep.endpoint_status == "InService")
            creating = sum(1 for ep in endpoints if ep.endpoint_status == "Creating")
            updating = sum(1 for ep in endpoints if ep.endpoint_status == "Updating")
            failed = sum(1 for ep in endpoints if ep.endpoint_status == "Failed")

            endpoints.sort(key=lambda ep: ep.endpoint_name.lower())
            return SageMakerEndpointsResponse(
                endpoints=endpoints,
                total=len(endpoints),
                in_service=in_service,
                creating=creating,
                updating=updating,
                failed=failed,
                live=True,
                source="sagemaker-list-endpoints",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListEndpoints unavailable, returning fallback: %s", e)
            return SageMakerEndpointsResponse(
                endpoints=[], total=0, live=False, source="unavailable-fallback",
                note="SageMaker unreachable or sagemaker:ListEndpoints not granted.",
            )

    # -------------------------------------------------------------------------
    # Model Registry
    # -------------------------------------------------------------------------
    def get_model_registry(self, max_results: int = 100) -> ModelRegistryResponse:
        """Cached wrapper around the live model registry fetch."""
        key = f"sagemaker:registry:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _REGISTRY_TTL, lambda: self._fetch_model_registry(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_model_registry(self, max_results: int = 100) -> ModelRegistryResponse:
        """Real SageMaker model packages (sagemaker:ListModelPackages)."""
        try:
            client = self._sm_client()
            packages: list[ModelPackageSummary] = []
            next_token = None

            while len(packages) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(packages))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_model_packages(**kwargs)

                for pkg in resp.get("ModelPackageSummaryList", []):
                    ct = pkg.get("CreationTime")
                    packages.append(ModelPackageSummary(
                        model_package_name=pkg.get("ModelPackageName", ""),
                        model_package_arn=pkg.get("ModelPackageArn", ""),
                        model_package_group_name=pkg.get("ModelPackageGroupName"),
                        model_package_version=pkg.get("ModelPackageVersion"),
                        model_approval_status=pkg.get("ModelApprovalStatus", ""),
                        model_package_status=pkg.get("ModelPackageStatus", ""),
                        creation_time=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # Count by approval status
            approved = sum(1 for p in packages if p.model_approval_status == "Approved")
            pending = sum(1 for p in packages if p.model_approval_status == "PendingManualApproval")
            rejected = sum(1 for p in packages if p.model_approval_status == "Rejected")

            packages.sort(key=lambda p: (p.model_package_group_name or "", p.model_package_name.lower()))
            return ModelRegistryResponse(
                packages=packages,
                total=len(packages),
                approved=approved,
                pending_approval=pending,
                rejected=rejected,
                live=True,
                source="sagemaker-list-model-packages",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListModelPackages unavailable, returning fallback: %s", e)
            return ModelRegistryResponse(
                packages=[], total=0, live=False, source="unavailable-fallback",
                note="SageMaker unreachable or sagemaker:ListModelPackages not granted.",
            )

    # -------------------------------------------------------------------------
    # Clarify Jobs
    # -------------------------------------------------------------------------
    def get_clarify_jobs(self, max_results: int = 100) -> ClarifyJobsResponse:
        """Cached wrapper around the live Clarify jobs fetch."""
        key = f"sagemaker:clarify:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _CLARIFY_TTL, lambda: self._fetch_clarify_jobs(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_clarify_jobs(self, max_results: int = 100) -> ClarifyJobsResponse:
        """Real SageMaker Clarify processing jobs (sagemaker:ListProcessingJobs filtered).

        Clarify jobs are processing jobs that use Clarify containers. We filter
        by name prefix 'Clarify-' or 'clarify-' which is the convention, and also
        look for jobs with SageMaker Clarify in the AppSpecification.
        """
        try:
            client = self._sm_client()
            jobs: list[ClarifyJob] = []
            next_token = None

            while len(jobs) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(jobs))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_processing_jobs(**kwargs)

                for job in resp.get("ProcessingJobSummaries", []):
                    job_name = job.get("ProcessingJobName", "")
                    # Filter for Clarify jobs by name convention
                    if not (job_name.lower().startswith("clarify") or
                            "clarify" in job_name.lower() or
                            "bias" in job_name.lower() or
                            "explainability" in job_name.lower()):
                        continue

                    ct = job.get("CreationTime")
                    pet = job.get("ProcessingEndTime")
                    jobs.append(ClarifyJob(
                        job_name=job_name,
                        job_arn=job.get("ProcessingJobArn", ""),
                        job_status=job.get("ProcessingJobStatus", ""),
                        creation_time=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                        processing_end_time=pet.isoformat() if hasattr(pet, "isoformat") else (str(pet) if pet else None),
                        exit_message=job.get("ExitMessage"),
                        failure_reason=job.get("FailureReason"),
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # Count by status
            completed = sum(1 for j in jobs if j.job_status == "Completed")
            in_progress = sum(1 for j in jobs if j.job_status == "InProgress")
            failed = sum(1 for j in jobs if j.job_status == "Failed")

            jobs.sort(key=lambda j: j.job_name.lower())
            return ClarifyJobsResponse(
                jobs=jobs,
                total=len(jobs),
                completed=completed,
                in_progress=in_progress,
                failed=failed,
                live=True,
                source="sagemaker-list-processing-jobs",
                note=None if jobs else "No Clarify bias/explainability jobs found. Jobs matching 'clarify', 'bias', or 'explainability' patterns are shown.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListProcessingJobs unavailable, returning fallback: %s", e)
            return ClarifyJobsResponse(
                jobs=[], total=0, live=False, source="unavailable-fallback",
                note="SageMaker unreachable or sagemaker:ListProcessingJobs not granted.",
            )
