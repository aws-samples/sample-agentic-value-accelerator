# KYC Controlled Quality Output — Console Services & Demo Seed

These are the backend services that turn the governance console's surfaces into live
data (metrics, Cedar, evaluations, HITL, grounding, registry, validator), plus the
**seed script that populates the demo data a fresh deployment needs.**

> New to this repo? The two commands under [Quick start](#quick-start) are all you need to
> get a working demo after cloning.

## How the console reads data

The UI reads everything through same-origin `/svc/*` paths (see the UI's
`public/runtime-config.json`), which CloudFront routes to the consolidated console gateway
and on to these services. There are **no account-specific URLs or API keys in the browser**.

Two modes:

- **Basic Mode** (presenter walkthrough) reads pinned values and falls back to the same
  values offline — intentional resilience so a live demo never breaks.
- **Advanced Mode** (the full console) reads live data. **On an unseeded deployment it shows
  "Run seed_phase3.py …" prompts rather than fabricated numbers.** Running the seed is what
  turns those panels live.

## Quick start

From this directory (`deploy/console-services`), with AWS credentials for your account and
`boto3` available:

```bash
# 1. Deploy the console-service stacks (tables, proxies, gateway) into YOUR account.
bash deploy_all.sh --region us-east-1

# 2. Seed the demo data (evaluators, agents, pinned evaluations, 30-day metric history).
python3 seed_evaluations.py --region us-east-1   # evaluator definitions
python3 seed_phase3.py      --region us-east-1    # pinned evaluations + metrics history
```

Then reload the console. Advanced Mode panels (Evaluation Pipeline, Business Metrics 30-day)
switch from "NOT SEEDED / run the seed script" to live values.

## `seed_phase3.py` — Phase 3 demo seed

Idempotent and portable. Re-run any time to reset a demo account to a known-good state.

```bash
python3 seed_phase3.py \
  --region us-east-1 \
  --evaluations-table kyc-evaluation-results \
  --metrics-table     kyc-metrics-history \
  --fixture           fixtures/evaluations-pinned.json \
  [--skip-metrics]
```

What it writes:

| Table | Contents | Source |
|-------|----------|--------|
| `kyc-evaluation-results` | Pinned Acme (APPROVE) + Omega (REJECT) evaluation records, surfaced by `GET /evaluations` | `fixtures/evaluations-pinned.json` |
| `kyc-metrics-history` | 30 days of deterministic synthetic governance metrics, surfaced by `GET /metrics-history` | generated in-script (mulberry32 seed 42) |

Properties:
- **Idempotent** — every write is `put_item`; re-running overwrites with identical values.
- **Portable** — table names + region are parameters only; no ARNs or account IDs.
- Creates `kyc-metrics-history` (HASH `metric_series`, RANGE `date`) if it does not exist.

> `kyc-agent-registry` (agents) and `kyc-agent-evaluators` (evaluator definitions) are seeded by
> `deploy_all.sh` / `seed_evaluations.py`. `seed_phase3.py` adds the evaluation results and the
> metric history introduced in Phase 3.

## Notes

- The `/metrics-history` route lives in `metrics-proxy/template-cfn.yaml`. If you deployed the
  console services before this route existed, redeploy the metrics-proxy stack so the route and
  its DynamoDB read permission are present.
- All rate fields in the metric history are fractions (0..1); time-to-decision is in seconds.
