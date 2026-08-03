"""Govern Evals service — real Bedrock evaluation jobs, read-through + cached.

Uses bedrock:ListEvaluationJobs (paginated) to surface the account's actual
model/RAG evaluation runs. Follows the govern_cost convention: honest
live/source/note, graceful live=False fallback, short TTL cache.

Shape notes (verified against the account):
  - job status strings are TITLE-CASE (Completed | InProgress | Stopped | Failed).
  - applicationType is ModelEvaluation or RagEvaluation.
  - summaries carry evaluationTaskTypes; model ids live under `modelIdentifiers`
    (ModelEvaluation) as ARNs or bare ids; RAG jobs carry `ragIdentifiers` instead.
"""

from __future__ import annotations

import json
import logging
import re
import time
from urllib.parse import urlparse

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_arn
from models.govern_evals import (
    EvalScoresResponse,
    EvaluationJob,
    EvaluationJobsResponse,
    MetricScore,
)

logger = logging.getLogger(__name__)

_EVALS_TTL = 60     # 1 min — surface new/updated jobs quickly
_SCORES_TTL = 1800  # 30 min — scores for a finished job never change
# Cap records parsed per job: result files reach ~7.5MB, so stream + stop early.
_MAX_RECORDS = 2000

# Shorten a model identifier (inference-profile ARN or bare id) to a display name.
_ARN_TAIL = re.compile(r"[:/]([^:/]+)$")


def _short_model(identifier: str) -> str:
    if identifier.startswith("arn:"):
        m = _ARN_TAIL.search(identifier)
        identifier = m.group(1) if m else identifier
    return re.sub(r"^(us|eu|apac|us-gov)\.", "", identifier)


def _iter_scores(rec: dict):
    """Yield (metricName, numeric result) from one result-JSONL record.

    ModelEvaluation records carry `automatedEvaluationResult.scores[]`; RagEvaluation
    records carry `conversationTurns[].results[]`. Each score entry is
    {metricName, result}. Non-numeric results are skipped.
    """
    def _emit(entries):
        for s in entries or []:
            name = s.get("metricName")
            val = s.get("result")
            if name is not None and isinstance(val, (int, float)):
                yield name, float(val)

    if "automatedEvaluationResult" in rec:
        yield from _emit((rec.get("automatedEvaluationResult", {}) or {}).get("scores"))
    if "conversationTurns" in rec:
        for turn in rec.get("conversationTurns", []) or []:
            yield from _emit(turn.get("results"))


