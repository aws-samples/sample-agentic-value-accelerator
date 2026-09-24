"""Govern Data Catalog API — Glue Data Catalog and Macie integration.

Provides endpoints for:
- Data domains (Glue databases)
- Data quality rules (Glue Data Quality)
- Data sensitivity classification (Macie)

Each endpoint returns live data if available, or setup guidance if not.
"""

from fastapi import APIRouter, Depends
import logging

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_data_catalog_service import GovernDataCatalogService
from services.govern_data_sensitivity_service import GovernDataSensitivityService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/govern/data-catalog", tags=["govern-data-catalog"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
# SINGLE_REGION is the accurate claim: both backing services are regional (Glue Data
# Catalog, Macie), neither is account-wide, neither reads AVA's own state, and nothing
# here fans out with run_over_regions - so databases, tables, rulesets and bucket
# classifications in other governed regions are genuinely not counted.
REGION_SCOPE = region_scope.declare("govern_data_catalog", region_scope.SINGLE_REGION, prefix="/govern/data-catalog")


def _governed_region() -> str:
    """Region these Glue and Macie reads target: the governed fleet, not the control plane.

    Tier 2, not tier 1 (see core/region_config.py). Every handler here used to build its
    clients with settings.AWS_REGION, which is where AVA's own DynamoDB tables live. When
    the control plane and the governed fleet sit in different regions the call still
    succeeds and returns the CONTROL-PLANE region's catalog - populated, plausible, and
    about the wrong estate, with no error to notice. Verified on the running stack:
    AWS_REGION=us-east-2 and GOVERN_AWS_REGION=us-east-1 hold different Glue databases,
    and this surface was reporting the us-east-2 one.

    It also made the SINGLE_REGION declaration above a false statement, since that scope
    is defined as "reads GOVERN_AWS_REGION only". Matches govern_macie.py, which reads
    the same Macie service from the governed region.
    """
    return settings.GOVERN_AWS_REGION


@router.get("/summary")
def get_data_catalog_summary(_=Depends(require_role(Role.VIEWER))):
    """Get unified data catalog summary.

    Returns:
    - Data domains from Glue Data Catalog
    - Data quality rules from Glue Data Quality
    - Sensitivity classification from Macie

    If a service is not enabled, returns setup guidance instead.
    """
    region = _governed_region()

    # Fetch from both services in parallel would be better, but sequential is fine
    catalog_svc = GovernDataCatalogService(region)
    sensitivity_svc = GovernDataSensitivityService(region)

    catalog = catalog_svc.get_catalog_summary()
    sensitivity = sensitivity_svc.get_sensitivity_summary()

    return {
        "catalog": {
            "live": catalog.live,
            "source": catalog.source,
            "note": catalog.note,
            "domains": [
                {
                    "name": d.name,
                    "description": d.description,
                    "table_count": d.table_count,
                    "location": d.location,
                    "classification": d.classification,
                    "quality_score": d.quality_score,
                }
                for d in catalog.domains
            ],
            "quality_rules": [
                {
                    "rule_name": r.rule_name,
                    "dataset": r.dataset,
                    "status": r.status,
                    "dimension": r.dimension,
                    "score": r.score,
                    "last_run": r.last_run,
                }
                for r in catalog.quality_rules
            ],
            "total_databases": catalog.total_databases,
            "total_tables": catalog.total_tables,
            "total_quality_rules": catalog.total_quality_rules,
            "quality_rules_passing": catalog.quality_rules_passing,
            "setup_guidance": catalog.setup_guidance,
        },
        "sensitivity": {
            "live": sensitivity.live,
            "source": sensitivity.source,
            "note": sensitivity.note,
            "buckets_analyzed": sensitivity.buckets_analyzed,
            "buckets_with_sensitive": sensitivity.buckets_with_sensitive,
            "sensitivity_breakdown": [
                {
                    "category": b.category,
                    "count": b.count,
                    "color": b.color,
                    "examples": b.examples,
                }
                for b in sensitivity.sensitivity_breakdown
            ],
            "bucket_classifications": [
                {
                    "bucket_name": b.bucket_name,
                    "sensitivity": b.sensitivity,
                    "object_count": b.object_count,
                    "sensitive_objects": b.sensitive_objects,
                    "top_detections": b.top_detections,
                }
                for b in sensitivity.bucket_classifications
            ],
            "top_sensitive_types": sensitivity.top_sensitive_types,
            "setup_guidance": sensitivity.setup_guidance,
        },
    }


