# Signals DynamoDB Contract

This document defines the DynamoDB schema contract between signal producers (Lambdas, EventBridge rules) and the dashboard backend. If you're building a Lambda that creates budgets, alarms, or evaluations for agents — write to these tables and the dashboard will display your data automatically.

The dashboard reads **only from DynamoDB**. It does not make direct AWS API calls for signal data.

---

## Architecture

```
Agent Created (EventBridge)
    │
    ├── Cost Lambda ──────► cost-signals DynamoDB ──────► Dashboard
    ├── Obs Lambda ───────► observability-signals DynamoDB ──► Dashboard
    └── Eval Lambda ──────► evaluation-signals DynamoDB ───► Dashboard
```

The dashboard backend (`api.py`) also has a `POST /api/sync` endpoint that can populate these tables from AWS APIs (Budgets, CloudWatch, AgentCore Evaluations). But the preferred path is: **your Lambda writes directly to DynamoDB**.

---

## Table 1: `cost-signals`

**Purpose:** Per-agent cost/budget data from AWS Budgets.

| Field | Type | Required | Description |
|---|---|---|---|
| `agent_name` | String (PK) | ✅ | Agent name (must match `agent-registry`) |
| `budget_name` | String | ✅ | AWS Budget name (e.g. `agent-my_agent`) |
| `budget_limit_usd` | String | ✅ | Monthly budget limit (e.g. `"2.0"`) |
| `actual_spend_usd` | String | ✅ | Current actual spend (e.g. `"0.135"`) |
| `forecasted_spend_usd` | String | ✅ | Forecasted month-end spend (e.g. `"0.5"`) |
| `pct_used` | String | ✅ | Percentage of budget used (e.g. `"6.8"`) |
| `forecast_pct` | String | ✅ | Forecasted percentage (e.g. `"25.0"`) |
| `severity` | String | ✅ | `"low"` / `"medium"` / `"critical"` |
| `synced_at` | String (ISO 8601) | ✅ | When this record was written |
| `expires_at` | Number (epoch) | ✅ | TTL — set to `now + 24h` |
| `last_action` | String | ❌ | Set by dashboard on session stop: `"session_stopped"` |
| `last_action_at` | String (ISO 8601) | ❌ | When the action was taken |

**Severity rules:**
- `pct_used >= 100` → `"critical"`
- `pct_used >= 80` OR `forecast_pct >= 100` → `"medium"`
- Otherwise → `"low"`

**Example item:**
```json
{
  "agent_name": "my_agent",
  "budget_name": "agent-my_agent",
  "budget_limit_usd": "2.0",
  "actual_spend_usd": "0.135",
  "forecasted_spend_usd": "0.5",
  "pct_used": "6.8",
  "forecast_pct": "25.0",
  "severity": "low",
  "synced_at": "2026-04-01T15:48:34.183013+00:00",
  "expires_at": 1775144914
}
```

---

## Table 2: `observability-signals`

**Purpose:** Per-agent observability signals from CloudWatch alarms.

| Field | Type | Required | Description |
|---|---|---|---|
| `agent_name` | String (PK) | ✅ | Agent name (must match `agent-registry`) |
| `signal_key` | String (SK) | ✅ | Unique signal ID — use alarm name or `error_rate_spike`, `latency_explosion`, etc. |
| `signal_type` | String | ✅ | Signal category: `error_alarm`, `latency_alarm`, `evaluation_alarm`, `cost_alarm`, `alarm` |
| `severity` | String | ✅ | `"low"` / `"medium"` / `"critical"` |
| `alarm_state` | String | ❌ | CloudWatch alarm state: `OK`, `ALARM`, `INSUFFICIENT_DATA` |
| `alarm_name` | String | ❌ | CloudWatch alarm name |
| `current_value` | String | ✅ | Current metric value or alarm state |
| `baseline_value` | String | ❌ | Baseline/expected value for comparison |
| `description` | String | ✅ | Human-readable description (shown in dashboard table) |
| `state_reason` | String | ❌ | CloudWatch alarm state reason |
| `state_updated_at` | String (ISO 8601) | ❌ | When alarm state last changed |
| `agent_runtime_arn` | String | ❌ | Agent runtime ARN |
| `agent_runtime_id` | String | ❌ | Agent runtime ID |
| `window_minutes` | Number | ❌ | Observation window in minutes |
| `generated_at` | String (ISO 8601) | ✅ | When this signal was generated |
| `expires_at` | Number (epoch) | ✅ | TTL — set to `now + 24h` |
| `last_action` | String | ❌ | Set by dashboard on session stop: `"session_stopped"` |
| `last_action_at` | String (ISO 8601) | ❌ | When the action was taken |

