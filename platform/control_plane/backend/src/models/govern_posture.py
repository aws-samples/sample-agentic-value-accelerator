"""Govern Posture — real AWS security/compliance posture, read-through.

Currently: AWS Config rule compliance (config:DescribeComplianceByConfigRule),
which powers the "Config rules passing" signal on the Compliance surface.
Honest live/source/note flags, graceful live=False fallback.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


from typing import List


class ConfigCompliance(BaseModel):
    """AWS Config rule compliance summary (config:DescribeComplianceByConfigRule)."""

    compliant: int = Field(0, description="Rules evaluating COMPLIANT")
    non_compliant: int = Field(0, description="Rules evaluating NON_COMPLIANT")
    insufficient_data: int = Field(0, description="Rules with INSUFFICIENT_DATA")
    total_rules: int = Field(0, description="Config rules evaluated (compliant + non_compliant)")
    pct_compliant: float = Field(0.0, description="compliant / (compliant + non_compliant) * 100")
    live: bool
    source: str
    note: Optional[str] = None


class FailingRule(BaseModel):
    """One non-compliant AWS Config rule + a sample of its failing resources."""

    rule_name: str
    description: Optional[str] = None
    managed_rule: Optional[str] = Field(default=None, description="Source.SourceIdentifier, e.g. ACCESS_KEYS_ROTATED")
    failing_resource_count: int = Field(0, description="Sampled failing resources (may be capped)")
    resource_types: List[str] = Field(default_factory=list, description="Distinct failing resource types")
    last_evaluated: Optional[str] = None


class ConfigRuleDetail(BaseModel):
    """Which specific AWS Config rules are non-compliant + their failing resources."""

    failing_rules: List[FailingRule] = Field(default_factory=list)
    total_failing: int = 0
    live: bool
    source: str
    note: Optional[str] = None
