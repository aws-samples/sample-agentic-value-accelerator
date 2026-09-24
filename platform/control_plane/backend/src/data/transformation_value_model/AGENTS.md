# Reference Catalog — population contract (for humans and agents)

This document is the single orientation point for populating the Transformation
Value Model reference catalog. If you are an AI agent tasked with seeding,
extending, or resetting the catalog, read this first, then call
`GET /api/v1/catalog/registry` for the live schema.

## What the catalog is

Nine reference entity types, one generic engine. Every type ships with example
data, supports user-authored records, and is versioned identically. The types and
their create-order dependency chain:

```
industries
  └─ industry-segments        (FK: industry_id)
       └─ business-domains     (FK: industry_segment_id, industry_id)
            └─ value-levers     (FK: domain_id)
kpis                            (linked to value-levers via junction)
solutions                       (linked to domains / value-levers / use-cases)
use-cases                       (linked to solutions / data-assets / tech-components)
data-assets                     (linked to use-cases)
technology-components           (linked to use-cases)
```

`GET /api/v1/catalog/registry` returns `dependency_order` (a safe parents-first
sequence), and per type: `fields` (`{name, type, required}`), `required_fields`
(only `name` today), `relationships`, and `suggested_values` (a realistic
vocabulary for free-text fields such as `complexity`, `risk_tier`, `lever_type`,
harvested from the shipped seed). The catalog does not enforce enums — prefer the
suggested values but any string is accepted.

## Provenance: examples vs user data

Every row carries `source_ref`:
- **non-null** → a shipped example (imported as actor `system`).
- **null** → user/agent-created data.

Lifecycle operations key off this split. A persisted latch (`catalog_meta`,
`seed_applied`) means the shipped seed is imported only on first boot; once you
empty or prune the catalog it stays that way across restarts.

## The catalog document (import/export format)

`seed.json`, `POST /import`, and `GET /export` all use the same shape:

```json
{
  "entities": {
    "industry":         [ { "name": "Financial Services", "source_ref": "ind-1", "code": "FSI" } ],
    "industry_segment": [ { "name": "Banking", "source_ref": "seg-1", "industry_id": "ind-1" } ],
    "business_domain":  [ { "name": "Lending", "source_ref": "dom-1",
                            "industry_segment_id": "seg-1", "industry_id": "ind-1" } ],
    "value_lever":      [ { "name": "Faster decisions", "source_ref": "lev-1", "domain_id": "dom-1" } ],
    "solution":         [ { "name": "Credit copilot", "source_ref": "sol-1" } ],
    "use_case":         [ { "name": "Auto-adjudication", "source_ref": "uc-1", "complexity": "Medium" } ]
  },
  "relationships": {
    "solution_value_lever": [ { "solution_id": "sol-1", "value_lever_id": "lev-1" } ],
    "solution_use_case":    [ { "solution_id": "sol-1", "use_case_id": "uc-1" } ]
  }
}
```

Rules:
- Entity keys are **singular slugs**: `industry`, `industry_segment`,
  `business_domain`, `value_lever`, `kpi`, `solution`, `use_case`, `data_asset`,
  `technology_component`.
- Each row needs a `source_ref` (alias: `ref`) — a **local id unique within the
  document**. FK columns and relationship rows reference other rows by that local
  id. The engine resolves them to real generated ids in dependency order, so you
  never thread generated ids yourself.
- A ref that matches no local row is resolved against **existing catalog ids**, so
  a document can link new rows to entities already present.
- Relationship keys are the junction names: `value_lever_kpi`, `solution_domain`,
  `solution_value_lever`, `solution_use_case`, `use_case_data_requirement`,
  `use_case_technology_requirement`. Columns are the two endpoint id fields plus
  optional edge attributes (e.g. `is_primary`, `required_for_mvp`).

## Endpoints (base `/api/v1/catalog`)

| Method + path | Purpose |
|---|---|
| `GET /registry` | Self-describing schema + `dependency_order`. Read this first. |
| `GET /seed/status` | Current `mode`, `seed_applied`, per-type example/user counts. |
| `GET /seed/library` | Browse shipped examples with an `imported` flag. |
| `POST /seed/import` | Import shipped examples. Body optional: `{source_refs, include_dependencies, dry_run}`. Empty = all. |
| `POST /import` | Import an arbitrary document. `{entities, relationships, as_examples, dry_run}`. Default = user data. |
| `GET /export?scope=all\|user\|examples` | Serialize the catalog to a re-importable document. |
| `POST /lifecycle` | `{mode}`: `reset-to-examples`, `start-from-scratch`, `clear-examples`, `clear-user`. |
| `POST /{type}` · `PUT /{type}/{id}` · `DELETE /{type}/{id}?cascade=` | Single-record CRUD. |

## Recipes

- **Populate from scratch (agent):** author one document, `POST /import` with
  `dry_run: true` to validate (check `unresolved_relationships` is 0), then
  `POST /import` for real.
- **Start blank:** `POST /lifecycle {"mode": "start-from-scratch"}`.
- **Reuse a subset of examples:** `GET /seed/library`, pick `source_ref`s, then
  `POST /seed/import {"source_refs": [...], "include_dependencies": true}` — required
  parents are pulled in automatically.
- **Tailor then redistribute:** edit via the API, `GET /export?scope=all`, ship the
  result as a new `seed.json` or hand it to `POST /import` elsewhere.

## Notes

- `dry_run` resolves and counts everything, then rolls back — nothing persists.
- Deleting an entity with children (e.g. an industry with segments) returns `409`
  unless `cascade=true`.
- Bulk clears repair integrity automatically (dangling FKs nulled, orphan edges
  dropped), so partial scopes never leave the catalog inconsistent.