@router.get("/domains")
def get_data_domains(_=Depends(require_role(Role.VIEWER))):
    """Get data domains from Glue Data Catalog."""
    region = _governed_region()
    svc = GovernDataCatalogService(region)
    catalog = svc.get_catalog_summary()

    return {
        "live": catalog.live,
        "source": catalog.source,
        "note": catalog.note,
        "domains": [
            {
                "name": d.name,
                "description": d.description,
                "table_count": d.table_count,
                "location": d.location,
                "classification": d.classification,
            }
            for d in catalog.domains
        ],
        "total_databases": catalog.total_databases,
        "total_tables": catalog.total_tables,
        "setup_guidance": catalog.setup_guidance,
    }


@router.get("/quality")
def get_data_quality(_=Depends(require_role(Role.VIEWER))):
    """Get data quality rules from Glue Data Quality."""
    region = _governed_region()
    svc = GovernDataCatalogService(region)
    catalog = svc.get_catalog_summary()

    return {
        "live": catalog.live and len(catalog.quality_rules) > 0,
        "source": "glue-data-quality",
        "note": f"{len(catalog.quality_rules)} rules" if catalog.quality_rules else "No data quality rules configured",
        "rules": [
            {
                "rule_name": r.rule_name,
                "dataset": r.dataset,
                "status": r.status,
                "dimension": r.dimension,
                "score": r.score,
                "last_run": r.last_run,
            }
            for r in catalog.quality_rules
        ],
        "total_rules": catalog.total_quality_rules,
        "passing": catalog.quality_rules_passing,
        "pass_rate": (catalog.quality_rules_passing / catalog.total_quality_rules * 100)
            if catalog.total_quality_rules > 0 else None,
        "setup_guidance": {
            "service": "AWS Glue Data Quality",
            "docs_url": "https://docs.aws.amazon.com/glue/latest/dg/data-quality.html",
            "title": "Enable Glue Data Quality",
            "steps": [
                "Create a data quality ruleset in Glue Studio",
                "Define rules like: ColumnValues 'age' >= 0",
                "Schedule evaluation runs on your tables",
            ],
        } if not catalog.quality_rules else None,
    }


@router.get("/sensitivity")
def get_data_sensitivity(_=Depends(require_role(Role.VIEWER))):
    """Get data sensitivity classification from Macie."""
    region = _governed_region()
    svc = GovernDataSensitivityService(region)
    sensitivity = svc.get_sensitivity_summary()

    return {
        "live": sensitivity.live,
        "source": sensitivity.source,
        "note": sensitivity.note,
        "buckets_analyzed": sensitivity.buckets_analyzed,
        "buckets_with_sensitive": sensitivity.buckets_with_sensitive,
        "breakdown": [
            {
                "category": b.category,
                "count": b.count,
                "color": b.color,
                "examples": b.examples,
            }
            for b in sensitivity.sensitivity_breakdown
        ],
        "bucket_details": [
            {
                "bucket_name": b.bucket_name,
                "sensitivity": b.sensitivity,
                "sensitive_objects": b.sensitive_objects,
                "top_detections": b.top_detections,
            }
            for b in sensitivity.bucket_classifications
        ],
        "top_types": sensitivity.top_sensitive_types,
        "setup_guidance": sensitivity.setup_guidance,
    }
