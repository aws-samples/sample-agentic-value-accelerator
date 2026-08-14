#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — Destroy Script
# Tears down all infrastructure.
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "  Sales Recommend — DESTROY"
echo "============================================"
echo ""
echo "  ⚠️  This will destroy ALL resources."
echo ""
read -p "  Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "  Aborted."
  exit 0
fi

cd "$INFRA_DIR"
terraform destroy -auto-approve

echo ""
echo "  ✓ All resources destroyed."
echo ""
