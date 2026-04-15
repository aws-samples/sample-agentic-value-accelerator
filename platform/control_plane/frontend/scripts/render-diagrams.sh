#!/bin/bash
# Render all Mermaid .mmd files to .svg in src/assets/diagrams/
set -e

DIAGRAMS_DIR="$(cd "$(dirname "$0")/../src/assets/diagrams" && pwd)"

if ! command -v mmdc &>/dev/null; then
  echo "ERROR: mmdc (Mermaid CLI) not found. Install with: npm install -g @mermaid-js/mermaid-cli"
  exit 1
fi

RENDERED=0
SKIPPED=0
ERRORS=0

for mmd in "$DIAGRAMS_DIR"/*.mmd; do
  [ -f "$mmd" ] || continue
  svg="${mmd%.mmd}.svg"
  if [ -f "$svg" ] && [ "$svg" -nt "$mmd" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  echo "Rendering: $(basename "$mmd")"
  if mmdc -i "$mmd" -o "$svg" -b transparent 2>/dev/null; then
    RENDERED=$((RENDERED + 1))
  else
    echo "  ERROR: Failed to render $(basename "$mmd"), skipping"
    ERRORS=$((ERRORS + 1))
  fi
done

echo "Done: $RENDERED rendered, $SKIPPED skipped (up-to-date), $ERRORS errors"
[ "$ERRORS" -eq 0 ] || exit 1