**Severity rules (from alarm state):**
- `ALARM` → `"critical"`
- `INSUFFICIENT_DATA` → `"medium"`
- `OK` → `"low"`

**Or from metric thresholds:**
- Error rate ≥ 40% → `"critical"`, ≥ 20% → `"medium"`
- Latency ratio ≥ 5x baseline → `"critical"`, ≥ 3x → `"medium"`
- Invocation ratio ≥ 10x baseline → `"critical"`, ≥ 5x → `"medium"`

**Example item (alarm-based):**
```json
{
  "agent_name": "obs_test_agent",
  "signal_key": "AgentSafety-Eval-obs_test_agent",
  "signal_type": "evaluation_alarm",
  "severity": "low",
  "alarm_state": "OK",
  "alarm_name": "AgentSafety-Eval-obs_test_agent",
  "current_value": "OK",
  "baseline_value": "OK",
  "description": "Agent quality degradation detected for obs_test_agent.",
  "generated_at": "2026-04-01T16:00:00+00:00",
  "expires_at": 1775150400
}
```

**Example item (metric-based):**
```json
{
  "agent_name": "obs_test_agent",
  "signal_key": "error_rate_spike",
  "signal_type": "error_rate_spike",
  "severity": "medium",
  "current_value": "25.3",
  "baseline_value": "0",
  "description": "Error rate 25.3% (5 errors / 20 invocations)",
  "agent_runtime_arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/obs_test_agent-abc123",
  "window_minutes": 15,
  "generated_at": "2026-04-01T16:00:00+00:00",
  "expires_at": 1775150400
}
```

---

## Table 3: `evaluation-signals`

**Purpose:** Per-agent evaluation scores from AgentCore Online Evaluations.

| Field | Type | Required | Description |
|---|---|---|---|
| `agent_name` | String (PK) | ✅ | Agent name (must match `agent-registry`) |
| `signal_key` | String (SK) | ✅ | Evaluator ID (e.g. `Builtin.Harmfulness`, `Builtin.Correctness`) |
| `evaluator_name` | String | ✅ | Short name (e.g. `Harmfulness`, `Correctness`) |
| `severity` | String | ✅ | `"low"` / `"medium"` / `"critical"` |
| `bad_count` | Number | ✅ | Count of "bad" evaluations (harmful, incorrect, etc.) |
| `good_count` | Number | ✅ | Count of "good" evaluations |
| `total_count` | Number | ✅ | Total evaluations |
| `bad_pct` | String | ✅ | Bad percentage (e.g. `"12.5"`) |
| `description` | String | ✅ | Human-readable summary |
| `config_name` | String | ❌ | Evaluation config name |
| `generated_at` | String (ISO 8601) | ✅ | When this signal was generated |
| `expires_at` | Number (epoch) | ✅ | TTL — set to `now + 24h` |
| `last_action` | String | ❌ | Set by dashboard on session stop: `"session_stopped"` |
| `last_action_at` | String (ISO 8601) | ❌ | When the action was taken |

**Severity rules:**
- `Builtin.Harmfulness`: any `bad_count >= 1` → `"critical"`
- Other evaluators: `bad_pct >= 50` → `"critical"`, `>= 20` → `"medium"`, else `"low"`

**Supported evaluator IDs (signal_key values):**
- `Builtin.Harmfulness`
- `Builtin.Correctness`
- `Builtin.Helpfulness`
- `Builtin.GoalSuccessRate`
- `Builtin.ToolSelectionAccuracy`
- `Builtin.ToolParameterAccuracy`
- `Builtin.Faithfulness`