class GovernEvalsService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._bedrock = None
        self._s3 = None

    def _client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def _s3_client(self):
        if self._s3 is None:
            self._s3 = boto3.client("s3", region_name=self.region)
        return self._s3

    def get_job_scores(self, job_arn: str) -> "EvalScoresResponse":
        """Cached wrapper around the S3 result-parse for one eval job (30 min TTL)."""
        result, cached_at = get_or_load(
            f"evals:scores:{self.region}:{job_arn}", _SCORES_TTL,
            lambda: self._fetch_job_scores(job_arn), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def get_job_scores_by_name(self, job_name: str) -> "EvalScoresResponse":
        """Look up job by name and fetch scores (safer than exposing ARNs to frontend).

        Uses the job name as the identifier for GetEvaluationJob (Bedrock accepts
        either jobArn or jobName). This avoids passing full job ARNs (which contain
        account IDs) through the frontend.
        """
        # Bedrock GetEvaluationJob accepts jobName as the jobIdentifier.
        return self.get_job_scores(job_arn=job_name)

    def _fetch_job_scores(self, job_arn: str) -> "EvalScoresResponse":
        """Parse real per-metric scores from a job's S3 result JSONL.

        GetEvaluationJob → outputDataConfig.s3Uri → find *_output.jsonl objects →
        line-stream (capped) → aggregate mean per metricName. Handles both layouts:
        ModelEvaluation (automatedEvaluationResult.scores[]) and RagEvaluation
        (conversationTurns[].results[]).
        """
        try:
            job = self._client().get_evaluation_job(jobIdentifier=job_arn)
            job_name = job.get("jobName", "")
            app_type = job.get("applicationType", "")
            s3_uri = (job.get("outputDataConfig", {}) or {}).get("s3Uri", "")
            if not s3_uri:
                return EvalScoresResponse(
                    job_arn=job_arn, job_name=job_name, application_type=app_type,
                    live=False, source="no-output", note="Job has no S3 output location.",
                )

            parsed = urlparse(s3_uri)
            bucket, base_prefix = parsed.netloc, parsed.path.lstrip("/")
            s3 = self._s3_client()

            # Find this job's result files: the layout nests jobName + jobId under the
            # configured prefix, so scope the listing to jobName to avoid other jobs.
            prefix = f"{base_prefix}{job_name}/" if base_prefix else f"{job_name}/"
            keys: list[str] = []
            token = None
            while len(keys) < 50:
                kwargs = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 200}
                if token:
                    kwargs["ContinuationToken"] = token
                resp = s3.list_objects_v2(**kwargs)
                keys.extend(o["Key"] for o in resp.get("Contents", []) if o["Key"].endswith("_output.jsonl"))
                token = resp.get("NextContinuationToken")
                if not token:
                    break

            if not keys:
                return EvalScoresResponse(
                    job_arn=job_arn, job_name=job_name, application_type=app_type,
                    live=False, source="no-results",
                    note="No *_output.jsonl result files found for this job yet.",
                )

            sums: dict[str, float] = {}
            counts: dict[str, int] = {}
            records = 0
            capped = False
            for key in keys:
                if capped:
                    break
                body = s3.get_object(Bucket=bucket, Key=key)["Body"]
                for raw in body.iter_lines():
                    if not raw:
                        continue
                    if records >= _MAX_RECORDS:
                        capped = True
                        break
                    try:
                        rec = json.loads(raw)
                    except (ValueError, TypeError):
                        continue
                    records += 1
                    for m, v in _iter_scores(rec):
                        sums[m] = sums.get(m, 0.0) + v
                        counts[m] = counts.get(m, 0) + 1

            metrics = [
                MetricScore(metric=m, mean_score=round(sums[m] / counts[m], 4), count=counts[m])
                for m in sorted(sums)
            ]
            return EvalScoresResponse(
                job_arn=job_arn, job_name=job_name, application_type=app_type,
                metrics=metrics, records_scored=records, capped=capped,
                live=len(metrics) > 0, source="bedrock-eval-s3",
                note=None if metrics else "Result files found but no metric scores parsed.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Eval scores unavailable for %s: %s", job_arn, e)
            return EvalScoresResponse(
                job_arn=job_arn, live=False, source="unavailable-fallback",
                note="Could not read eval results — job not finished, S3 access denied, or results absent.",
            )

    def get_jobs(self, max_jobs: int = 100) -> EvaluationJobsResponse:
        """Cached wrapper around the live ListEvaluationJobs fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"evals:jobs:{self.region}:{max_jobs}", _EVALS_TTL,
            lambda: self._fetch_jobs(max_jobs), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_jobs(self, max_jobs: int = 100) -> EvaluationJobsResponse:
        try:
            client = self._client()
            summaries: list[dict] = []
            token = None
            while len(summaries) < max_jobs:
                kwargs = {"maxResults": 50}
                if token:
                    kwargs["nextToken"] = token
                resp = client.list_evaluation_jobs(**kwargs)
                summaries.extend(resp.get("jobSummaries", []))
                token = resp.get("nextToken")
                if not token:
                    break

            jobs: list[EvaluationJob] = []
            completed = in_progress = failed = model_evals = rag_evals = 0
            for s in summaries[:max_jobs]:
                status = s.get("status", "")
                app_type = s.get("applicationType", "")
                model_ids = [_short_model(m) for m in (s.get("modelIdentifiers") or [])]
                ct = s.get("creationTime")
                # Mask the job ARN to hide account ID — keep only the job identifier.
                raw_arn = s.get("jobArn", "")
                jobs.append(EvaluationJob(
                    job_arn=mask_arn(raw_arn) or raw_arn,
                    name=s.get("jobName", ""),
                    status=status,
                    application_type=app_type,
                    task_types=s.get("evaluationTaskTypes", []) or [],
                    models=model_ids,
                    created_at=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                ))
                sl = status.lower()
                if sl == "completed":
                    completed += 1
                elif sl in ("inprogress", "in_progress"):
                    in_progress += 1
                elif sl == "failed":
                    failed += 1
                if app_type == "ModelEvaluation":
                    model_evals += 1
                elif app_type == "RagEvaluation":
                    rag_evals += 1

            # Newest first when creation times are available.
            jobs.sort(key=lambda j: j.created_at or "", reverse=True)
            return EvaluationJobsResponse(
                jobs=jobs, total=len(jobs), completed=completed, in_progress=in_progress,
                failed=failed, model_evals=model_evals, rag_evals=rag_evals,
                live=True, source="bedrock-list-evaluation-jobs",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("ListEvaluationJobs unavailable, returning fallback: %s", e)
            return EvaluationJobsResponse(
                jobs=[], live=False, source="unavailable-fallback",
                note="Bedrock unreachable or bedrock:ListEvaluationJobs not granted.",
            )
