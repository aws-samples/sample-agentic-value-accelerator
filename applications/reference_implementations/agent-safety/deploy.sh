#!/bin/bash
# Thin wrapper — the AVA Control Plane template catalog and CodeBuild
# pipeline invoke `deploy.sh` at the root of each reference implementation.
# The real deployment logic lives in `deploy-all.sh`; this wrapper preserves
# the documented `./deploy-all.sh` command in README.md while honoring the
# platform's naming contract.
#
# Phase 3 (sample-agent) packages Python deps for linux/arm64 via `uv`.
# The shared AVA CodeBuild image doesn't ship uv, so bootstrap it here on
# demand rather than pushing that dependency across every deploy path.
# Local developers with uv already installed keep working unchanged.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (required by sample-agent packaging)…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # The installer writes to $HOME/.local/bin (or /root/.local/bin under
  # CodeBuild's root user). Add both to PATH for the rest of this process
  # and every child, so deploy-all.sh's `command -v uv` succeeds.
  export PATH="$HOME/.local/bin:/root/.local/bin:$PATH"
  if ! command -v uv >/dev/null 2>&1; then
    echo "ERROR: uv installation did not land on PATH — expected \$HOME/.local/bin or /root/.local/bin." >&2
    echo "PATH=$PATH" >&2
    exit 1
  fi
  echo "uv installed: $(uv --version)"
fi

chmod +x "$DIR/deploy-all.sh"
"$DIR/deploy-all.sh" "$@"
DEPLOY_RC=$?

# AVA's CodeBuild buildspec expects the deploy script to leave outputs at
# /tmp/outputs.json. Without this the Open App button never renders because
# the deployment record shows outputs: {}.
#
# Only run this on successful deploys; on failure the buildspec writes its
# own failed-status outputs.json and we shouldn't clobber it.
if [ "$DEPLOY_RC" = "0" ] && [ -w /tmp ]; then
  DASHBOARD_STACK="${DASHBOARD_STACK:-agent-safety-dashboard}"
  REGION="${AWS_REGION:-us-east-1}"
  # Scrape the dashboard CFN stack's CloudFrontDomainName output. Falls back
  # to an empty string; downstream JSON is still valid so the buildspec's
  # merge step doesn't crash.
  DASHBOARD_URL=""
  if command -v aws >/dev/null 2>&1; then
    DOMAIN=$(aws cloudformation describe-stacks \
        --stack-name "$DASHBOARD_STACK" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' \
        --output text 2>/dev/null || true)
    if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "None" ]; then
      DASHBOARD_URL="https://$DOMAIN"
    fi
  fi
  # Write valid JSON regardless — empty URL is fine, the UI just won't show
  # the button until a re-deploy publishes one.
  cat > /tmp/outputs.json <<JSON
{
  "deployment_id": "${DEPLOYMENT_ID:-agent-safety}",
  "status": "success",
  "iac_type": "bash",
  "dashboard_url": "$DASHBOARD_URL",
  "ui_url": "$DASHBOARD_URL"
}
JSON
  echo "Wrote /tmp/outputs.json with dashboard_url=$DASHBOARD_URL"
fi

exit $DEPLOY_RC
