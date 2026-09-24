"""JSON extraction utility for parsing structured LLM responses."""

import json
import re


def extract_json(text: str) -> dict:
    """Extract JSON object from LLM response, handling markdown code blocks."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        return json.loads(text[start:end + 1])
    raise ValueError(f"Could not extract JSON from response: {text[:200]}")
