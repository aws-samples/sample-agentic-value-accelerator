"""Govern Evals service — real Bedrock evaluation jobs, read-through + cached.

Uses bedrock:ListEvaluationJobs (paginated) to surface the account's actual
model/RAG evaluation runs. Follows the govern_cost convention: honest
live/source/note, graceful live=False fallback, short TTL cache.

Shape notes (verified against the account):
  - job status strings are TITLE-CASE (Completed | InProgress | Stopped | Failed).
  - applicationType is ModelEvaluation or RagEvaluation.
  - summaries carry evaluationTaskTypes; model ids live under `modelIdentifiers`
    (ModelEvaluation) as ARNs or bare ids; RAG jobs carry `ragIdentifiers` instead.
  - GetEvaluationJob's jobIdentifier takes an ARN and nothing else; a job name is
    rejected with ValidationException. Names reach an ARN only through the list
    response (see resolve_job_arn), never by string-building one.
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
_JOB_ARN_TTL = 300  # 5 min — a job's name→ARN binding never changes once created
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
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    def resolve_job_arn(self, job_name: str) -> str | None:
        """Resolve a job NAME to its real job ARN off ListEvaluationJobs (5 min cache).

        GetEvaluationJob's jobIdentifier is ARN-ONLY. Verified against the botocore
        service model shipped in this image: the member is documented as "The Amazon
        Resource Name (ARN) of the evaluation job" and constrained to the pattern
        arn:aws(-[^:]+)?:bedrock:<region>:<12-digit-account>:evaluation-job/[a-z0-9]{12}.
        Passing a name fails with ValidationException "The provided evaluation job ARN
        is invalid" — which is exactly what the previous code did on every request.

        The ARN also cannot be hand-built: that [a-z0-9]{12} tail is a Bedrock-generated
        job id bearing no relation to the job name — a name like `evaluation-job-<use
        case>-<model>` maps to an opaque twelve-character id, confirmed against a live
        account. So string-formatting an ARN from a name plus the account id yields a
        valid-looking ARN for a job that does not exist. The ARN has to come from the list
        response that produced the name, which is what this does.
        """
        if not job_name:
            return None
        arn, _ = get_or_load(
            f"evals:arn:{self.region}:{job_name}", _JOB_ARN_TTL,
            lambda: self._lookup_job_arn(job_name),
            # Never cache a miss. A job created seconds ago would otherwise stay
            # "not found" for the whole TTL after it became listable.
            should_cache=lambda a: bool(a),
        )
        return arn

    def _lookup_job_arn(self, job_name: str) -> str | None:
        """One ListEvaluationJobs pass filtered by name; None when nothing matches."""
        try:
            client = self._client()
            matches: list[dict] = []
            token = None
            pages = 0
            while pages < 5:
                kwargs = {"maxResults": 50, "nameContains": job_name}
                if token:
                    kwargs["nextToken"] = token
                resp = client.list_evaluation_jobs(**kwargs)
                # nameContains is a SUBSTRING filter, so an exact-name compare is
                # required: a request for "eval-claude" would otherwise resolve to
                # whichever "eval-claude-v2" the page happened to return first.
                matches.extend(
                    s for s in resp.get("jobSummaries", [])
                    if s.get("jobName") == job_name and s.get("jobArn")
                )
                token = resp.get("nextToken")
                pages += 1
                if not token:
                    break
            if not matches:
                return None
            # Nothing guarantees one job per name across time, so newest-first makes
            # repeat lookups for the same name deterministic instead of page-order luck.
            matches.sort(key=lambda s: str(s.get("creationTime") or ""), reverse=True)
            return matches[0].get("jobArn")
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Could not resolve eval job ARN for %s in %s: %s", job_name, self.region, e)
            return None

    def get_job_scores_by_name(self, job_name: str) -> "EvalScoresResponse":
        """Look up job by name and fetch scores (the frontend never sees a full ARN).

        Two steps on purpose: resolve name → real ARN via ListEvaluationJobs, then
        GetEvaluationJob with that ARN (see resolve_job_arn for why a name cannot be
        passed and an ARN cannot be built). The response's job_arn stays masked, so
        account IDs still do not leave the backend.

        A failure to resolve returns live=False with source="job-not-found" rather than
        an empty metric list under the old note, because "no metrics" renders as a job
        with nothing to flag — the opposite of "we could not read this job's scores".
        """
        arn = self.resolve_job_arn(job_name)
        if not arn:
            return EvalScoresResponse(
                job_arn=job_name, job_name=job_name, live=False, source="job-not-found",
                note=(
                    f"No evaluation job named '{job_name}' found in {self.region} via "
                    "ListEvaluationJobs. Scores are UNKNOWN for this job, not clean."
                ),
            )
        return self.get_job_scores(job_arn=arn)

    def _fetch_job_scores(self, job_arn: str) -> "EvalScoresResponse":
        """Parse real per-metric scores from a job's S3 result JSONL.

        GetEvaluationJob → outputDataConfig.s3Uri → find *_output.jsonl objects →
        line-stream (capped) → aggregate mean per metricName. Handles both layouts:
        ModelEvaluation (automatedEvaluationResult.scores[]) and RagEvaluation
        (conversationTurns[].results[]).

        `job_arn` must be a real job ARN (see resolve_job_arn). It is masked before it
        goes into the response so the account ID stays server-side, matching what
        _fetch_jobs does with each summary's jobArn.
        """
        masked = mask_arn(job_arn) or job_arn
        try:
            job = self._client().get_evaluation_job(jobIdentifier=job_arn)
            job_name = job.get("jobName", "")
            app_type = job.get("applicationType", "")
            s3_uri = (job.get("outputDataConfig", {}) or {}).get("s3Uri", "")
            if not s3_uri:
                return EvalScoresResponse(
                    job_arn=masked, job_name=job_name, application_type=app_type,
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
                    job_arn=masked, job_name=job_name, application_type=app_type,
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
                job_arn=masked, job_name=job_name, application_type=app_type,
                metrics=metrics, records_scored=records, capped=capped,
                live=len(metrics) > 0, source="bedrock-eval-s3",
                note=None if metrics else "Result files found but no metric scores parsed.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            # Name the actual AWS failure instead of listing three possible causes. The
            # old note guessed ("job not finished, S3 access denied, or results absent")
            # and so hid a ValidationException behind a benign-sounding explanation for
            # weeks. Carry the error code, and say plainly that zero metrics here means
            # unknown rather than clean.
            code = (
                e.response.get("Error", {}).get("Code", "ClientError")
                if isinstance(e, ClientError) else type(e).__name__
            )
            logger.warning("Eval scores unavailable for %s in %s: %s", masked, self.region, e)
            return EvalScoresResponse(
                job_arn=masked, live=False, source="unavailable-fallback",
                note=(
                    f"Could not read eval results ({code}) in {self.region}: job not "
                    "finished, S3 access denied, or results absent. Scores are UNKNOWN "
                    "for this job, not clean."
                ),
            )

    def get_jobs(self, max_jobs: int = 100) -> EvaluationJobsResponse:
        """Cached wrapper around the live ListEvaluationJobs fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"evals:jobs:{self.region}:{max_jobs}", _EVALS_TTL,
            lambda: self._fetch_jobs(max_jobs), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
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
