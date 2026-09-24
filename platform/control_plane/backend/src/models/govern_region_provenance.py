"""Per-region provenance — which regions a multi-region response actually covers.

A response aggregated over the governed-region set can be built from all of those
regions, some of them, or one. Without saying which, every one of those looks
identical to a reader: a number. That is the same failure the data-source probes
exist to fix, one level up - a fleet count of 38 aggregated from one reachable
region out of three reads exactly like a complete fleet of 38.

Any route that fans out with core.multiregion.run_over_regions should attach this
block, and any UI that renders a count sourced from it should say so when
`unreachable` is non-empty. Absence of the block means the response is
single-region by construction; it does not mean "all regions succeeded".
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RegionProvenance(BaseModel):
    """Which governed regions were queried, and which of them answered."""

    queried: List[str] = Field(
        default_factory=list,
        description="Governed regions this response fanned out to, in order",
    )
    reachable: List[str] = Field(
        default_factory=list,
        description="Regions that returned a result",
    )
    unreachable: List[str] = Field(
        default_factory=list,
        description=(
            "Regions that raised or timed out. Their resources are absent from the "
            "aggregate, so any total here is a floor, not a count."
        ),
    )
    degraded: List[str] = Field(
        default_factory=list,
        description=(
            "Regions that answered but with live=False - the service is not enabled "
            "there, or the role lacks the read. A SUBSET of `reachable`: they responded, "
            "so they are not unreachable, but they contributed no measured data. Without "
            "this an aggregate over three regions where two are dark reads as complete."
        ),
    )

    @property
    def complete(self) -> bool:
        """True when every queried region answered with live data.

        Both failure modes disqualify: a region that raised, and a region that
        answered with a non-live fallback. Either way its resources are missing from
        the aggregate, which is the only thing a caller reading this cares about.
        """
        return bool(self.queried) and not self.unreachable and not self.degraded

    def summary(self) -> Optional[str]:
        """One-line note, or None when there is nothing worth saying.

        Returns None for the ordinary all-live single-region case so callers do not
        decorate every response with "1 of 1 regions".
        """
        total = len(self.queried)
        if total == 0:
            return None
        if total == 1 and self.complete:
            return None

        parts: List[str] = []
        if self.unreachable:
            parts.append(
                f"{len(self.reachable)} of {total} governed regions reachable; "
                f"totals exclude {', '.join(self.unreachable)}"
            )
        if self.degraded:
            parts.append(f"no live data from {', '.join(self.degraded)}")
        if parts:
            return "; ".join(parts)
        return f"aggregated across {total} governed regions"
