"""Structured synthesis prompt builder for Strands framework."""

import json


def build_structured_synthesis_prompt(agent_results: dict, response_schema: dict, domain_context: str) -> str:
    """Build a synthesis prompt that instructs the LLM to return valid JSON."""
    sections = []
    for key, value in agent_results.items():
        if value is not None:
            sections.append(f"## {key}\n{json.dumps(value, indent=2)}")

    return f"""{domain_context}

Based on the following specialist assessments, produce a structured JSON response.

{chr(10).join(sections)}

Return ONLY a valid JSON object matching this exact schema:
{json.dumps(response_schema, indent=2)}

Rules:
- All enum fields must use the exact string values shown in the schema
- All list fields must contain specific findings from the agent assessments above
- The summary field must be a concise executive summary (2-3 paragraphs)
- Do not include any text outside the JSON object
"""
