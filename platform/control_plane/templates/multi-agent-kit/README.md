# Multi-Agent Kit

Multi-agent composition patterns for Strands Agents SDK and LangGraph.

## Files

| File | Pattern | Description |
|------|---------|-------------|
| `src/strands_agents_as_tools.py` | Agents as Tools | Pass Agent instances in `tools=[]` — Strands auto-wraps them as callable tools |
| `src/strands_swarm.py` | Swarm | Agents hand off to each other dynamically via `Swarm` with automatic handoff tools |
| `src/langgraph_supervisor.py` | Supervisor | Router node classifies requests and routes to specialist nodes via conditional edges |

## Run

```bash
# Strands — agents as tools
python -m src.strands_agents_as_tools

# Strands — swarm handoffs
python -m src.strands_swarm

# LangGraph — supervisor routing
python -m src.langgraph_supervisor
```

## Install

```bash
pip install -e ".[strands]"    # Strands only
pip install -e ".[langgraph]"  # LangGraph only
pip install -e ".[all]"        # Both
```
