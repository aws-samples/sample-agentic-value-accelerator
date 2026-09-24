#!/usr/bin/env bash
# Phase 2 deploy orchestrator — run inside a fresh-creds burst.
#   Step 1: deploy the authorizer stack. CloudFormation generates the x-origin-verify secret
#           in AWS Secrets Manager (encrypted at rest) — no human handles it, nothing on disk.
#   Step 2: inject that secret into CloudFront on BOTH dists (the injector reads it straight
#           from Secrets Manager; the value is never on the command line or written to disk).
# After this, run phase2-attach.sh (validator-only first, then all five) and phase2-verify.sh.
set -euo pipefail
export AWS_PAGER=""
REGION="${REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION"
HERE="$(cd "$(dirname "$0")" && pwd)"
STACK="${STACK:-kyc-origin-verify-authorizer}"
TEST_DIST="${TEST_DIST:-E1V1IBH8DIKFGR}"
PROD_DIST="${PROD_DIST:-E1Q6VO2AHA03JB}"

echo "== step 1: deploy authorizer stack (CFN generates the secret in Secrets Manager) =="
aws cloudformation deploy --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$HERE/template-cfn.yaml" \
  --capabilities CAPABILITY_NAMED_IAM

SECRET_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='OriginSecretArn'].OutputValue | [0]" --output text)
echo "  secret: $SECRET_ARN"

echo "== step 2: inject x-origin-verify into CloudFront on both dists (value fetched from Secrets Manager) =="
python3 "$HERE/phase2-cf-inject-header.py" add "$TEST_DIST" "$SECRET_ARN"
python3 "$HERE/phase2-cf-inject-header.py" add "$PROD_DIST" "$SECRET_ARN"

echo "DONE. Wait for both dists to reach 'Deployed', then:"
echo "  BACKENDS='validator:n79e2ivfai' bash $HERE/phase2-attach.sh   # verify-one first"
echo "  bash $HERE/phase2-attach.sh                                   # then all five"
echo "  bash $HERE/phase2-verify.sh                                   # TEST"
echo "  CF_DOMAIN=d34f241zukf5gh.cloudfront.net CF_AUTH=fsigovdemo:FsiDemo2026 bash $HERE/phase2-verify.sh  # PROD"
