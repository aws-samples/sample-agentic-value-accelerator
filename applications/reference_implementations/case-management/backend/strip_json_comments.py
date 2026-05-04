#!/usr/bin/env python3
"""Strip // comments from a JSON file (in-place). Usage: python3 strip_json_comments.py file.json"""
import re, json, sys
path = sys.argv[1]
with open(path) as f:
    text = re.sub(r'//.*$', '', f.read(), flags=re.MULTILINE)
with open(path, 'w') as f:
    json.dump(json.loads(text), f, indent=2)
