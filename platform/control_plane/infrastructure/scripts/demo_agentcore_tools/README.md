# Demo — AgentCore Gateway tool access control (Cedar policy)

Reproducible setup for the demo that shows **AgentCore Gateway governing which
tools an agent can call**, via a Cedar policy on the platform policy engine.

It layers on top of a use case that already has an AgentCore gateway: the LLM
Gateway governs *model* calls, and the AgentCore Gateway governs *tool* calls.

## What it creates

Against a use-case gateway (default `economic-research-gateway`):

| Resource | Name | Purpose |
|----------|------|---------|
| Lambda | `econ-tools-demo` | Two demo tools (mock data) |
| Lambda role | `econ-tools-demo-lambda-role` | Basic execution |
| Gateway target (MCP) | `econ-tools` | Exposes the tools as `econ-tools___<tool>` |
| Policy-engine attachment | — | ENFORCE mode on the gateway |
| Cedar policy | `permit_gdp_us_only` | Permits `get_gdp_data` (country=="US") |

Tools:
- `get_gdp_data(country)` — **allowed** by the Cedar policy
- `get_inflation_data(country)` — **denied** (default-deny; nothing permits it)

> The tool data is mock and exists only to demonstrate access control — it is
> not a production data source for the use case.

## Prerequisites

1. The platform is deployed (policy engine exists).
2. The target use case has an AgentCore gateway — click **Add Gateway** on the
   use case's deployment page (creates `<use-case>-gateway`).
3. AWS credentials for the target account/region.

## Run

```bash
cd platform/control_plane/infrastructure/scripts/demo_agentcore_tools

# default: economic-research-gateway in us-west-2
python3 seed_demo_agentcore.py

# other use case / region
python3 seed_demo_agentcore.py --gateway-name customer-service-gateway --region us-east-1

# remove everything it created (leaves the gateway + policy engine intact)
python3 seed_demo_agentcore.py --teardown
```

The script is idempotent — re-running reuses existing resources.

## Demo the allow / deny

The gateway uses `authorizer-type NONE`, so you can call the MCP endpoint
directly (the seed script prints these with the real gateway URL):

```bash
GW=https://<gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp

# ALLOWED — returns GDP data
curl -X POST $GW -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"econ-tools___get_gdp_data","arguments":{"country":"US"}}}'

# DENIED — "Tool Execution Denied ... policy enforcement"
curl -X POST $GW -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"econ-tools___get_inflation_data","arguments":{"country":"US"}}}'
```

You can also flip enforcement to `LOG_ONLY` from the Policy UI (or backend
`/policies/engines/{id}/set-mode`) to show the same call being *allowed but
logged* instead of blocked.

## Notes on Cedar validation

AgentCore's policy engine rejects unconditional `permit`/`forbid` statements as
"overly permissive/restrictive", and rejects wildcard resources. So:

- the block is expressed as **default-deny** (permit the allowed tool, deny the
  rest) rather than a standalone `forbid`;
- the permit carries a value condition (`context.input.country == "US"`);
- the resource is a concrete gateway ARN, filled in at seed time.

See [`permit_gdp_us_only.cedar`](./permit_gdp_us_only.cedar) for the policy.
