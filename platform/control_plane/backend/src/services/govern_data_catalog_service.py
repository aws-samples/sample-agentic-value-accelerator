"""Govern Data Catalog service — AWS Glue Data Catalog integration.

Pulls databases, tables, and data quality results from AWS Glue to provide:
- Data domains (databases) with table counts
- Data quality rule results
- Table classifications and sensitivity labels

Returns graceful fallbacks when Glue is not configured or accessible.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_CATALOG_TTL = 300  # 5 min cache


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


class GovernDataCatalogService:
    """Service for AWS Glue Data Catalog integration."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def get_catalog_summary(self) -> DataCatalogResponse:
        """Get summary of Glue Data Catalog - databases, tables, quality."""
        cache_key = f"govern_data_catalog:{self.region}"
        return get_or_load(cache_key, self._fetch_catalog, ttl=_CATALOG_TTL)

    def _fetch_catalog(self) -> DataCatalogResponse:
        """Fetch data from Glue Data Catalog."""
        try:
            glue = boto3.client("glue", region_name=self.region)

            # Get databases
            domains = []
            total_tables = 0
            paginator = glue.get_paginator("get_databases")

            for page in paginator.paginate(MaxResults=100):
                for db in page.get("DatabaseList", []):
                    db_name = db.get("Name", "")
                    description = db.get("Description", "") or f"Database: {db_name}"
                    location = db.get("LocationUri")

                    # Count tables in this database
                    try:
                        tables_resp = glue.get_tables(
                            DatabaseName=db_name,
                            MaxResults=100
                        )
                        table_count = len(tables_resp.get("TableList", []))
                        total_tables += table_count

                        # Get classification from first table if available
                        classification = None
                        for tbl in tables_resp.get("TableList", [])[:1]:
                            params = tbl.get("Parameters", {})
                            classification = params.get("classification") or params.get("data_classification")
                    except (ClientError, BotoCoreError):
                        table_count = 0
                        classification = None

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
            quality_rules = self._fetch_quality_rules(glue)

            return DataCatalogResponse(
                live=True,
                source="glue-catalog",
                note=f"{len(domains)} databases, {total_tables} tables",
                domains=domains,
                quality_rules=quality_rules,
                total_databases=len(domains),
                total_tables=total_tables,
                total_quality_rules=len(quality_rules),
                quality_rules_passing=sum(1 for r in quality_rules if r.status == "pass"),
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

    def _fetch_quality_rules(self, glue) -> list[QualityRule]:
        """Fetch data quality rule results from Glue."""
        rules = []
        try:
            # List data quality rulesets
            rulesets_resp = glue.list_data_quality_rulesets(MaxResults=50)
            for ruleset in rulesets_resp.get("Rulesets", []):
                ruleset_name = ruleset.get("Name", "")
                target = ruleset.get("TargetTable", {})
                dataset = f"{target.get('DatabaseName', '')}.{target.get('TableName', '')}"

                # Get latest run results
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

        return rules

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
