# Structured Output

Typed response patterns using Pydantic models with Strands and LangGraph.

## Files

| File | Framework | Description |
|------|-----------|-------------|
| `src/strands_structured_output.py` | Strands | Pass `structured_output_model=PydanticModel` to agent call, access `result.structured_output` |
| `src/langgraph_structured_output.py` | LangGraph | Use `model.with_structured_output(PydanticModel)` for typed responses |

## Run

```bash
python -m src.strands_structured_output
python -m src.langgraph_structured_output
```

## Install

```bash
pip install -e ".[strands]"    # Strands only
pip install -e ".[langgraph]"  # LangGraph only
```
