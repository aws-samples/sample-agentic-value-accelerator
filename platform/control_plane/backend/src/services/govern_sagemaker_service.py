"""Govern SageMaker service — real SageMaker control evaluation data.

Read-through (no DynamoDB). Live AWS sources:
  - sagemaker:ListModels           -> deployed models
  - sagemaker:ListEndpoints        -> inference endpoints with status
  - sagemaker:ListModelPackages    -> model registry packages
  - sagemaker:ListProcessingJobs   -> Clarify bias/explainability jobs
  - sagemaker:DescribeProcessingJob + s3:GetObject
                                   -> Model Monitor data-quality drift, read from
                                      the analyzer run's baseline + monitor-results
                                      constraint_violations.json / statistics.json

Follows the govern_models / govern_guardrails convention: lazy boto3 clients,
honest live/source/note flags, graceful live=False fallback that never raises,
TTL caching.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load
from models.govern_sagemaker import (
    ClarifyJob,
    ClarifyJobsResponse,
    LineageArtifact,
    LineageAssociation,
    LineageContext,
    ModelCard,
    ModelCardsResponse,
    ModelLineageResponse,
    ModelMonitorResponse,
    ModelPackageSummary,
    ModelRegistryResponse,
    SageMakerEndpoint,
    SageMakerEndpointsResponse,
    SageMakerModel,
    SageMakerModelsResponse,
    SmDriftFeatureStat,
    SmDriftViolation,
)

logger = logging.getLogger(__name__)

# Read-through cache TTLs (seconds).
_MODELS_TTL = 300       # 5 min - models don't change often
_ENDPOINTS_TTL = 120    # 2 min - endpoint status may change
_REGISTRY_TTL = 300     # 5 min - model packages change infrequently
_CLARIFY_TTL = 180      # 3 min - jobs may complete
_MODEL_CARDS_TTL = 600  # 10 min - model cards are documentation, change slowly
_LINEAGE_TTL = 300      # 5 min - lineage entities are append-mostly, change slowly
_MONITOR_TTL = 180      # 3 min - drift results refresh when a new analyzer run lands

# --- Model Monitor fixed resources (seeded data-quality analyzer run) ---
# The baseline + monitor output live under the account's default SageMaker
# bucket (sagemaker-<region>-<account>); the account id is resolved at runtime
# via STS so it is never hardcoded in source. Model Monitor scheduling is in AWS
# maintenance mode for this account, so drift comes from an on-demand analyzer
# processing job whose output is written to these prefixes.
_MONITOR_BASELINE_PREFIX = "ava-govern-seed/baseline-results/"
_MONITOR_RESULTS_PREFIX = "ava-govern-seed/monitor-results/"
_MONITOR_JOB_NAME = "ava-govern-monitor-run-1"
_MONITOR_ENDPOINT = "ava-govern-fraud-endpoint"


def _iso(ts) -> Optional[str]:
    """Best-effort ISO8601 string for a boto3 datetime (or None)."""
    if ts is None:
        return None
    return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)


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
    # ttl_cache hands back the object it still holds, so mutating result.note
    # would append a stamp per hit and grow the cached note without bound.
    # model_copy swaps only this top-level scalar, leaving the cache entry intact.
    note = f"{result.note} . {stamp}" if result.note else stamp
    return result.model_copy(update={"note": note})


class GovernSageMakerService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._sagemaker = None
        self._s3 = None
        self._sts = None

    def _sm_client(self):
        if self._sagemaker is None:
            self._sagemaker = boto3.client("sagemaker", region_name=self.region)
        return self._sagemaker

    def _s3_client(self):
        if self._s3 is None:
            self._s3 = boto3.client("s3", region_name=self.region)
        return self._s3

    def _sts_client(self):
        if self._sts is None:
            self._sts = boto3.client("sts", region_name=self.region)
        return self._sts

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
                        model_arn=mask_account_id(m.get("ModelArn", "")),
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
                        endpoint_arn=mask_account_id(ep.get("EndpointArn", "")),
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
                        model_package_arn=mask_account_id(pkg.get("ModelPackageArn", "")),
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
                        job_arn=mask_account_id(job.get("ProcessingJobArn", "")),
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

    # -------------------------------------------------------------------------
    # Model Cards
    # -------------------------------------------------------------------------
    def get_model_cards(self, max_results: int = 100) -> ModelCardsResponse:
        """Cached wrapper around the live model cards fetch."""
        key = f"sagemaker:model-cards:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _MODEL_CARDS_TTL, lambda: self._fetch_model_cards(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_model_cards(self, max_results: int = 100) -> ModelCardsResponse:
        """Real SageMaker model cards (sagemaker:ListModelCards)."""
        try:
            client = self._sm_client()
            cards: list[ModelCard] = []
            next_token = None

            while len(cards) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(cards))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_model_cards(**kwargs)

                for card in resp.get("ModelCardSummaries", []):
                    ct = card.get("CreationTime")
                    lmt = card.get("LastModifiedTime")
                    cards.append(ModelCard(
                        model_card_name=card.get("ModelCardName", ""),
                        model_card_arn=mask_account_id(card.get("ModelCardArn", "")),
                        model_card_status=card.get("ModelCardStatus", ""),
                        model_id=card.get("ModelId"),
                        creation_time=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                        last_modified_time=lmt.isoformat() if hasattr(lmt, "isoformat") else (str(lmt) if lmt else None),
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # Count by status
            approved = sum(1 for c in cards if c.model_card_status == "Approved")
            pending_review = sum(1 for c in cards if c.model_card_status == "PendingReview")
            draft = sum(1 for c in cards if c.model_card_status == "Draft")
            archived = sum(1 for c in cards if c.model_card_status == "Archived")

            cards.sort(key=lambda c: c.model_card_name.lower())
            return ModelCardsResponse(
                cards=cards,
                total=len(cards),
                approved=approved,
                pending_review=pending_review,
                draft=draft,
                archived=archived,
                live=True,
                source="sagemaker-list-model-cards",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListModelCards unavailable, returning fallback: %s", e)
            return ModelCardsResponse(
                cards=[], total=0, live=False, source="unavailable-fallback",
                note="SageMaker unreachable or sagemaker:ListModelCards not granted.",
            )

    # -------------------------------------------------------------------------
    # ML Lineage
    # -------------------------------------------------------------------------
    def get_lineage(self, max_results: int = 100) -> ModelLineageResponse:
        """Cached wrapper around the live SageMaker ML Lineage fetch."""
        key = f"sagemaker:lineage:{self.region}:{max_results}"
        result, cached_at = get_or_load(
            key, _LINEAGE_TTL, lambda: self._fetch_lineage(max_results),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _fetch_lineage(self, max_results: int = 100) -> ModelLineageResponse:
        """Real SageMaker ML Lineage graph.

        Composed from three lineage list APIs:
          - sagemaker:ListArtifacts    -> datasets, models, images (graph nodes)
          - sagemaker:ListContexts     -> endpoints, deployments (graph nodes)
          - sagemaker:ListAssociations -> directed edges between entities

        An account with no ML Lineage entities (the common case until models are
        registered / lineage tracking runs) returns EMPTY arrays with live=True —
        that is the honest, correct outcome, not an error. live=False is reserved
        for genuine unreachability / missing permissions.
        """
        try:
            client = self._sm_client()

            # --- Artifacts (datasets, models, images, ...) ---
            artifacts: list[LineageArtifact] = []
            next_token = None
            while len(artifacts) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(artifacts))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_artifacts(**kwargs)

                for a in resp.get("ArtifactSummaries", []):
                    src = a.get("Source") or {}
                    source_uri = src.get("SourceUri")
                    props: dict[str, str] = {}
                    if source_uri:
                        props["SourceUri"] = source_uri
                    arn = a.get("ArtifactArn", "")
                    artifacts.append(LineageArtifact(
                        artifact_arn=arn,
                        artifact_name=a.get("ArtifactName") or arn,
                        artifact_type=a.get("ArtifactType", ""),
                        source_uri=source_uri,
                        creation_time=_iso(a.get("CreationTime")),
                        last_modified_time=_iso(a.get("LastModifiedTime")),
                        properties=props,
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # --- Contexts (endpoints, model deployments, experiments, ...) ---
            contexts: list[LineageContext] = []
            next_token = None
            while len(contexts) < max_results:
                kwargs = {"MaxResults": min(100, max_results - len(contexts))}
                if next_token:
                    kwargs["NextToken"] = next_token
                resp = client.list_contexts(**kwargs)

                for c in resp.get("ContextSummaries", []):
                    src = c.get("Source") or {}
                    source_uri = src.get("SourceUri")
                    props = {}
                    if source_uri:
                        props["SourceUri"] = source_uri
                    arn = c.get("ContextArn", "")
                    contexts.append(LineageContext(
                        context_arn=arn,
                        context_name=c.get("ContextName") or arn,
                        context_type=c.get("ContextType", ""),
                        source_uri=source_uri,
                        creation_time=_iso(c.get("CreationTime")),
                        last_modified_time=_iso(c.get("LastModifiedTime")),
                        properties=props,
                    ))

                next_token = resp.get("NextToken")
                if not next_token:
                    break

            # --- Associations (directed edges) ---
            # SageMaker ListAssociations REQUIRES a Source or Destination ARN — it
            # cannot be called unfiltered. Query per discovered entity ARN, guarded so
            # a validation/permission error here never sinks the whole lineage response.
            associations: list[LineageAssociation] = []
            seen_edges: set[tuple[str, str, str]] = set()
            entity_arns = [a.artifact_arn for a in artifacts] + [c.context_arn for c in contexts]
            for arn in entity_arns:
                if not arn or len(associations) >= max_results:
                    break
                try:
                    resp = client.list_associations(
                        SourceArn=arn,
                        MaxResults=min(100, max_results - len(associations)),
                    )
                except (ClientError, BotoCoreError) as e:
                    logger.info("ListAssociations for %s skipped: %s", arn, e)
                    continue

                for assoc in resp.get("AssociationSummaries", []):
                    key = (
                        assoc.get("SourceArn", ""),
                        assoc.get("DestinationArn", ""),
                        assoc.get("AssociationType", ""),
                    )
                    if key in seen_edges:
                        continue
                    seen_edges.add(key)
                    associations.append(LineageAssociation(
                        source_arn=assoc.get("SourceArn", ""),
                        destination_arn=assoc.get("DestinationArn", ""),
                        association_type=assoc.get("AssociationType", "AssociatedWith"),
                        source_type=assoc.get("SourceType"),
                        destination_type=assoc.get("DestinationType"),
                    ))

            # Mask account IDs in the EXPOSED ARNs / URIs (raw ARNs above were needed
            # for the ListAssociations correlation). S3 source URIs embed the account in
            # the default bucket name (sagemaker-<region>-<account>), so mask those too.
            for a in artifacts:
                a.artifact_arn = mask_account_id(a.artifact_arn)
                a.artifact_name = mask_account_id(a.artifact_name)
                a.source_uri = mask_account_id(a.source_uri)
                a.properties = {k: mask_account_id(v) for k, v in (a.properties or {}).items()}
            for c in contexts:
                c.context_arn = mask_account_id(c.context_arn)
                c.context_name = mask_account_id(c.context_name)
                c.source_uri = mask_account_id(c.source_uri)
                c.properties = {k: mask_account_id(v) for k, v in (c.properties or {}).items()}
            for e in associations:
                e.source_arn = mask_account_id(e.source_arn)
                e.destination_arn = mask_account_id(e.destination_arn)

            artifacts.sort(key=lambda a: a.artifact_name.lower())
            contexts.sort(key=lambda c: c.context_name.lower())

            total = len(artifacts) + len(contexts) + len(associations)
            note = None
            if total == 0:
                note = (
                    "No SageMaker ML Lineage entities in this account/region. "
                    "Lineage tracking is not enabled or no models, datasets, or "
                    "endpoints have been registered with SageMaker."
                )
            return ModelLineageResponse(
                artifacts=artifacts,
                contexts=contexts,
                associations=associations,
                total=total,
                live=True,
                source="sagemaker-lineage",
                note=note,
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("SageMaker lineage unavailable, returning fallback: %s", e)
            return ModelLineageResponse(
                artifacts=[], contexts=[], associations=[], total=0,
                live=False, source="unavailable-fallback",
                note=(
                    "SageMaker unreachable or lineage list permissions "
                    "(sagemaker:ListArtifacts / ListContexts / ListAssociations) not granted."
                ),
            )

    # -------------------------------------------------------------------------
    # Model Monitor (data-quality drift)
    # -------------------------------------------------------------------------
    def get_model_monitor(self) -> ModelMonitorResponse:
        """Cached wrapper around the live Model Monitor drift fetch."""
        key = f"sagemaker:model-monitor:{self.region}"
        result, cached_at = get_or_load(
            key, _MONITOR_TTL, lambda: self._fetch_model_monitor(),
            should_cache=lambda r: r.live,
        )
        return _with_cache_note(result, cached_at)

    def _get_json_object(self, s3, bucket: str, key: str) -> Optional[dict]:
        """Read + parse one JSON S3 object, or None if absent/unreadable.

        Guarded so a missing monitor output (404 before the run lands) or a
        permission gap on a single key never sinks the whole drift response.
        """
        try:
            body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            doc = json.loads(body)
            return doc if isinstance(doc, dict) else None
        except (ClientError, BotoCoreError, KeyError, ValueError, TypeError) as e:
            logger.info("Model Monitor object s3://<bucket>/%s not readable: %s", key, e)
            return None

    @staticmethod
    def _feature_means(doc: Optional[dict]) -> dict[str, float]:
        """Map feature name -> numerical_statistics.mean from a statistics.json doc."""
        means: dict[str, float] = {}
        if not doc:
            return means
        for feat in doc.get("features", []) or []:
            name = feat.get("name")
            num = feat.get("numerical_statistics") or {}
            mean = num.get("mean")
            if name is not None and isinstance(mean, (int, float)) and not isinstance(mean, bool):
                means[name] = float(mean)
        return means

    def _compute_feature_stats(
        self, baseline_doc: Optional[dict], current_doc: Optional[dict]
    ) -> list[SmDriftFeatureStat]:
        """Per-feature baseline vs current mean + drift_pct, for features in BOTH."""
        base = self._feature_means(baseline_doc)
        cur = self._feature_means(current_doc)
        stats: list[SmDriftFeatureStat] = []
        for name, b in base.items():
            if name not in cur:
                continue
            c = cur[name]
            drift = ((c - b) / b * 100.0) if b != 0 else None
            stats.append(SmDriftFeatureStat(
                feature=name,
                baseline=round(b, 4),
                current=round(c, 4),
                drift_pct=round(drift, 2) if drift is not None else None,
            ))
        # Biggest movers first; features with no computable drift sink to the end.
        stats.sort(key=lambda s: abs(s.drift_pct) if s.drift_pct is not None else -1.0, reverse=True)
        return stats

    def _fetch_model_monitor(self) -> ModelMonitorResponse:
        """Real Model Monitor data-quality drift from the seeded analyzer run.

        Reads (each optional, guarded):
          - baseline constraints.json  -> baseline_features (len of features array)
          - monitor-results constraint_violations.json -> violations
          - baseline + monitor-results statistics.json  -> per-feature drift
        and DescribeProcessingJob(ava-govern-monitor-run-1) for run status/time.
        Never raises; never fabricates violations.
        """
        endpoint = _MONITOR_ENDPOINT
        try:
            # Resolve the default SageMaker bucket (sagemaker-<region>-<account>)
            # without embedding the account id in source.
            account = self._sts_client().get_caller_identity().get("Account", "")
            if not account:
                raise ValueError("could not resolve account id for default SageMaker bucket")
            bucket = f"sagemaker-{self.region}-{account}"
            s3 = self._s3_client()

            # --- Analyzer processing job status (in lieu of a monitoring schedule) ---
            monitor_configured = False
            last_run_status: Optional[str] = None
            last_run: Optional[str] = None
            try:
                job = self._sm_client().describe_processing_job(ProcessingJobName=_MONITOR_JOB_NAME)
                monitor_configured = True
                last_run_status = job.get("ProcessingJobStatus")
                last_run = _iso(job.get("ProcessingEndTime"))
            except (ClientError, BotoCoreError) as e:
                logger.info("DescribeProcessingJob %s unavailable: %s", _MONITOR_JOB_NAME, e)

            # --- Baseline constraints.json -> feature count ---
            baseline_features = 0
            constraints_doc = self._get_json_object(s3, bucket, f"{_MONITOR_BASELINE_PREFIX}constraints.json")
            if constraints_doc:
                baseline_features = len(constraints_doc.get("features", []) or [])

            # --- Monitor-run constraint_violations.json -> violations ---
            violations: list[SmDriftViolation] = []
            violations_doc = self._get_json_object(s3, bucket, f"{_MONITOR_RESULTS_PREFIX}constraint_violations.json")
            if violations_doc:
                for v in violations_doc.get("violations", []) or []:
                    violations.append(SmDriftViolation(
                        feature=v.get("feature_name", "") or "",
                        check_type=v.get("constraint_check_type", "") or "",
                        description=mask_account_id(v.get("description", "") or "") or "",
                    ))

            # --- Baseline vs monitor-run statistics.json -> per-feature drift ---
            baseline_stats_doc = self._get_json_object(s3, bucket, f"{_MONITOR_BASELINE_PREFIX}statistics.json")
            current_stats_doc = self._get_json_object(s3, bucket, f"{_MONITOR_RESULTS_PREFIX}statistics.json")
            feature_stats = self._compute_feature_stats(baseline_stats_doc, current_stats_doc)

            data_present = (violations_doc is not None) or (current_stats_doc is not None)

            if data_present:
                # Real drift data landed — this is the honest live outcome.
                note = None if violations else "No data-quality drift violations detected against the baseline."
                return ModelMonitorResponse(
                    monitor_configured=monitor_configured,
                    monitored_endpoint=endpoint,
                    baseline_features=baseline_features,
                    violations=violations,
                    violations_count=len(violations),
                    feature_stats=feature_stats,
                    last_run_status=last_run_status,
                    last_run=last_run,
                    live=True,
                    source="sagemaker-model-monitor-s3",
                    note=note,
                )

            if monitor_configured:
                # The analyzer job exists but has not written drift output yet.
                status_txt = last_run_status or "pending"
                return ModelMonitorResponse(
                    monitor_configured=True,
                    monitored_endpoint=endpoint,
                    baseline_features=baseline_features,
                    violations=[],
                    violations_count=0,
                    feature_stats=[],
                    last_run_status=last_run_status,
                    last_run=last_run,
                    live=False,
                    source="sagemaker-model-monitor-pending",
                    note=f"Model Monitor analysis run {status_txt}; drift results pending.",
                )

            # Neither an analyzer job nor any monitor output exists.
            return ModelMonitorResponse(
                monitor_configured=False,
                monitored_endpoint=None,
                baseline_features=baseline_features,
                violations=[],
                violations_count=0,
                feature_stats=[],
                live=False,
                source="unavailable-fallback",
                note="No SageMaker Model Monitor baseline or analysis output found for this account/region.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Model Monitor unavailable, returning fallback: %s", e)
            return ModelMonitorResponse(
                monitor_configured=False,
                monitored_endpoint=None,
                baseline_features=0,
                violations=[],
                violations_count=0,
                feature_stats=[],
                live=False,
                source="unavailable-fallback",
                note="SageMaker/S3 unreachable or Model Monitor read permissions not granted.",
            )