**Example item:**
```json
{
  "agent_name": "obs_test_agent",
  "signal_key": "Builtin.Harmfulness",
  "evaluator_name": "Harmfulness",
  "severity": "low",
  "bad_count": 0,
  "good_count": 15,
  "total_count": 15,
  "bad_pct": "0.0",
  "description": "Harmfulness: 0 harmful / 15 total (0.0%)",
  "config_name": "eval_obs_test_agent",
  "generated_at": "2026-04-01T16:00:00+00:00",
  "expires_at": 1775150400
}
```

---

## GSI: `severity-index`

All three tables have a Global Secondary Index:
- **PK:** `severity` (String) — `"low"`, `"medium"`, `"critical"`
- **SK:** `agent_name` (String)
- **Projection:** ALL

Use this to query signals by severity (e.g. "show me all critical signals").

---

## Dashboard Behavior

1. **Read:** Dashboard calls `GET /api/cost-signals`, `GET /api/obs-signals`, `GET /api/eval-signals` — these scan the DynamoDB tables and return all items sorted by severity (critical first).

2. **Session stop cascade:** When an operator stops sessions via the dashboard, it sets `last_action = "session_stopped"` and `last_action_at` on all signal items for that agent. The frontend dims these rows to show they've been acted upon.

3. **TTL:** All signal items should set `expires_at` to `now + 24 hours` (epoch seconds). DynamoDB TTL auto-deletes stale signals. Your Lambda should re-write signals on each run to keep them fresh.

4. **Sync fallback:** The dashboard also has `POST /api/sync` which reads from AWS APIs (Budgets, CloudWatch, AgentCore Evaluations) and writes to these tables. This is a fallback — the preferred path is your Lambda writing directly.

---

## How to Write from Your Lambda

```python
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

# Cost signal example
cost_table = dynamodb.Table("cost-signals")
now = datetime.now(timezone.utc)
cost_table.put_item(Item={
    "agent_name": "my_agent",
    "budget_name": "agent-my_agent",
    "budget_limit_usd": "5.0",
    "actual_spend_usd": "1.23",
    "forecasted_spend_usd": "3.50",
    "pct_used": "24.6",
    "forecast_pct": "70.0",
    "severity": "low",
    "synced_at": now.isoformat(),
    "expires_at": int(now.timestamp()) + 86400,
})

# Obs signal example
obs_table = dynamodb.Table("observability-signals")
obs_table.put_item(Item={
    "agent_name": "my_agent",
    "signal_key": "AgentSafety-Eval-my_agent",
    "signal_type": "evaluation_alarm",
    "severity": "critical",
    "alarm_state": "ALARM",
    "alarm_name": "AgentSafety-Eval-my_agent",
    "current_value": "ALARM",
    "baseline_value": "OK",
    "description": "Agent quality alarm triggered for my_agent",
    "generated_at": now.isoformat(),
    "expires_at": int(now.timestamp()) + 86400,
})

# Eval signal example
eval_table = dynamodb.Table("evaluation-signals")
eval_table.put_item(Item={
    "agent_name": "my_agent",
    "signal_key": "Builtin.Harmfulness",
    "evaluator_name": "Harmfulness",
    "severity": "critical",
    "bad_count": 2,
    "good_count": 8,
    "total_count": 10,
    "bad_pct": "20.0",
    "description": "Harmfulness: 2 harmful / 10 total (20.0%)",
    "config_name": "eval_my_agent",
    "generated_at": now.isoformat(),
    "expires_at": int(now.timestamp()) + 86400,
})
```

---

## IAM Permissions Required

Your Lambda needs these DynamoDB permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:UpdateItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:*:table/cost-signals",
    "arn:aws:dynamodb:us-east-1:*:table/observability-signals",
    "arn:aws:dynamodb:us-east-1:*:table/evaluation-signals"
  ]
}
```

---

## Table Creation

All tables are created by running:
```bash
python Agent-Safety/components/04-hil-interventions/tables.py --region us-east-1
```

Or create individual tables:
```bash
python tables.py --region us-east-1 --table cost-signals
python tables.py --region us-east-1 --table observability-signals
python tables.py --region us-east-1 --table evaluation-signals
```
