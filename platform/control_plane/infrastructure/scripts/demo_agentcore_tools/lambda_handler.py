"""Demo AgentCore tool Lambda (economic-research use case).

Exposes two MCP tools through an AgentCore Gateway target so a demo can show
Cedar policy enforcement: one tool is permitted, the other is denied by policy.

  - get_gdp_data(country)        -> allowed by the demo Cedar policy
  - get_inflation_data(country)  -> denied (no policy permits it; default-deny)

The data is mock/static — this exists only to demonstrate gateway tool access
control, NOT as a production data source. Deployed by seed_demo_agentcore.py.
"""

import json


def _tool_name(event, context):
    """AgentCore Gateway passes the invoked tool via the Lambda client context
    (bedrockAgentCoreToolName); fall back to the event for local testing."""
    tool = None
    try:
        cc = getattr(context, "client_context", None)
        if cc and getattr(cc, "custom", None):
            tool = cc.custom.get("bedrockAgentCoreToolName")
    except Exception:
        pass
    if not tool:
        tool = (event or {}).get("tool_name") or (event or {}).get("toolName") or "unknown"
    # Gateway namespaces tools as "<target>___<tool>"; strip the target prefix.
    if "___" in tool:
        tool = tool.split("___", 1)[1]
    return tool


def lambda_handler(event, context):
    tool = _tool_name(event, context)
    args = (event or {}).get("arguments", event or {})
    country = args.get("country", "US")

    if tool == "get_gdp_data":
        return {"statusCode": 200, "body": json.dumps({
            "tool": "get_gdp_data", "country": country,
            "gdp_growth_pct": 2.8, "period": "Q2-2026", "source": "demo-econ-data",
        })}
    if tool == "get_inflation_data":
        return {"statusCode": 200, "body": json.dumps({
            "tool": "get_inflation_data", "country": country,
            "cpi_yoy_pct": 3.1, "period": "Jun-2026", "source": "demo-econ-data",
        })}
    return {"statusCode": 400, "body": json.dumps({"error": f"unknown tool: {tool}"})}
