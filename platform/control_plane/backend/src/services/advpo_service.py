"""Advanced Prompt Optimization service.

Wraps the Bedrock AdvPO control-plane APIs:
  - create_advanced_prompt_optimization_job
  - get_advanced_prompt_optimization_job

Evaluation datasets and results live in the platform-managed S3 bucket
(see the `advanced_prompt_optimization` Terraform module), under dedicated
prefixes:
  - datasets/  → uploaded evaluation datasets (JSONL)
  - results/   → Bedrock job output
"""

import logging
import uuid
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError

from models.advpo import (
    AdvPODatasetItem,
    AdvPODatasetList,
    AdvPODatasetUploadResult,
    AdvPOJob,
    AdvPOJobCreate,
    AdvPOJobList,
    AdvPOJobListItem,
    AdvPOJobStatus,
    AdvPOJobSummary,
    AdvPOModel,
    AdvPOModelList,
    AdvPOResults,
    ModelConfiguration,
    ModelScope,
)

logger = logging.getLogger(__name__)

RESULTS_FILENAME = "advanced_prompt_optimization_results.jsonl"

# Dedicated prefixes within the AdvPO bucket.
DATASETS_PREFIX = "datasets"
RESULTS_PREFIX = "results"

# Map an AWS region to its CRIS geography prefix. Regional inference profiles
# are scoped to a geography (us.* / eu.* / apac.*); the local region only has
# access to its own geography's profiles plus global.* profiles.
_REGION_TO_GEO = {
    "us": "us",
    "eu": "eu",
    "ap": "apac",
}


def _geo_for_region(region: str) -> str:
    prefix = region.split("-")[0].lower()
    return _REGION_TO_GEO.get(prefix, "us")


