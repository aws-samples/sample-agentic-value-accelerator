"""Govern Harness Audit service — S3/filesystem-backed audit artifact store.

Storage scheme:
    s3://bucket/harness-audit/runs/{run_id}/manifest.json
    s3://bucket/harness-audit/runs/{run_id}/artifacts/{artifact_id}.json

When S3 isn't available (local dev), falls back to filesystem storage under
a temp directory. Append-only: artifacts are created and read, never updated
or deleted.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from models.govern_harness_audit import (
    HarnessActionType,
    HarnessAuditArtifact,
    HarnessAuditArtifactCreate,
    HarnessRunManifest,
    HarnessRunManifestCreate,
    HarnessRunManifestWithArtifacts,
    HarnessRunSummary,
    HarnessVerdict,
)

logger = logging.getLogger(__name__)


class GovernHarnessAuditService:
    """Service for managing harness audit artifacts and run manifests."""

    # In-memory buffer for local dev when S3 isn't available
    _mem_artifacts: Dict[str, HarnessAuditArtifact] = {}
    _mem_manifests: Dict[str, HarnessRunManifest] = {}
    _s3_ok: Optional[bool] = None

    def __init__(
        self,
        bucket_name: str = "",
        region: str = "us-east-1",
        prefix: str = "harness-audit",
    ):
        self.bucket_name = bucket_name
        self.region = region
        self.prefix = prefix
        self._s3 = boto3.client("s3", region_name=region) if bucket_name else None
        # Local filesystem fallback path
        self._local_path = Path(tempfile.gettempdir()) / "ava-harness-audit"

    # --- Helper methods ---

    def _artifact_key(self, run_id: str, artifact_id: str) -> str:
        return f"{self.prefix}/runs/{run_id}/artifacts/{artifact_id}.json"

    def _manifest_key(self, run_id: str) -> str:
        return f"{self.prefix}/runs/{run_id}/manifest.json"

    def _to_json(self, obj) -> str:
        return obj.model_dump_json(indent=2)

    def _write_s3(self, key: str, body: str) -> bool:
        """Write to S3, return True on success."""
        if not self._s3 or not self.bucket_name:
            return False
        if type(self)._s3_ok is False:
            return False
        try:
            self._s3.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=body.encode("utf-8"),
                ContentType="application/json",
            )
            type(self)._s3_ok = True
            return True
        except ClientError as e:
            logger.warning(f"S3 write failed: {e}")
            type(self)._s3_ok = False
            return False

    def _read_s3(self, key: str) -> Optional[str]:
        """Read from S3, return None if not found or failed."""
        if not self._s3 or not self.bucket_name:
            return None
        if type(self)._s3_ok is False:
            return None
        try:
            resp = self._s3.get_object(Bucket=self.bucket_name, Key=key)
            type(self)._s3_ok = True
            return resp["Body"].read().decode("utf-8")
        except ClientError:
            return None

    def _list_s3_keys(self, prefix: str) -> List[str]:
        """List keys under a prefix in S3."""
        if not self._s3 or not self.bucket_name:
            return []
        if type(self)._s3_ok is False:
            return []
        try:
            paginator = self._s3.get_paginator("list_objects_v2")
            keys = []
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                for obj in page.get("Contents", []):
                    keys.append(obj["Key"])
            type(self)._s3_ok = True
            return keys
        except ClientError:
            type(self)._s3_ok = False
            return []

    def _write_local(self, path: Path, body: str) -> None:
        """Write to local filesystem."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")

    def _read_local(self, path: Path) -> Optional[str]:
        """Read from local filesystem."""
        if path.exists():
            return path.read_text(encoding="utf-8")
        return None

    # --- Artifact methods ---

    def create_artifact(
        self,
        run_id: str,
        artifact: HarnessAuditArtifactCreate,
    ) -> HarnessAuditArtifact:
        """Create a new audit artifact for a run."""
        full = HarnessAuditArtifact(**artifact.model_dump())

        # Write to S3 or local
        body = self._to_json(full)
        if not self._write_s3(self._artifact_key(run_id, full.artifact_id), body):
            # Fallback to local
            local_path = self._local_path / "runs" / run_id / "artifacts" / f"{full.artifact_id}.json"
            self._write_local(local_path, body)
            type(self)._mem_artifacts[full.artifact_id] = full

        # Update manifest
        manifest = self.get_run_manifest(run_id)
        if manifest:
            manifest.artifacts.append(full.artifact_id)
            self._update_manifest_summary(manifest, full)
            self._save_manifest(manifest)

        return full

    def get_artifact(self, artifact_id: str, run_id: Optional[str] = None) -> Optional[HarnessAuditArtifact]:
        """Get a single artifact by ID. If run_id is known, use it for direct lookup."""
        # Check memory first
        if artifact_id in type(self)._mem_artifacts:
            return type(self)._mem_artifacts[artifact_id]

        # If run_id is known, direct lookup
        if run_id:
            body = self._read_s3(self._artifact_key(run_id, artifact_id))
            if body:
                return HarnessAuditArtifact.model_validate_json(body)
            local_path = self._local_path / "runs" / run_id / "artifacts" / f"{artifact_id}.json"
            body = self._read_local(local_path)
            if body:
                return HarnessAuditArtifact.model_validate_json(body)

        # Search all runs
        for rid, manifest in type(self)._mem_manifests.items():
            if artifact_id in manifest.artifacts:
                local_path = self._local_path / "runs" / rid / "artifacts" / f"{artifact_id}.json"
                body = self._read_local(local_path)
                if body:
                    return HarnessAuditArtifact.model_validate_json(body)

        return None

    def get_artifacts(self, run_id: str) -> List[HarnessAuditArtifact]:
        """Get all artifacts for a run."""
        manifest = self.get_run_manifest(run_id)
        if not manifest:
            return []

        artifacts = []
        for aid in manifest.artifacts:
            artifact = self.get_artifact(aid, run_id)
            if artifact:
                artifacts.append(artifact)

        return artifacts

    # --- Manifest methods ---

    def create_run_manifest(self, manifest: HarnessRunManifestCreate) -> HarnessRunManifest:
        """Create a new run manifest."""
        full = HarnessRunManifest(**manifest.model_dump())

        # Write to S3 or local
        self._save_manifest(full)
        type(self)._mem_manifests[full.run_id] = full

        return full

    def _save_manifest(self, manifest: HarnessRunManifest) -> None:
        """Save manifest to storage."""
        body = self._to_json(manifest)
        if not self._write_s3(self._manifest_key(manifest.run_id), body):
            local_path = self._local_path / "runs" / manifest.run_id / "manifest.json"
            self._write_local(local_path, body)

    def get_run_manifest(self, run_id: str) -> Optional[HarnessRunManifest]:
        """Get a run manifest by ID."""
        # Check memory first
        if run_id in type(self)._mem_manifests:
            return type(self)._mem_manifests[run_id]

        # Try S3
        body = self._read_s3(self._manifest_key(run_id))
        if body:
            manifest = HarnessRunManifest.model_validate_json(body)
            type(self)._mem_manifests[run_id] = manifest
            return manifest

        # Try local
        local_path = self._local_path / "runs" / run_id / "manifest.json"
        body = self._read_local(local_path)
        if body:
            manifest = HarnessRunManifest.model_validate_json(body)
            type(self)._mem_manifests[run_id] = manifest
            return manifest

        return None

    def get_run_manifest_with_artifacts(self, run_id: str) -> Optional[HarnessRunManifestWithArtifacts]:
        """Get a run manifest with full artifact details."""
        manifest = self.get_run_manifest(run_id)
        if not manifest:
            return None

        artifacts = self.get_artifacts(run_id)
        return HarnessRunManifestWithArtifacts(
            **manifest.model_dump(),
            artifact_details=artifacts,
        )

    def complete_run(self, run_id: str) -> Optional[HarnessRunManifest]:
        """Mark a run as completed."""
        manifest = self.get_run_manifest(run_id)
        if not manifest:
            return None

        manifest.completed_at = datetime.utcnow()
        self._save_manifest(manifest)
        return manifest

    def list_runs(self, limit: int = 100) -> List[HarnessRunManifest]:
        """List recent run manifests, newest first."""
        manifests: List[HarnessRunManifest] = []

        # Check S3
        keys = self._list_s3_keys(f"{self.prefix}/runs/")
        manifest_keys = [k for k in keys if k.endswith("/manifest.json")]
        for key in manifest_keys[:limit]:
            body = self._read_s3(key)
            if body:
                manifests.append(HarnessRunManifest.model_validate_json(body))

        # Check local
        runs_dir = self._local_path / "runs"
        if runs_dir.exists():
            for run_dir in sorted(runs_dir.iterdir(), reverse=True)[:limit]:
                manifest_path = run_dir / "manifest.json"
                body = self._read_local(manifest_path)
                if body:
                    m = HarnessRunManifest.model_validate_json(body)
                    if m.run_id not in [x.run_id for x in manifests]:
                        manifests.append(m)

        # Include memory
        for m in type(self)._mem_manifests.values():
            if m.run_id not in [x.run_id for x in manifests]:
                manifests.append(m)

        # Sort by started_at descending
        manifests.sort(key=lambda m: m.started_at, reverse=True)
        return manifests[:limit]

    def _update_manifest_summary(self, manifest: HarnessRunManifest, artifact: HarnessAuditArtifact) -> None:
        """Update manifest summary with new artifact."""
        s = manifest.summary
        s.total_artifacts += 1
        s.total_duration_ms += artifact.duration_ms
        if artifact.token_count:
            s.total_tokens += artifact.token_count

        # By action type
        at = artifact.action_type.value
        s.by_action_type[at] = s.by_action_type.get(at, 0) + 1

        # By verdict
        v = artifact.verdict.value
        s.by_verdict[v] = s.by_verdict.get(v, 0) + 1

        # Gate counts
        s.gates_passed += len(artifact.gates_passed)
        s.gates_failed += len(artifact.gates_failed)

    # --- Utility methods ---

    @staticmethod
    def compute_hash(content: str) -> str:
        """Compute SHA256 hash of content."""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()
