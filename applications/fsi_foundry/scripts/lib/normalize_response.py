#!/usr/bin/env python3
"""Normalize AgentCore responses (Python repr or JSON) to valid JSON."""
import sys, json, re, ast

raw = open(sys.argv[1]).read().strip()

try:
    parsed = json.loads(raw)
    if isinstance(parsed, dict):
        print(json.dumps(parsed))
        sys.exit(0)
    if isinstance(parsed, str):
        raw = parsed
except Exception:
    pass

try:
    cleaned = re.sub(r'datetime\.datetime\([^)]+\)', "'2026-01-01T00:00:00'", raw)
    cleaned = re.sub(r"<\w+\.\w+:\s*'([^']+)'>", r"'\1'", cleaned)
    d = ast.literal_eval(cleaned)
    print(json.dumps(d, default=str))
    sys.exit(0)
except Exception:
    pass

try:
    cleaned = re.sub(r'datetime\.datetime\([^)]+\)', '"2026-01-01T00:00:00"', raw)
    cleaned = re.sub(r"<\w+\.\w+:\s*'([^']+)'>", r'"\1"', cleaned)
    cleaned = cleaned.replace("'", '"').replace('None', 'null').replace('True', 'true').replace('False', 'false')
    print(json.dumps(json.loads(cleaned)))
    sys.exit(0)
except Exception:
    pass

print(json.dumps({"_raw": raw[:5000]}))
