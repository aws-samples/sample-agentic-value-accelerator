#!/bin/bash
# Thin wrapper — the AVA Control Plane template catalog and CodeBuild
# pipeline invoke `deploy.sh` at the root of each reference implementation.
# The real deployment logic lives in `deploy-all.sh`; this wrapper preserves
# the documented `./deploy-all.sh` command in README.md while honoring the
# platform's naming contract.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/deploy-all.sh"
exec "$DIR/deploy-all.sh" "$@"
