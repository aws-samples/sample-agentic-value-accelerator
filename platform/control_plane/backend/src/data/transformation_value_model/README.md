# Transformation Value Model — Reference Catalog

A relational, versioned reference catalog surfaced in the Control Plane's
**Use Cases** area (`/use-cases`), unified with the existing prioritization
scorecard. Runs entirely locally on the backend's SQLAlchemy + SQLite store —
no AWS dependency.

## What's here

- `seed.json` — the committed reference dataset (nine entity types + their
  relationships), consumed by the seed importer at startup. **Generated; do not
  hand-edit.** Regenerate it from the source SQLite (see below).

## Architecture

```
backend/src/
  models/catalog_orm.py                          # SQLAlchemy tables (9 entities + 6 junctions + version history)
  models/transformation_value_model.py           # Pydantic models + ENTITY_REGISTRY (drives the generic service)
  services/transformation_value_model_service.py # CatalogService: CRUD, search/filter, relationships, versioning
  services/score_preseed.py                       # pure deterministic catalog-evidence -> prioritization scores
  services/seed_importer.py                       # idempotent startup seed load
  api/routes/transformation_value_model.py        # /api/v1/catalog/* generic-resource API
  scripts/generate_transformation_seed.py         # SQLite -> seed.json generator
  data/transformation_value_model/seed.json       # this dir — committed seed

frontend/src/components/transformation_value_model/   # Catalog UI (list/detail/traceability/drawer/history)
frontend/src/components/UseCasesHub.tsx               # /use-cases hub: Catalog + Prioritize tabs
```

The nine entity types (plural API slugs): `industries`, `industry-segments`,
`business-domains`, `value-levers`, `kpis`, `solutions`, `use-cases`,
`data-assets`, `technology-components`.

## Regenerating the seed

The seed is generated from a source `transformation_domain_model` v2.0.0 SQLite
file. That `.sqlite` is **git-ignored** (see repo `.gitignore`) — only the
generated `seed.json` is committed, so the runtime never needs the source DB.

```bash
cd platform/control_plane/backend
# Default source: <repo>/temp/transformation_model_financial_services_seeded.sqlite
PYTHONPATH=src python -m scripts.generate_transformation_seed

# Or point at a specific source / output:
PYTHONPATH=src python -m scripts.generate_transformation_seed /path/to/model.sqlite \
    --out src/data/transformation_value_model/seed.json
```

The generator is deterministic (stable-sorted by source id), so regenerating
against the same DB produces a byte-identical `seed.json`.

### Promotion policy

The seeded source only populated the account-specific side of a multi-account
model. The generator **promotes** those rows to account-agnostic reference
entities — keeping their reusable attributes and intra-taxonomy relationships,
dropping account/roadmap foreign keys — and excludes the account, roadmap, pod,
and party container tables entirely.

## Local development

The catalog needs no AWS. Run the backend and the seed imports automatically on
startup (idempotent — safe to restart):

```bash
cd platform/control_plane/backend
PYTHONPATH=src uvicorn main:app --reload    # imports seed.json on startup

# Frontend (separate terminal)
cd platform/control_plane/frontend
npm install && npm run dev                  # http://localhost:5173/use-cases
```

Startup seeding is controlled by `TRANSFORMATION_SEED_ON_STARTUP` (default
`true`) and the seed path by `TRANSFORMATION_SEED_PATH` (auto-resolved, Docker
aware). The frontend follows the app's API-or-localStorage fallback convention,
so the catalog still renders (from `localStorage`) if the API is unreachable.

## Tests

```bash
# Backend (seed integrity, versioning, search/filter, validation, score_preseed)
cd platform/control_plane/backend
PYTHONPATH=src python -m pytest tests/test_transformation_value_model.py

# Frontend (store API-or-localStorage fallback + re-sync)
cd platform/control_plane/frontend
npx vitest --run src/tests/test_catalog_store.test.ts
```
