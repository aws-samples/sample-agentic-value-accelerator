#!/bin/bash
# Thin wrapper — the AVA Control Plane template catalog and CodeBuild
# pipeline invoke `destroy.sh` at the root of each reference implementation.
# The real teardown logic lives in `destroy-all.sh`; this wrapper preserves
# the documented `./destroy-all.sh` command in README.md while honoring the
# platform's naming contract.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/destroy-all.sh"
exec "$DIR/destroy-all.sh" "$@"
