"""Shared path constants for the app factory.

Both `builder.py` (the orchestrator runner) and `hooks.py` / `prompts/*.py`
(the pure-function modules split out of builder.py) import from here so
they don't have to reach back into the top-level builder module for
paths — which would create circular imports.
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FSI_FOUNDRY = REPO_ROOT / "applications" / "fsi_foundry"
FOUNDATIONS_SRC = FSI_FOUNDRY / "foundations" / "src"
REFERENCE_USE_CASE = "customer_service"
UI_TEMPLATE = Path(__file__).resolve().parent / "ui-template"
