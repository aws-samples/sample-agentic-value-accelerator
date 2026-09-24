"""Evaluation persistence — suites and runs.

DynamoDB when the table is reachable (fsi-control-plane-evaluations,
SUITE#/RUN# key pattern like the other module tables); transparent
in-memory fallback otherwise so local dev needs no infrastructure.
The fallback is process-lifetime only and logs loudly.
"""

import logging
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.config import settings

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _to_ddb(value):
    """DynamoDB rejects Python floats — deep-convert to Decimal on write."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    return value


class EvaluationStore:
    def __init__(self, region: Optional[str] = None, table_name: Optional[str] = None):
        self.region = region or settings.AWS_REGION
        self.table_name = table_name or getattr(settings, "EVALUATIONS_TABLE_NAME", "fsi-control-plane-evaluations")
        self._lock = threading.Lock()
        self._mem: Dict[str, dict] = {}
        self._table = None
        self._ddb_ok: Optional[bool] = None
        # Scan results cached briefly (invalidated on every write): list pages
        # re-scan the whole table otherwise, which is the main reason the UI
        # feels slow. Point reads (_get) stay uncached — they must be fresh
        # for live-run polling.
        self._scan_cache: Dict[str, tuple] = {}
        self._scan_ttl = 10.0

    def _ddb(self):
        """Return a CACHED Table, rebuilding the session only when needed.

        A fresh boto3 Session per call re-reads refreshed credentials but pays
        a new TLS handshake every time (~1s) — far too slow for list pages.
        Instead we cache the resource and reuse its connection pool; on a
        credential failure the caller invalidates it (self._table = None) so
        the next call rebuilds against freshly minted credentials. Best of
        both: connection reuse in the steady state, refresh survival on error."""
        if self._table is None:
            try:
                table = boto3.session.Session().resource("dynamodb", region_name=self.region).Table(self.table_name)
                table.load()
                self._table = table
                self._ddb_ok = True
                logger.info("evaluation store using DynamoDB table %s", self.table_name)
            except (ClientError, BotoCoreError, Exception) as exc:
                self._ddb_ok = False
                logger.warning("evaluation store falling back to in-memory (table %s unavailable: %s)", self.table_name, exc)
                return None
        return self._table

    def _invalidate_connection(self) -> None:
        """Drop the cached connection so the next call rebuilds it — used when
        a call fails on likely-expired credentials."""
        self._table = None

    # -- generic put/get on pk ------------------------------------------------
    def _put(self, pk: str, item: dict) -> None:
        table = self._ddb()
        record = {"pk": pk, "updatedAt": _now(), **item}
        with self._lock:
            self._scan_cache.clear()  # writes must be visible to list pages
        if table is not None:
            try:
                table.put_item(Item=_to_ddb(record))
                # Evict any stale fallback copy: without this, one transient
                # write failure would pin an old snapshot forever (memory-first
                # reads would shadow every later successful DDB write).
                with self._lock:
                    self._mem.pop(pk, None)
                return
            except (ClientError, BotoCoreError) as exc:
                logger.error("ddb put failed for %s, using memory: %s", pk, exc)
        with self._lock:
            self._mem[pk] = record

    def _get(self, pk: str) -> Optional[dict]:
        # Memory first: an entry exists only while the LAST write for this pk
        # failed against DDB (successful writes evict it), so it is newer.
        with self._lock:
            if pk in self._mem:
                return self._mem[pk]
        table = self._ddb()
        if table is not None:
            try:
                resp = table.get_item(Key={"pk": pk})
                if "Item" in resp:
                    return resp["Item"]
            except (ClientError, BotoCoreError) as exc:
                logger.error("ddb get failed for %s: %s", pk, exc)
                self._invalidate_connection()  # likely expired creds — rebuild next call
        return None

    def _scan_prefix(self, prefix: str, projection: Optional[str] = None,
                     attr_names: Optional[dict] = None) -> List[dict]:
        cache_key = f"{prefix}|{projection or ''}"
        with self._lock:
            cached = self._scan_cache.get(cache_key)
            if cached and (time.monotonic() - cached[0]) < self._scan_ttl:
                return list(cached[1])
        table = self._ddb()
        by_pk: Dict[str, dict] = {}
        if table is not None:
            try:
                kwargs: dict = {}
                if projection:
                    kwargs["ProjectionExpression"] = projection
                    if attr_names:
                        kwargs["ExpressionAttributeNames"] = attr_names
                while True:  # follow LastEvaluatedKey — scan pages at 1MB
                    resp = table.scan(**kwargs)
                    for i in resp.get("Items", []):
                        if str(i.get("pk", "")).startswith(prefix):
                            by_pk[str(i["pk"])] = i
                    lek = resp.get("LastEvaluatedKey")
                    if not lek:
                        break
                    kwargs["ExclusiveStartKey"] = lek
            except (ClientError, BotoCoreError) as exc:
                logger.error("ddb scan failed: %s", exc)
                self._invalidate_connection()  # likely expired creds — rebuild next call
        with self._lock:
            for k, v in self._mem.items():
                if k.startswith(prefix):
                    by_pk[k] = v  # memory overrides — newer (see _get)
            out = list(by_pk.values())
            self._scan_cache[cache_key] = (time.monotonic(), out)
        return list(out)

    # -- suites ---------------------------------------------------------------
    def save_suite(self, suite: dict) -> None:
        self._put(f"SUITE#{suite['id']}", suite)

    def get_suite(self, suite_id: str) -> Optional[dict]:
        return self._get(f"SUITE#{suite_id}")

    def delete_suite(self, suite_id: str) -> bool:
        """Remove a suite version (failed iterations shouldn't linger — a
        deleted current suite simply promotes the next-newest). Runs keep
        their own copy of name and cases, so history stays readable."""
        pk = f"SUITE#{suite_id}"
        existed = self._get(pk) is not None
        with self._lock:
            self._mem.pop(pk, None)
            self._scan_cache.clear()
        table = self._ddb()
        if table is not None:
            try:
                table.delete_item(Key={"pk": pk})
            except (ClientError, BotoCoreError) as exc:
                logger.error("ddb delete failed for %s: %s", pk, exc)
        return existed

    def delete_run(self, run_id: str) -> bool:
        """Remove a run record — for cleaning up runs that scored garbage
        (e.g. a crashed agent's error output judged before detection existed).
        History is otherwise immutable by design; deletion is an explicit
        operator action, not something the system ever does on its own."""
        pk = f"RUN#{run_id}"
        existed = self._get(pk) is not None
        with self._lock:
            self._mem.pop(pk, None)
            self._scan_cache.clear()
        table = self._ddb()
        if table is not None:
            try:
                table.delete_item(Key={"pk": pk})
            except (ClientError, BotoCoreError) as exc:
                logger.error("ddb delete failed for %s: %s", pk, exc)
        return existed

    def suites_for_deployment(self, deployment_id: str) -> List[dict]:
        suites = [s for s in self._scan_prefix("SUITE#") if s.get("target_deployment_id") == deployment_id]
        # Newest first — scan order is arbitrary, and callers take suites[0]
        # as "the current suite", which must be the latest configuration.
        return sorted(suites, key=lambda s: s.get("createdAt", ""), reverse=True)

    # -- runs -----------------------------------------------------------------
    def save_run(self, run: dict) -> None:
        self._put(f"RUN#{run['id']}", run)

    def get_run(self, run_id: str) -> Optional[dict]:
        return self._get(f"RUN#{run_id}")

    # List pages need summaries, not the multi-hundred-KB case payloads —
    # projecting the scan is what keeps app pages fast. get_run stays full.
    _RUN_SUMMARY_PROJ = ("pk,id,deploymentId,appName,suiteName,startedAt,overallScore,"
                         "hardGatesPassed,hardGatesTotal,evaluatorsPassed,evaluatorsTotal,"
                         "verdict,#st,#er,progressNote")
    _RUN_SUMMARY_NAMES = {"#st": "status", "#er": "error"}

    def runs_for_deployment(self, deployment_id: str) -> List[dict]:
        runs = [r for r in self.all_runs() if r.get("deploymentId") == deployment_id]
        return sorted(runs, key=lambda r: r.get("startedAt", ""), reverse=True)

    def all_runs(self) -> List[dict]:
        runs = self._scan_prefix("RUN#", projection=self._RUN_SUMMARY_PROJ,
                                 attr_names=self._RUN_SUMMARY_NAMES)
        return sorted(runs, key=lambda r: r.get("startedAt", ""), reverse=True)

    # -- pairwise comparisons (cached per run pair) -----------------------------
    def save_pairwise(self, run_id_a: str, run_id_b: str, result: dict) -> None:
        self._put(f"PAIRWISE#{run_id_a}::{run_id_b}", result)

    def get_pairwise(self, run_id_a: str, run_id_b: str) -> Optional[dict]:
        return self._get(f"PAIRWISE#{run_id_a}::{run_id_b}")


_store: Optional[EvaluationStore] = None


def get_store() -> EvaluationStore:
    global _store
    if _store is None:
        _store = EvaluationStore()
    return _store
