# Human-in-the-Loop

Approval and interrupt patterns for Strands and LangGraph.

## Files

| File | Framework | Description |
|------|-----------|-------------|
| `src/strands_hil.py` | Strands | `tool_context.interrupt()` pauses execution inside a tool for human confirmation |
| `src/langgraph_hil.py` | LangGraph | `interrupt()` pauses graph execution; resume with `Command(resume=value)` |

## Run

```bash
python -m src.strands_hil
python -m src.langgraph_hil
```

## Install

```bash
pip install -e ".[strands]"    # Strands only
pip install -e ".[langgraph]"  # LangGraph only
pip install -e ".[all]"        # Both
```