class AdvPOService:
    def __init__(self, region: str = "us-east-1", results_bucket: str = ""):
        self.region = region
        self.results_bucket = results_bucket
        self.bedrock_client = boto3.client("bedrock", region_name=region)
        self.s3_client = boto3.client("s3", region_name=region)

    # --- S3 helpers ---

    def _require_bucket(self) -> str:
        if not self.results_bucket:
            raise ValueError("ADVPO_BUCKET is not configured.")
        return self.results_bucket

    def _output_uri(self) -> str:
        """Dedicated output prefix for Bedrock job results."""
        return f"s3://{self._require_bucket()}/{RESULTS_PREFIX}/"

    @staticmethod
    def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
        without_scheme = s3_uri[len("s3://"):] if s3_uri.startswith("s3://") else s3_uri
        bucket, _, key = without_scheme.partition("/")
        return bucket, key

    def upload_dataset(self, name: str, content: str) -> AdvPODatasetUploadResult:
        """Upload an evaluation dataset (JSONL) into the dedicated datasets/
        prefix, appending a 6-character uuid suffix to keep file names unique."""
        bucket = self._require_bucket()
        base = name[:-6] if name.lower().endswith(".jsonl") else name
        base = base.strip().replace(" ", "-") or "dataset"
        suffix = uuid.uuid4().hex[:6]
        key = f"{DATASETS_PREFIX}/{base}-{suffix}.jsonl"

        body = content.encode("utf-8")
        self.s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/jsonl",
            ServerSideEncryption="AES256",
        )
        s3_uri = f"s3://{bucket}/{key}"
        logger.info(f"Uploaded AdvPO dataset to {s3_uri} ({len(body)} bytes)")
        return AdvPODatasetUploadResult(
            s3_uri=s3_uri, bucket=bucket, key=key, size=len(body)
        )

    def list_datasets(self) -> AdvPODatasetList:
        """List existing dataset objects under the datasets/ prefix."""
        bucket = self._require_bucket()
        prefix = f"{DATASETS_PREFIX}/"
        items: List[AdvPODatasetItem] = []
        paginator = self.s3_client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith("/"):
                    continue  # skip the folder placeholder
                lm = obj.get("LastModified")
                items.append(
                    AdvPODatasetItem(
                        key=key,
                        name=key[len(prefix):],
                        s3_uri=f"s3://{bucket}/{key}",
                        size=obj.get("Size", 0),
                        last_modified=lm.isoformat() if hasattr(lm, "isoformat") else None,
                    )
                )
        items.sort(key=lambda d: d.last_modified or "", reverse=True)
        return AdvPODatasetList(bucket=bucket, datasets=items)

    def delete_dataset(self, key: str) -> None:
        """Delete a dataset object. Only keys under the datasets/ prefix are allowed."""
        bucket = self._require_bucket()
        prefix = f"{DATASETS_PREFIX}/"
        if not key.startswith(prefix) or key.endswith("/"):
            raise ValueError("Invalid dataset key.")
        self.s3_client.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted AdvPO dataset s3://{bucket}/{key}")

    def _results_key_for_job(self, job_arn: str, output_uri: Optional[str]) -> tuple[str, str]:
        """Resolve the (bucket, key) of the results JSONL for a job."""
        job_id = job_arn.split("/")[-1]
        if output_uri:
            bucket, prefix = self._parse_s3_uri(output_uri)
        else:
            bucket, prefix = self._require_bucket(), f"{RESULTS_PREFIX}/"
        prefix = prefix.rstrip("/")
        key = f"{prefix}/{job_id}/{RESULTS_FILENAME}" if prefix else f"{job_id}/{RESULTS_FILENAME}"
        return bucket, key

    def read_results(self, job_identifier: str) -> AdvPOResults:
        """Read the results JSONL for a completed job back from S3."""
        job = self.get_job(job_identifier)
        bucket, key = self._results_key_for_job(job.job_arn, job.output_s3_uri)
        obj = self.s3_client.get_object(Bucket=bucket, Key=key)
        content = obj["Body"].read().decode("utf-8")
        return AdvPOResults(
            job_arn=job.job_arn,
            s3_uri=f"s3://{bucket}/{key}",
            content=content,
        )

    # --- Request building ---

    def _build_model_configurations(self, configs: List[ModelConfiguration]) -> list:
        out = []
        for cfg in configs:
            entry: dict = {"modelId": cfg.model_id}
            if cfg.inference_config:
                ic: dict = {}
                if cfg.inference_config.max_tokens is not None:
                    ic["maxTokens"] = cfg.inference_config.max_tokens
                if cfg.inference_config.temperature is not None:
                    ic["temperature"] = cfg.inference_config.temperature
                if cfg.inference_config.top_p is not None:
                    ic["topP"] = cfg.inference_config.top_p
                if cfg.inference_config.stop_sequences:
                    ic["stopSequences"] = cfg.inference_config.stop_sequences
                if ic:
                    entry["inferenceConfig"] = ic
            if cfg.additional_model_request_fields:
                entry["additionalModelRequestFields"] = cfg.additional_model_request_fields
            out.append(entry)
        return out

    # --- Model discovery ---

    @staticmethod
    def _provider_from_id(model_id: str) -> Optional[str]:
        # IDs look like "<provider>.<model>" or "<geo>.<provider>.<model>"
        parts = model_id.split(".")
        if len(parts) >= 3 and parts[0] in {"us", "eu", "apac", "global"}:
            return parts[1]
        if len(parts) >= 2:
            return parts[0]
        return None

    def _list_text_foundation_models(self) -> dict:
        """Return {modelId: providerName} for text-output on-demand models in
        the local region. Used to surface in-region (non-CRIS) targets."""
        out: dict = {}
        try:
            resp = self.bedrock_client.list_foundation_models(byOutputModality="TEXT")
        except Exception as e:
            logger.warning(f"list_foundation_models failed: {e}")
            return out
        for m in resp.get("modelSummaries", []):
            status = (m.get("modelLifecycle") or {}).get("status")
            if status and status != "ACTIVE":
                continue
            out[m.get("modelId", "")] = m.get("providerName")
        return out

    def list_models(self) -> AdvPOModelList:
        """List target models available for the configured region.

        Includes global.* profiles, the region's own geography CRIS profiles
        (us.* / eu.* / apac.*), and in-region on-demand foundation models. A
        job may mix any of these scopes.
        """
        geo = _geo_for_region(self.region)
        models: List[AdvPOModel] = []
        seen: set = set()

        # 1) Inference profiles (global + this geography's regional profiles)
        try:
            paginator = self.bedrock_client.get_paginator("list_inference_profiles")
            pages = paginator.paginate(typeEquals="SYSTEM_DEFINED")
        except Exception:
            pages = [self.bedrock_client.list_inference_profiles(typeEquals="SYSTEM_DEFINED")]

        for page in pages:
            for p in page.get("inferenceProfileSummaries", []):
                if p.get("status") and p["status"] != "ACTIVE":
                    continue
                pid = p.get("inferenceProfileId", "")
                prefix = pid.split(".")[0] if "." in pid else ""
                if prefix == "global":
                    scope, cris_geo = ModelScope.GLOBAL, "global"
                elif prefix == geo:
                    scope, cris_geo = ModelScope.REGIONAL, geo
                else:
                    continue  # other geographies aren't reachable from this region
                if pid in seen:
                    continue
                seen.add(pid)
                models.append(
                    AdvPOModel(
                        id=pid,
                        name=p.get("inferenceProfileName", pid),
                        scope=scope,
                        provider=self._provider_from_id(pid),
                        cris_geo=cris_geo,
                    )
                )

        # 2) In-region on-demand foundation models (no geo prefix)
        for model_id, provider in self._list_text_foundation_models().items():
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            models.append(
                AdvPOModel(
                    id=model_id,
                    name=model_id,
                    scope=ModelScope.IN_REGION,
                    provider=provider,
                    cris_geo=None,
                )
            )

        models.sort(key=lambda m: (m.scope.value, m.id))
        return AdvPOModelList(region=self.region, cris_geo=geo, models=models)

    # --- Bedrock API ---

    def create_job(self, req: AdvPOJobCreate) -> AdvPOJobSummary:
        output_uri = req.output_s3_uri or self._output_uri()

        params: dict = {
            "clientToken": uuid.uuid4().hex,
            "jobName": req.job_name,
            "inputConfig": {"s3Uri": req.input_s3_uri},
            "outputConfig": {"s3Uri": output_uri},
            "modelConfigurations": self._build_model_configurations(req.model_configurations),
        }
        if req.job_description:
            params["jobDescription"] = req.job_description
        if req.encryption_key_arn:
            params["encryptionKeyArn"] = req.encryption_key_arn
        if req.tags:
            params["tags"] = [{"key": k, "value": v} for k, v in req.tags.items()]

        resp = self.bedrock_client.create_advanced_prompt_optimization_job(**params)
        job_arn = resp["jobArn"]
        logger.info(f"Created AdvPO job {req.job_name} ({job_arn})")
        return AdvPOJobSummary(
            job_arn=job_arn,
            job_name=req.job_name,
            status=AdvPOJobStatus.SUBMITTED,
        )

    def get_job(self, job_identifier: str) -> AdvPOJob:
        resp = self.bedrock_client.get_advanced_prompt_optimization_job(
            jobIdentifier=job_identifier
        )

        model_configs: List[ModelConfiguration] = []
        for mc in resp.get("modelConfigurations", []):
            ic = mc.get("inferenceConfig") or {}
            inference = None
            if ic:
                inference = {
                    "max_tokens": ic.get("maxTokens"),
                    "temperature": ic.get("temperature"),
                    "top_p": ic.get("topP"),
                    "stop_sequences": ic.get("stopSequences"),
                }
            model_configs.append(
                ModelConfiguration(
                    model_id=mc.get("modelId", ""),
                    inference_config=inference,
                    additional_model_request_fields=mc.get("additionalModelRequestFields"),
                )
            )

        output_uri = (resp.get("outputConfig") or {}).get("s3Uri")
        job_arn = resp.get("jobArn", job_identifier)
        results_uri = None
        if output_uri or self.results_bucket:
            bucket, key = self._results_key_for_job(job_arn, output_uri)
            results_uri = f"s3://{bucket}/{key}"

        def _iso(v):
            return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)

        return AdvPOJob(
            job_arn=job_arn,
            job_name=resp.get("jobName", ""),
            status=AdvPOJobStatus(resp.get("jobStatus", "InProgress")),
            input_s3_uri=(resp.get("inputConfig") or {}).get("s3Uri"),
            output_s3_uri=output_uri,
            model_configurations=model_configs,
            encryption_key_arn=resp.get("encryptionKeyArn"),
            failure_message=resp.get("failureMessage"),
            creation_time=_iso(resp.get("creationTime")),
            last_modified_time=_iso(resp.get("lastModifiedTime")),
            results_uri=results_uri,
        )

    def list_jobs(self, max_results: int = 50, next_token: Optional[str] = None) -> AdvPOJobList:
        """List advanced prompt optimization jobs, most recent first."""
        def _iso(v):
            return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)

        params: dict = {
            "maxResults": max_results,
            "sortBy": "CreationTime",
            "sortOrder": "Descending",
        }
        if next_token:
            params["nextToken"] = next_token

        resp = self.bedrock_client.list_advanced_prompt_optimization_jobs(**params)
        jobs: List[AdvPOJobListItem] = []
        for s in resp.get("jobSummaries", []):
            jobs.append(
                AdvPOJobListItem(
                    job_arn=s.get("jobArn", ""),
                    job_name=s.get("jobName", ""),
                    status=AdvPOJobStatus(s.get("jobStatus", "InProgress")),
                    creation_time=_iso(s.get("creationTime")),
                    last_modified_time=_iso(s.get("lastModifiedTime")),
                )
            )
        return AdvPOJobList(jobs=jobs, next_token=resp.get("nextToken"))

    def stop_job(self, job_identifier: str) -> None:
        """Stop a running optimization job."""
        self.bedrock_client.stop_advanced_prompt_optimization_job(jobIdentifier=job_identifier)

    def delete_job(self, job_identifier: str) -> None:
        """Delete an optimization job."""
        self.bedrock_client.batch_delete_advanced_prompt_optimization_job(
            jobIdentifiers=[job_identifier]
        )
