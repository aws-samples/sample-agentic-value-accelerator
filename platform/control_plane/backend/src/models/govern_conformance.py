"""Govern Conformance — ISO/IEC 42001 AI Management System (AIMS) conformance record.

Persists the "show me your AI management system" artifact that regulated buyers
and ISO 42001 auditors ask for: the set of AIMS clause controls (Cl. 4-10 +
Annex A), each with a conformance status, evidence pointer, and owner. Unlike the
append-only audit log, this is an editable CRUD record — control statuses and
evidence get updated as the organization matures its AIMS.

Mirrors the frontend ComplianceCenter control shape (id / section / label /
status / evidence / owner / dueDate) so it is a drop-in for that surface, and
follows the operating_model CRUD pattern for the vertical slice.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ConformanceStatus(str, Enum):
    PASS = "pass"
    IN_PROGRESS = "in-progress"
    FAIL = "fail"
    NOT_STARTED = "not-started"
    NOT_APPLICABLE = "not-applicable"


class ClauseControl(BaseModel):
    id: str = Field(..., description="e.g. ISO-4.1")
    section: str = Field(..., description="e.g. Cl. 4.1")
    label: str
    status: ConformanceStatus = ConformanceStatus.NOT_STARTED
    evidence: Optional[str] = Field(default="", max_length=1000)
    owner: Optional[str] = Field(default="", max_length=240)
    due_date: Optional[str] = Field(default=None, description="ISO date; when in-progress/planned")


class ConformanceCategory(BaseModel):
    name: str = Field(..., description="e.g. 'Clause 6: Planning'")
    controls: List[ClauseControl] = Field(default_factory=list)


class ConformanceRecordBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    standard: str = Field(default="ISO/IEC 42001:2023", max_length=120)
    organization: Optional[str] = Field(default="", max_length=200)
    next_audit: Optional[str] = Field(default=None)


class ConformanceRecordCreate(ConformanceRecordBase):
    categories: Optional[List[ConformanceCategory]] = None


class ConformanceRecordUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    organization: Optional[str] = Field(default=None, max_length=200)
    next_audit: Optional[str] = None
    categories: Optional[List[ConformanceCategory]] = None


class ConformanceComputed(BaseModel):
    total_controls: int = 0
    passed: int = 0
    in_progress: int = 0
    failed: int = 0
    not_started: int = 0
    not_applicable: int = 0
    # Conformance % = passed / (applicable controls), rounded.
    conformance_pct: int = 0


class ConformanceRecord(ConformanceRecordBase):
    conformance_id: str = Field(default_factory=lambda: f"cf-{uuid.uuid4().hex[:10]}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    categories: List[ConformanceCategory] = Field(default_factory=list)
    computed: Optional[ConformanceComputed] = None


def compute(record: ConformanceRecord) -> ConformanceComputed:
    """Roll up control statuses. Conformance % excludes not-applicable controls."""
    counts = {s: 0 for s in ConformanceStatus}
    total = 0
    for cat in record.categories:
        for c in cat.controls:
            counts[c.status] += 1
            total += 1
    applicable = total - counts[ConformanceStatus.NOT_APPLICABLE]
    pct = round(counts[ConformanceStatus.PASS] / applicable * 100) if applicable else 0
    return ConformanceComputed(
        total_controls=total,
        passed=counts[ConformanceStatus.PASS],
        in_progress=counts[ConformanceStatus.IN_PROGRESS],
        failed=counts[ConformanceStatus.FAIL],
        not_started=counts[ConformanceStatus.NOT_STARTED],
        not_applicable=counts[ConformanceStatus.NOT_APPLICABLE],
        conformance_pct=pct,
    )
