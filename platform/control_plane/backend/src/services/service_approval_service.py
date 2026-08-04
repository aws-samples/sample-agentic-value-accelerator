"""Service layer for the Service Approval (Service Onboarding) pipeline.

Backed by DynamoDB (run metadata) + S3 (artifacts) + Step Functions (runner).
Falls back to an in-memory + filesystem simulator when AWS resources are not
configured, so the UI works in local dev without infra.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import threading
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from models.service_approval import (
    PHASE_DEFINITIONS,
    FileContent,
    FileEntry,
    FileGroup,
    FileTree,
    Framework,
    PhaseState,
    PhaseStatus,
    RunStatus,
    ServiceApprovalRun,
    ServiceApprovalRunCreate,
    TestingMode,
    default_phases,
)

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"[^a-z0-9-]+")
_PARTITION_KEY = "GLOBAL"  # single-partition for chronological list


def _slugify(service: str) -> str:
    base = _SLUG_RE.sub("-", service.lower()).strip("-") or "service"
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{base}-{ts}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _phase_dir_for(key: str) -> str:
    for p in PHASE_DEFINITIONS:
        if p["key"] == key:
            return p["phase_dir"]
    return key


def _phase_key_for(phase_dir: str) -> Optional[str]:
    for p in PHASE_DEFINITIONS:
        if p["phase_dir"] == phase_dir:
            return p["key"]
    return None


class ServiceApprovalService:
    def __init__(
        self,
        table_name: str,
        bucket_name: str,
        region: str,
        agent_runtime_arn: str,
        local_artifacts_root: Optional[str] = None,
    ) -> None:
        self.table_name = table_name
        self.bucket_name = bucket_name
        self.region = region
        self.agent_runtime_arn = agent_runtime_arn
        self.local_artifacts_root = Path(local_artifacts_root) if local_artifacts_root else None

        try:
            self._ddb = boto3.resource("dynamodb", region_name=region)
            self._table = self._ddb.Table(table_name) if table_name else None
        except Exception:  # pragma: no cover
            self._table = None

        try:
            self._s3 = boto3.client("s3", region_name=region)
        except Exception:  # pragma: no cover
            self._s3 = None

        try:
            # Data-plane client. Control-plane (bedrock-agentcore-control)
            # isn't needed from the backend — the v2 Terraform module owns
            # runtime config.
            self._agentcore = boto3.client("bedrock-agentcore", region_name=region)
        except Exception:  # pragma: no cover
            self._agentcore = None

        # local fallback caches
        self._local_runs: Dict[str, ServiceApprovalRun] = {}
        self._local_lock = threading.Lock()

    # -- mode helpers -------------------------------------------------------

    @property
    def _has_ddb(self) -> bool:
        return bool(self.table_name) and self._table is not None

    @property
    def _has_s3(self) -> bool:
        return bool(self.bucket_name) and self._s3 is not None

    @property
    def _has_agentcore(self) -> bool:
        return bool(self.agent_runtime_arn) and self._agentcore is not None

    # -- run CRUD -----------------------------------------------------------

    def create_run(self, req: ServiceApprovalRunCreate, created_by: Optional[str] = None) -> ServiceApprovalRun:
        slug = _slugify(req.service)
        now = _now()
        run = ServiceApprovalRun(
            slug=slug,
            service=req.service,
            framework=req.framework,
            testing_mode=req.testing_mode,
            status=RunStatus.PENDING,
            created_at=now,
            updated_at=now,
            created_by=created_by,
            phases=default_phases(),
        )
        self._save(run)
        if self._has_agentcore:
            self._invoke_agentcore(run, req)
        else:
            # Local simulator
            self._kick_local_simulation(run)
        return run

    def _invoke_agentcore(self, run: ServiceApprovalRun, req: ServiceApprovalRunCreate) -> None:
        """Invoke the v2 AgentCore runtime to start a pipeline.

        The agent's @app.entrypoint returns within ms (detached pattern:
        @app.entrypoint kicks off a background thread, returns immediately).
        We store the session ID as execution_arn so cancel/delete have a
        handle to identify the run later.

        runtimeSessionId regex requires at least 33 chars; the standard
        slug shape "<service>-<YYYYMMDDTHHMMSS>" is around 25-30 chars, so
        we append a deterministic suffix to clear the floor. Determinism
        matters because cancel_run needs to be able to re-derive the same
        ID later if it ever gains a stop-session API."""
        slug = run.slug
        session_id = f"{slug}-svc-approval-session"
        if len(session_id) < 33:
            session_id = session_id + "-padding-bytes"

        payload = json.dumps({
            "slug": slug,
            "service": req.service,
            "framework": req.framework.value,
            "testing_mode": req.testing_mode.value,
        }).encode()

        try:
            resp = self._agentcore.invoke_agent_runtime(
                agentRuntimeArn=self.agent_runtime_arn,
                qualifier="DEFAULT",
                runtimeSessionId=session_id,
                payload=payload,
                contentType="application/json",
                accept="application/json",
            )
            # Drain the streaming body — the agent returns a small JSON
            # ack synchronously, but we MUST iterate to release the conn.
            for _ in resp.get("response") or []:
                pass
            run.execution_arn = session_id
            run.status = RunStatus.RUNNING
            run.updated_at = _now()
            self._save(run)
            logger.info("AgentCore invoke accepted slug=%s session=%s", slug, session_id)
        except Exception as e:  # pragma: no cover
            logger.exception("AgentCore invoke failed for %s: %s", slug, e)
            run.status = RunStatus.FAILED
            run.error = f"Failed to start runner: {e}"
            run.updated_at = _now()
            self._save(run)

    def list_runs(self) -> List[ServiceApprovalRun]:
        if self._has_ddb:
            try:
                resp = self._table.query(
                    KeyConditionExpression=Key("pk").eq(_PARTITION_KEY),
                    ScanIndexForward=False,  # newest first
                    Limit=50,
                )
                items = resp.get("Items", [])
            except ClientError:
                logger.exception("Failed to query runs from DDB")
                return []
            # Parse each row independently. A single malformed item — e.g. a
            # row written by an earlier schema version, or by a script running
            # outside the backend — must not blank the whole list page.
            runs: List[ServiceApprovalRun] = []
            for item in items:
                try:
                    runs.append(self._from_item(item))
                except Exception:
                    logger.exception(
                        "Skipping unparsable run row sk=%s",
                        item.get("sk", "?"),
                    )
        else:
            with self._local_lock:
                runs = sorted(self._local_runs.values(), key=lambda r: r.created_at, reverse=True)
        return runs

    def get_run(self, slug: str) -> Optional[ServiceApprovalRun]:
        if self._has_ddb:
            try:
                resp = self._table.get_item(Key={"pk": _PARTITION_KEY, "sk": slug})
                item = resp.get("Item")
            except ClientError:
                logger.exception("Failed to fetch run %s", slug)
                return None
            if not item:
                return None
            try:
                run = self._from_item(item)
            except Exception:
                # Malformed row (e.g. earlier schema, out-of-band write) —
                # surface as missing rather than 500ing the detail page.
                logger.exception("Failed to parse run row sk=%s", slug)
                return None
        else:
            with self._local_lock:
                run = self._local_runs.get(slug)
                if run is None:
                    return None
                run = run.model_copy(deep=True)
        # refresh file counts from S3 / local fs (lightweight: HEAD-style listing)
        self._refresh_phase_counts(run)
        return run

    def cancel_run(self, slug: str) -> Optional[ServiceApprovalRun]:
        """Mark a run cancelled. AgentCore doesn't expose a synchronous
        cancel-this-running-invocation API, so the microVM continues until
        the pipeline finishes naturally or hits the idle timeout (~30 min
        after the last async task heartbeat). The DDB row reflects user
        intent immediately so observers know the run is no longer
        authoritative — same fire-and-forget pattern as delete_run."""
        run = self.get_run(slug)
        if not run:
            return None
        if run.status not in (RunStatus.PENDING, RunStatus.RUNNING):
            return run
        if run.execution_arn:
            logger.info("AgentCore session %s marked cancelled (microVM "
                        "completes naturally — no synchronous stop API)",
                        run.execution_arn)
        run.status = RunStatus.CANCELLED
        run.updated_at = _now()
        for p in run.phases:
            if p.status == PhaseStatus.RUNNING:
                p.status = PhaseStatus.PENDING
        self._save(run)
        return run

    def delete_run(self, slug: str) -> bool:
        """Drop S3 artifacts under the slug prefix and remove the DDB row.

        AgentCore doesn't expose a synchronous cancel API, so an in-flight
        pipeline keeps running in its microVM until it finishes naturally
        or hits the idle timeout. Any stray writes from the still-running
        pipeline land in an orphaned slug prefix that we just deleted —
        they become harmless garbage. Fire-and-forget by design."""
        run = self.get_run(slug)
        if not run:
            return False

        if run.status in (RunStatus.PENDING, RunStatus.RUNNING) and run.execution_arn:
            logger.info("AgentCore session %s — deleting DDB row + S3 "
                        "artifacts; microVM completes naturally",
                        run.execution_arn)

        # S3 — paginate and delete every object under <slug>/.
        if self._has_s3:
            try:
                paginator = self._s3.get_paginator("list_objects_v2")
                batch: List[dict] = []
                for page in paginator.paginate(Bucket=self.bucket_name, Prefix=f"{slug}/"):
                    for obj in page.get("Contents", []) or []:
                        batch.append({"Key": obj["Key"]})
                        if len(batch) == 1000:
                            self._s3.delete_objects(Bucket=self.bucket_name,
                                                    Delete={"Objects": batch})
                            batch = []
                if batch:
                    self._s3.delete_objects(Bucket=self.bucket_name,
                                            Delete={"Objects": batch})
            except ClientError:
                logger.exception("Failed to delete S3 artifacts for %s", slug)

        # Local fs fallback — wipe the slug directory.
        local = self._local_root(slug)
        if local.exists():
            import shutil
            shutil.rmtree(local, ignore_errors=True)

        # DDB — drop the row.
        if self._has_ddb:
            try:
                self._table.delete_item(Key={"pk": _PARTITION_KEY, "sk": slug})
            except ClientError:
                logger.exception("Failed to delete DDB row for %s", slug)
                return False
        else:
            with self._local_lock:
                self._local_runs.pop(slug, None)
        return True

    # -- file browsing ------------------------------------------------------

    def list_files(self, slug: str, phase_dir: str) -> FileTree:
        prefix = f"{slug}/{phase_dir}/"
        entries: List[Tuple[str, int, datetime]] = []  # path, size, mtime
        if self._has_s3:
            paginator = self._s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                for obj in page.get("Contents", []) or []:
                    key = obj["Key"]
                    rel = key[len(f"{slug}/"):]
                    entries.append((rel, obj["Size"], obj["LastModified"]))
        else:
            root = self._local_root(slug) / phase_dir
            if root.exists():
                for f in sorted(root.rglob("*")):
                    if f.is_file():
                        rel = str(f.relative_to(self._local_root(slug)))
                        entries.append((rel, f.stat().st_size, datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)))

        groups_map: Dict[str, List[FileEntry]] = defaultdict(list)
        for rel, size, mtime in entries:
            sub = rel[len(f"{phase_dir}/"):]
            if "/" in sub:
                group, _ = sub.split("/", 1)
            else:
                group = ""
            groups_map[group].append(FileEntry(path=rel, size=size, modified_at=mtime))

        ordered_groups = sorted(groups_map.items(), key=lambda kv: (kv[0] == "", kv[0]))
        return FileTree(
            slug=slug,
            phase=phase_dir,
            groups=[FileGroup(name=name, files=sorted(files, key=lambda f: f.path)) for name, files in ordered_groups],
        )

    def get_file(self, slug: str, path: str) -> Optional[FileContent]:
        # path is relative to slug (e.g. 05-generate/preventive/foo.json)
        if ".." in path.split("/"):
            return None
        if self._has_s3:
            try:
                resp = self._s3.get_object(Bucket=self.bucket_name, Key=f"{slug}/{path}")
                body = resp["Body"].read()
                size = resp["ContentLength"]
            except ClientError:
                return None
        else:
            f = self._local_root(slug) / path
            if not f.exists() or not f.is_file():
                return None
            body = f.read_bytes()
            size = f.stat().st_size

        try:
            text = body.decode("utf-8")
            encoding = "utf-8"
        except UnicodeDecodeError:
            import base64
            text = base64.b64encode(body).decode("ascii")
            encoding = "base64"
        return FileContent(path=path, size=size, content=text, encoding=encoding)

    def get_file_bytes(self, slug: str, path: str) -> Optional[Tuple[bytes, str]]:
        """Return raw bytes + a content type for /file?download=1."""
        if ".." in path.split("/"):
            return None
        if self._has_s3:
            try:
                resp = self._s3.get_object(Bucket=self.bucket_name, Key=f"{slug}/{path}")
                return resp["Body"].read(), resp.get("ContentType") or "application/octet-stream"
            except ClientError:
                return None
        f = self._local_root(slug) / path
        if not f.exists() or not f.is_file():
            return None
        return f.read_bytes(), "application/octet-stream"

    def build_zip(self, slug: str, phase_dir: Optional[str] = None) -> Optional[bytes]:
        """Return an in-memory zip of either a single phase or the whole slug."""
        prefix = f"{slug}/" + (f"{phase_dir}/" if phase_dir else "")
        buf = io.BytesIO()
        wrote_any = False
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if self._has_s3:
                paginator = self._s3.get_paginator("list_objects_v2")
                for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                    for obj in page.get("Contents", []) or []:
                        body = self._s3.get_object(Bucket=self.bucket_name, Key=obj["Key"])["Body"].read()
                        arc = obj["Key"][len(f"{slug}/"):]
                        zf.writestr(arc, body)
                        wrote_any = True
            else:
                root = self._local_root(slug)
                target = root / (phase_dir or "")
                if target.exists():
                    for f in target.rglob("*"):
                        if f.is_file():
                            zf.write(f, str(f.relative_to(root)))
                            wrote_any = True
        if not wrote_any:
            return None
        return buf.getvalue()

    # -- internal helpers ---------------------------------------------------

    def _local_root(self, slug: str) -> Path:
        base = self.local_artifacts_root or Path("/tmp/.service-approval")
        return base / slug

    def _save(self, run: ServiceApprovalRun) -> None:
        if self._has_ddb:
            try:
                self._table.put_item(Item=self._to_item(run))
                return
            except ClientError:
                logger.exception("Failed to save run %s to DDB", run.slug)
        with self._local_lock:
            self._local_runs[run.slug] = run.model_copy(deep=True)

    def _to_item(self, run: ServiceApprovalRun) -> dict:
        return {
            "pk": _PARTITION_KEY,
            "sk": run.slug,
            **json.loads(run.model_dump_json()),
        }

    def _from_item(self, item: dict) -> ServiceApprovalRun:
        clean = {k: v for k, v in item.items() if k not in ("pk", "sk")}
        return ServiceApprovalRun.model_validate(clean)

    def _refresh_phase_counts(self, run: ServiceApprovalRun) -> None:
        for p in run.phases:
            phase_dir = _phase_dir_for(p.key)
            count = self._count_files(run.slug, phase_dir)
            p.file_count = count
            # auto-promote phase status from PENDING → COMPLETE when files appear
            if count > 0 and p.status == PhaseStatus.PENDING:
                p.status = PhaseStatus.COMPLETE
        # surface approval report
        if not run.approval_report_path:
            cand = "07-summarize/APPROVAL-REPORT.md"
            if self._object_exists(run.slug, cand):
                run.approval_report_path = cand

    def _count_files(self, slug: str, phase_dir: str) -> int:
        prefix = f"{slug}/{phase_dir}/"
        if self._has_s3:
            try:
                resp = self._s3.list_objects_v2(Bucket=self.bucket_name, Prefix=prefix)
                return resp.get("KeyCount", 0) or 0
            except ClientError:
                return 0
        root = self._local_root(slug) / phase_dir
        if not root.exists():
            return 0
        return sum(1 for f in root.rglob("*") if f.is_file())

    def _object_exists(self, slug: str, rel_path: str) -> bool:
        if self._has_s3:
            try:
                self._s3.head_object(Bucket=self.bucket_name, Key=f"{slug}/{rel_path}")
                return True
            except ClientError:
                return False
        return (self._local_root(slug) / rel_path).exists()

    # -- local simulator ----------------------------------------------------

    def _kick_local_simulation(self, run: ServiceApprovalRun) -> None:
        """Simulate the pipeline by writing realistic per-phase fixtures to the
        local artifacts root over a short interval. Lets the UI render
        end-to-end without a real Step Functions execution."""
        thread = threading.Thread(target=self._run_local_simulation, args=(run.slug,), daemon=True)
        thread.start()

    def _run_local_simulation(self, slug: str) -> None:
        try:
            run = self.get_run(slug)
            if not run:
                return
            run.status = RunStatus.RUNNING
            run.updated_at = _now()
            self._save(run)

            root = self._local_root(slug)
            root.mkdir(parents=True, exist_ok=True)

            for idx, phase_def in enumerate(PHASE_DEFINITIONS):
                # mark running
                fresh = self.get_run(slug)
                if not fresh or fresh.status == RunStatus.CANCELLED:
                    return
                for p in fresh.phases:
                    if p.key == phase_def["key"]:
                        p.status = PhaseStatus.RUNNING
                        p.started_at = _now()
                fresh.updated_at = _now()
                self._save(fresh)

                phase_dir = root / phase_def["phase_dir"]
                phase_dir.mkdir(parents=True, exist_ok=True)
                self._write_phase_fixtures(slug, phase_def["key"], phase_dir, run.service)

                time.sleep(1.5)

                fresh = self.get_run(slug)
                if not fresh or fresh.status == RunStatus.CANCELLED:
                    return
                for p in fresh.phases:
                    if p.key == phase_def["key"]:
                        p.status = PhaseStatus.COMPLETE
                        p.completed_at = _now()
                fresh.updated_at = _now()
                self._save(fresh)

            done = self.get_run(slug)
            if done and done.status != RunStatus.CANCELLED:
                done.status = RunStatus.COMPLETED
                done.updated_at = _now()
                done.approval_report_path = "07-summarize/APPROVAL-REPORT.md"
                self._save(done)
        except Exception:  # pragma: no cover
            logger.exception("Local simulation failed for %s", slug)
            run = self.get_run(slug)
            if run:
                run.status = RunStatus.FAILED
                run.error = "Local simulation crashed; see backend logs."
                run.updated_at = _now()
                self._save(run)

    def _write_phase_fixtures(self, slug: str, phase_key: str, out_dir: Path, service: str) -> None:
        """Deterministic, illustrative fixtures so the UI renders something
        reasonable per phase. Replace with real artifacts when the runner is
        wired into Bedrock + the plugin's SKILL.md files."""
        ts = _now().isoformat()
        if phase_key == "assess":
            (out_dir / "sar-facts.json").write_text(json.dumps({
                "service": service, "generated_at": ts,
                "facts": {"data_plane_apis": True, "iam_condition_keys": ["aws:RequestedRegion"]},
            }, indent=2))
            (out_dir / "checkpoint-results.json").write_text(json.dumps({"checkpoints": [{"id": "C1", "passed": True}]}, indent=2))
            (out_dir / "assessment-summary.md").write_text(f"# Assessment Summary — {service}\n\nFive-domain CAF posture for `{service}`.\n")
            (out_dir / "iac-support.json").write_text(json.dumps({"cdk": True, "terraform": True, "cloudformation": True}, indent=2))
        elif phase_key == "research":
            (out_dir / "research.json").write_text(json.dumps({
                "service": service, "version": "3.0",
                "capabilities": [{"name": "encryption-at-rest", "verified": True}],
                "api_surface": [{"operation": "Create*", "control_plane": True}],
            }, indent=2))
        elif phase_key == "validate":
            (out_dir / "validated.json").write_text(json.dumps({
                "service": service, "validated_at": ts,
                "items": [{"id": "V1", "verification_note": f"Verified via aws-documentation MCP for {service}"}],
            }, indent=2))
        elif phase_key == "map":
            (out_dir / "mapping-results.json").write_text(json.dumps({
                "service": service,
                "controls": [{"id": "CTRL-ORG-PRV-001", "category": "preventive"}],
                "framework": "ccmv4",
                "coverage_pct": 56,
            }, indent=2))
            (out_dir / "controls-catalog.md").write_text("# Controls Catalog\n\n- CTRL-ORG-PRV-001 — preventive\n- CTRL-ORG-DET-001 — detective\n")
            (out_dir / "framework-mapping.md").write_text("# Framework Mapping (CCMv4)\n\n71 mapped / 126 N/A out of 197 objectives.\n")
        elif phase_key == "generate":
            (out_dir / "preventive").mkdir(exist_ok=True)
            (out_dir / "preventive" / "CTRL-ORG-PRV-001.json").write_text(json.dumps({
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Deny", "Action": [f"{service}:Delete*"], "Resource": "*"}],
            }, indent=2))
            (out_dir / "proactive").mkdir(exist_ok=True)
            (out_dir / "proactive" / "guard.guard").write_text(f'rule no_unencrypted_{service.replace("-", "_")} {{\n  Properties.Encrypted == true\n}}\n')
            (out_dir / "detective").mkdir(exist_ok=True)
            (out_dir / "detective" / "config-rule.json").write_text(json.dumps({"ConfigRuleName": f"{service}-encrypted"}, indent=2))
            (out_dir / "iac").mkdir(exist_ok=True)
            (out_dir / "iac" / "main.tf").write_text(f'# Compliant {service} module\nvariable "name" {{ type = string }}\n')
        elif phase_key == "test":
            (out_dir / "test-results.json").write_text(json.dumps({"mode": "skip", "deployed_resources": []}, indent=2))
        elif phase_key == "summarize":
            (out_dir / "APPROVAL-REPORT.md").write_text(
                f"# Approval Report — {service}\n\n**Verdict:** APPROVED\n\n## Coverage\n- Framework: CCMv4 (56%)\n- Mitigations: 37\n- Controls: 60\n\n## Generated artifacts\nSee `05-generate/` for the full set of preventive, proactive, detective, responsive, and IaC outputs.\n"
            )
            (out_dir / "ARTIFACT-FLOW-MATRIX.md").write_text("# Artifact Flow Matrix\n\nSee README for the full per-artifact dependency table.\n")
        elif phase_key == "evidence":
            (out_dir / "attestation-report.md").write_text(f"# Attestation Report — {service}\n\nAll mapped controls verified via runtime CLI probes.\n")
            (out_dir / "attestation-results.json").write_text(json.dumps({"controls_verified": 60}, indent=2))
