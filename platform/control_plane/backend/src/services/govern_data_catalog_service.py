"""Govern Data Catalog service — AWS Glue Data Catalog integration.

Pulls databases, tables, and data quality results from AWS Glue to provide:
- Data domains (databases) with table counts
- Data quality rule results
- Table classifications and sensitivity labels

Returns graceful fallbacks when Glue is not configured or accessible.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.aws_paging import PageResult, paginate_bounded, paginate_bounded_manual
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_CATALOG_TTL = 300  # 5 min cache

# Per-request page sizes at each API's real maximum, verified against the botocore 1.43.10
# service models.
_TABLE_PAGE = 100     # glue:GetTables MaxResults max (the old call sat here already, but
                      # with no paging, so a database with 150 tables reported 100)
_DATABASE_PAGE = 100  # glue:GetDatabases MaxResults max
_RULESET_PAGE = 1000  # glue:ListDataQualityRulesets MaxResults max (old value was 50)

# Bounds on a single catalog load. A dashboard panel does not justify an unbounded walk of
# every table in a large lake, and reaching a bound is disclosed in `note` rather than
# silently turning a total into a floor.
_MAX_DATABASES = 500
_MAX_TABLES_PER_DB = 5000
_MAX_RULESETS = 2000
_CATALOG_BUDGET_S = 20.0
_TABLE_BUDGET_S = 5.0


@dataclass
class DataDomain:
    """A data domain from Glue (database)."""
    name: str
    description: str
    table_count: int
    location: Optional[str] = None
    classification: Optional[str] = None
    quality_score: Optional[float] = None


@dataclass
class QualityRule:
    """A data quality rule result from Glue."""
    rule_name: str
    dataset: str
    status: str  # 'pass' | 'fail'
    dimension: str  # completeness, uniqueness, validity, etc.
    score: Optional[float] = None
    last_run: Optional[str] = None


@dataclass
class DataCatalogResponse:
    """Response from the data catalog service."""
    live: bool
    source: str
    note: Optional[str] = None
    domains: list[DataDomain] = field(default_factory=list)
    quality_rules: list[QualityRule] = field(default_factory=list)
    total_databases: int = 0
    total_tables: int = 0
    total_quality_rules: int = 0
    quality_rules_passing: int = 0
    setup_guidance: Optional[dict] = None
    # True only when every walk reached the end of its list, so the counts above are exact.
    # False means at least one is a FLOOR, and `note` says which.
    complete: bool = True
    # At least one read failed, so a count is short by an unknown amount. Separate from
    # `live` because a partial answer is still worth showing; it just must not be cached, or
    # the undercount is served for the whole TTL after Glue recovers.
    degraded: bool = False


class GovernDataCatalogService:
    """Service for AWS Glue Data Catalog integration."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def get_catalog_summary(self) -> DataCatalogResponse:
        """Get summary of Glue Data Catalog - databases, tables, quality."""
        cache_key = f"govern_data_catalog:{self.region}"
        # should_cache is load-bearing. get_or_load's default caches WHATEVER the loader
        # returns, so one AccessDenied / BotoCoreError degrade was stored for the whole
        # TTL: the panel kept serving setup guidance under a Mock badge for 5 minutes
        # after Glue recovered, and no request could refresh it. A silent failure, because
        # the degraded response is a valid object and nothing raised.
        # Only a measured response is cached; a degrade is still returned to the caller
        # and re-probed on the next call.
        #
        # `not r.degraded` extends that to a PARTIAL measurement. A per-database GetTables
        # that fails contributes 0 to total_tables, which is indistinguishable from an empty
        # database by any truthiness test - so without this the panel would serve a known
        # undercount as a live total for the full 5 minutes. A genuine zero still caches,
        # because a reachable Glue with no tables IS live data.
        result, _ = get_or_load(
            cache_key, _CATALOG_TTL, self._fetch_catalog,
            should_cache=lambda r: r.live and not r.degraded,
        )
        return result

    def _fetch_catalog(self) -> DataCatalogResponse:
        """Fetch data from Glue Data Catalog.

        `get_tables` used to be a single `MaxResults=100` call - sitting exactly ON the API
        maximum, which is what made it look deliberate - whose length became both
        `table_count` for that database and a term in `total_tables`. A database with 150
        tables therefore reported 100, in a string ("N databases, N tables") rendered as a
        measurement. It is now paged to completion per database, and any database that hits
        a bound is named in `note` so the total is not read as exact.
        """
        try:
            glue = boto3.client("glue", region_name=self.region)

            db_read = paginate_bounded(
                glue, "get_databases", "DatabaseList",
                page_size=_DATABASE_PAGE,
                max_items=_MAX_DATABASES, budget_s=_CATALOG_BUDGET_S,
            )
            if db_read.failed:
                # A failed listing must NOT fall through to the "no databases found" degrade
                # below: that one claims a measurement ("this account has no databases") from
                # a read that measured nothing.
                return self._degraded_from_error(db_read.error)

            domains = []
            total_tables = 0
            capped_dbs: list[str] = []
            failed_dbs: list[str] = []

            for db in db_read.items:
                db_name = db.get("Name", "")
                description = db.get("Description", "") or f"Database: {db_name}"
                location = db.get("LocationUri")

                table_read = paginate_bounded(
                    glue, "get_tables", "TableList",
                    page_size=_TABLE_PAGE,
                    max_items=_MAX_TABLES_PER_DB, budget_s=_TABLE_BUDGET_S,
                    DatabaseName=db_name,
                )
                table_count = len(table_read.items)
                total_tables += table_count
                if table_read.failed:
                    # A 0 from a failed read is not a measured 0. Recorded so total_tables is
                    # not presented as exact, where the old `except: table_count = 0` made a
                    # broken database look identical to an empty one.
                    failed_dbs.append(db_name)
                elif not table_read.complete:
                    capped_dbs.append(db_name)

                # Classification from the first table, if any. Unchanged in behaviour: it was
                # always a sample rather than a survey, and one page is enough for a sample.
                classification = None
                for tbl in table_read.items[:1]:
                    params = tbl.get("Parameters", {})
                    classification = params.get("classification") or params.get("data_classification")

                domains.append(DataDomain(
                    name=db_name,
                    description=description[:200],
                    table_count=table_count,
                    location=location,
                    classification=classification,
                ))

            if not domains:
                return DataCatalogResponse(
                    live=False,
                    source="glue-catalog",
                    note="No databases found in Glue Data Catalog",
                    setup_guidance=self._get_setup_guidance("no_databases"),
                )

            # Try to get data quality results
            quality_rules, rules_read = self._fetch_quality_rules(glue)

            db_capped = not db_read.complete
            rules_capped = rules_read is not None and not rules_read.complete
            complete = not (db_capped or capped_dbs or failed_dbs or rules_capped)

            parts = [
                f"{'at least ' if db_capped else ''}{len(domains)} databases, "
                f"{'at least ' if (db_capped or capped_dbs or failed_dbs) else ''}"
                f"{total_tables} tables"
            ]
            if db_capped:
                parts.append(f"database listing stopped at the {_MAX_DATABASES}-database bound")
            if capped_dbs:
                parts.append(
                    f"table listing stopped at a bound for {len(capped_dbs)} database(s): "
                    f"{', '.join(capped_dbs[:5])}"
                )
            if failed_dbs:
                parts.append(
                    f"table listing failed for {len(failed_dbs)} database(s): "
                    f"{', '.join(failed_dbs[:5])}; the table total is an undercount"
                )
            if rules_capped:
                parts.append("data quality ruleset listing stopped at a bound")

            return DataCatalogResponse(
                live=True,
                source="glue-catalog",
                note="; ".join(parts),
                domains=domains,
                quality_rules=quality_rules,
                total_databases=len(domains),
                total_tables=total_tables,
                total_quality_rules=len(quality_rules),
                quality_rules_passing=sum(1 for r in quality_rules if r.status == "pass"),
                complete=complete,
                degraded=bool(failed_dbs) or (rules_read is not None and rules_read.failed),
            )

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("AccessDeniedException", "UnauthorizedAccess"):
                return DataCatalogResponse(
                    live=False,
                    source="glue-catalog",
                    note="Access denied to Glue Data Catalog",
                    setup_guidance=self._get_setup_guidance("access_denied"),
                )
            logger.warning("Glue Data Catalog error: %s", e)
            return DataCatalogResponse(
                live=False,
                source="glue-catalog",
                note=f"Glue error: {error_code}",
                setup_guidance=self._get_setup_guidance("error"),
            )
        except BotoCoreError as e:
            logger.warning("Glue Data Catalog unavailable: %s", e)
            return DataCatalogResponse(
                live=False,
                source="glue-catalog",
                note="Glue Data Catalog unavailable",
                setup_guidance=self._get_setup_guidance("unavailable"),
            )

    def _degraded_from_error(self, error: Optional[str]) -> DataCatalogResponse:
        """Build the degrade for a database listing that failed rather than came back empty.

        `paginate_bounded` reports an AWS failure as `failed=True` instead of raising, so the
        reason has to be read back off the message. botocore builds every ClientError string
        from a fixed template - "An error occurred (Code) when calling the Op operation: msg" -
        so the parenthesised code is reliable; a BotoCoreError has no such code and falls
        through to the unavailable branch, which is the same split the raising path used.

        Only the code is surfaced, never the full message: it can carry ARNs and account ids.
        """
        text = error or ""
        code_match = re.search(r"\(([A-Za-z][A-Za-z0-9]*)\)", text)
        error_code = code_match.group(1) if code_match else ""

        if error_code in ("AccessDeniedException", "UnauthorizedAccess", "AccessDenied"):
            return DataCatalogResponse(
                live=False,
                source="glue-catalog",
                note="Access denied to Glue Data Catalog",
                setup_guidance=self._get_setup_guidance("access_denied"),
                degraded=True,
            )
        if not error_code:
            logger.warning("Glue Data Catalog unavailable: %s", text)
            return DataCatalogResponse(
                live=False,
                source="glue-catalog",
                note="Glue Data Catalog unavailable",
                setup_guidance=self._get_setup_guidance("unavailable"),
                degraded=True,
            )
        logger.warning("Glue Data Catalog error: %s", text)
        return DataCatalogResponse(
            live=False,
            source="glue-catalog",
            note=f"Glue error: {error_code}",
            setup_guidance=self._get_setup_guidance("error"),
            degraded=True,
        )

    def _fetch_quality_rules(self, glue) -> tuple[list[QualityRule], Optional[PageResult]]:
        """Fetch data quality rule results from Glue.

        Returns (rules, ruleset_read). `ruleset_read` lets the caller say whether
        total_quality_rules is a total or a floor; it is None only if the walk never ran.

        The ruleset listing needs `paginate_bounded_manual`, not `paginate_bounded`:
        `glue:ListDataQualityRulesets` answers `can_paginate() is False` on botocore 1.43.10
        even though its response shape carries NextToken, so botocore has no paginator to
        borrow. The old call asked for MaxResults=50 against an API maximum of 1000 and read
        one page.
        """
        rules: list[QualityRule] = []
        rulesets_read = paginate_bounded_manual(
            glue, "list_data_quality_rulesets", "Rulesets",
            max_items=_MAX_RULESETS, budget_s=_CATALOG_BUDGET_S,
            MaxResults=_RULESET_PAGE,
        )
        if rulesets_read.failed:
            # Access denial on data quality is expected on most accounts and was already
            # non-fatal here, so it stays non-fatal: the catalog itself is still live.
            logger.debug("Data quality rules not available: %s", rulesets_read.error)
            return rules, rulesets_read

        try:
            for ruleset in rulesets_read.items:
                ruleset_name = ruleset.get("Name", "")
                target = ruleset.get("TargetTable", {})
                dataset = f"{target.get('DatabaseName', '')}.{target.get('TableName', '')}"

                # Get latest run results. MaxResults=1 is correct here and deliberately left
                # alone: this wants the most recent run for the ruleset, not a count of runs,
                # so one item IS the whole answer and paging would read history nobody uses.
                try:
                    runs_resp = glue.list_data_quality_ruleset_evaluation_runs(
                        Filter={"RulesetName": ruleset_name},
                        MaxResults=1
                    )
                    for run in runs_resp.get("Runs", [])[:1]:
                        run_id = run.get("RunId")
                        if run_id:
                            result = glue.get_data_quality_ruleset_evaluation_run(RunId=run_id)
                            score = result.get("Score", 0)
                            status = "pass" if score >= 0.8 else "fail"
                            rules.append(QualityRule(
                                rule_name=ruleset_name,
                                dataset=dataset,
                                status=status,
                                dimension="overall",
                                score=score,
                                last_run=str(run.get("StartedOn", "")),
                            ))
                except (ClientError, BotoCoreError):
                    pass

        except ClientError as e:
            if "AccessDeniedException" not in str(e):
                logger.debug("Data quality rules not available: %s", e)
        except BotoCoreError:
            pass

        return rules, rulesets_read

    def _get_setup_guidance(self, reason: str) -> dict:
        """Return setup guidance based on the failure reason."""
        base = {
            "service": "AWS Glue Data Catalog",
            "docs_url": "https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html",
        }

        if reason == "no_databases":
            return {
                **base,
                "title": "No Data Catalog databases found",
                "steps": [
                    "Create a Glue database: aws glue create-database --database-input '{\"Name\": \"my_data_domain\"}'",
                    "Run a Glue Crawler to discover tables from S3, RDS, or other sources",
                    "Or manually create tables pointing to your data locations",
                ],
                "cli_command": "aws glue create-database --database-input '{\"Name\": \"ai_training_data\", \"Description\": \"Data for AI/ML workloads\"}'",
            }
        elif reason == "access_denied":
            return {
                **base,
                "title": "IAM permissions required for Glue",
                "steps": [
                    "Add glue:GetDatabases permission to your IAM role",
                    "Add glue:GetTables permission",
                    "Add glue:ListDataQualityRulesets for quality monitoring",
                ],
                "iam_policy": {
                    "Effect": "Allow",
                    "Action": [
                        "glue:GetDatabases",
                        "glue:GetTables",
                        "glue:GetDataCatalogEncryptionSettings",
                        "glue:ListDataQualityRulesets",
                        "glue:GetDataQualityRuleset",
                        "glue:ListDataQualityRulesetEvaluationRuns",
                        "glue:GetDataQualityRulesetEvaluationRun"
                    ],
                    "Resource": "*"
                },
            }
        else:
            return {
                **base,
                "title": "Enable AWS Glue Data Catalog",
                "steps": [
                    "Ensure AWS Glue is available in your region",
                    "Check network connectivity to Glue endpoints",
                    "Verify IAM permissions for Glue access",
                ],
            }
