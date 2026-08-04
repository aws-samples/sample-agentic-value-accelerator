"""Phase 7 Evidence tools — CLI synthesis, execution, and attestation rendering.

This package implements the `/evidence` skill's backend logic:

- `synthesize.py` — service-agnostic CLI command synthesis (families F1–F6)
- `execute.py` — command runner with predicate evaluation
- `replay.py` — re-run commands against same stack for independent audit
- `render_report.py` — attestation-report.md writer
- `render_attestation.py` — <slug>/attestation.md writer (reviewer's guide)

All modules consume the canonical path helpers from `tools.paths` and
slug derivation from `tools.slug`. No hardcoded service-specific logic —
everything dispatches on (mechanism, category, scope) or CFN resource type.
"""
