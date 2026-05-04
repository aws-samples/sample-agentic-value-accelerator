#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Cleanup Script - Delete ALL AWS resources
#
# Removes:
#   - DynamoDB tables (5)
#   - Lambda functions (4)
#   - IAM roles (4)
#   - API Gateway
#   - S3 bucket + CloudFront distribution
#   - AgentCore stack (if deployed)
#
# Usage:
#   bash cleanup.sh
#
# Prerequisites:
#   - .env file with AWS credentials
#
# CAUTION: This permanently deletes all data and resources.
# ============================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Source .env file
if [ -f "$ROOT/.env" ]; then
  echo "Loading credentials from .env..."
  export $(grep -v '^#' "$ROOT/.env" | grep -v '^$' | xargs)
fi

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
BUCKET_NAME="case-management-ui-${ACCOUNT_ID}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ⚠️  CAUTION: Resource Cleanup                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Account: ${ACCOUNT_ID}"
echo "  Region:  ${REGION}"
echo ""
echo "This will DELETE:"
echo "  - 5 DynamoDB tables"
echo "  - 4 Lambda functions + IAM roles"
echo "  - API Gateway"
echo "  - S3 bucket + CloudFront distribution"
echo "  - AgentCore resources (if present)"
echo ""
read -r -p "Type 'yes' to confirm deletion: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# Helper function to delete IAM role
delete_role() {
  local role="$1"
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    echo "  Deleting role: $role"
    # Delete inline policies
    for pol in $(aws iam list-role-policies --role-name "$role" --query "PolicyNames[]" --output text 2>/dev/null); do
      aws iam delete-role-policy --role-name "$role" --policy-name "$pol" 2>/dev/null || true
    done
    # Detach managed policies
    for arn in $(aws iam list-attached-role-policies --role-name "$role" --query "AttachedPolicies[].PolicyArn" --output text 2>/dev/null); do
      aws iam detach-role-policy --role-name "$role" --policy-arn "$arn" 2>/dev/null || true
    done
    # Delete role
    aws iam delete-role --role-name "$role" 2>/dev/null && echo "    ✓ Deleted" || echo "    ⚠ Failed"
  else
    echo "  ⏭ Role $role not found"
  fi
}

echo ""
echo "═══ Step 1/6: DynamoDB Tables ═══"
for table in txn_features pair_stats txn_logs dst_src_window actor_state; do
  if aws dynamodb describe-table --table-name "$table" --region "$REGION" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$table" --region "$REGION" >/dev/null
    echo "  ✓ Deleting: $table"
  else
    echo "  ⏭ Not found: $table"
  fi
done

echo ""
echo "═══ Step 2/6: Lambda Functions ═══"
for fn in fraud-scoring txn-reader sar-api bedrock-chat; do
  if aws lambda get-function --function-name "$fn" --region "$REGION" >/dev/null 2>&1; then
    aws lambda delete-function --function-name "$fn" --region "$REGION"
    echo "  ✓ Deleted: $fn"
  else
    echo "  ⏭ Not found: $fn"
  fi
done

echo ""
echo "═══ Step 3/6: IAM Roles ═══"
for role in fraud-scoring-lambda-role txn-reader-lambda-role sar-api-lambda-role bedrock-chat-lambda-role; do
  delete_role "$role"
done

echo ""
echo "═══ Step 4/6: API Gateway ═══"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='sar-api-gateway'].ApiId" --output text 2>/dev/null || echo "")
if [ -n "$API_ID" ]; then
  aws apigatewayv2 delete-api --api-id "$API_ID" --region "$REGION"
  echo "  ✓ Deleted: sar-api-gateway ($API_ID)"
else
  echo "  ⏭ Not found: sar-api-gateway"
fi

echo ""
echo "═══ Step 5/6: CloudFront + S3 ═══"

# Get CloudFront distribution
CF_DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[0].DomainName=='${BUCKET_NAME}.s3.${REGION}.amazonaws.com'].Id" --output text 2>/dev/null || echo "")

if [ -n "$CF_DIST_ID" ]; then
  echo "  Disabling CloudFront distribution: $CF_DIST_ID"

  # Get current config
  ETAG=$(aws cloudfront get-distribution-config --id "$CF_DIST_ID" --query "ETag" --output text)
  aws cloudfront get-distribution-config --id "$CF_DIST_ID" --query "DistributionConfig" > /tmp/cf-config.json

  # Disable distribution
  jq '.Enabled = false' /tmp/cf-config.json > /tmp/cf-config-disabled.json
  aws cloudfront update-distribution --id "$CF_DIST_ID" --if-match "$ETAG" \
    --distribution-config file:///tmp/cf-config-disabled.json >/dev/null

  echo "  ⏳ Waiting for CloudFront to disable (this takes ~5 minutes)..."
  aws cloudfront wait distribution-deployed --id "$CF_DIST_ID" 2>/dev/null || true

  # Delete distribution
  NEW_ETAG=$(aws cloudfront get-distribution --id "$CF_DIST_ID" --query "ETag" --output text)
  aws cloudfront delete-distribution --id "$CF_DIST_ID" --if-match "$NEW_ETAG" 2>/dev/null || true
  echo "  ✓ Deleted CloudFront distribution"
else
  echo "  ⏭ No CloudFront distribution found"
fi

# Delete Origin Access Control
OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='${BUCKET_NAME}-oac'].Id" --output text 2>/dev/null || echo "")
if [ -n "$OAC_ID" ]; then
  OAC_ETAG=$(aws cloudfront get-origin-access-control --id "$OAC_ID" --query "ETag" --output text)
  aws cloudfront delete-origin-access-control --id "$OAC_ID" --if-match "$OAC_ETAG" 2>/dev/null || true
  echo "  ✓ Deleted Origin Access Control"
fi

# Empty and delete S3 bucket
if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  echo "  Emptying S3 bucket: $BUCKET_NAME"
  aws s3 rm "s3://${BUCKET_NAME}" --recursive --region "$REGION" >/dev/null 2>&1 || true
  aws s3api delete-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null || true
  echo "  ✓ Deleted S3 bucket"
else
  echo "  ⏭ S3 bucket not found"
fi

echo ""
echo "═══ Step 6/6: AgentCore (Optional) ═══"
if command -v agentcore &>/dev/null && [ -d "$ROOT/agentcore_sars/agentcore" ]; then
  cd "$ROOT/agentcore_sars"
  AWS_DEFAULT_REGION="$REGION" AWS_REGION="$REGION" agentcore remove all --yes 2>/dev/null || true
  cd "$ROOT"
  echo "  ✓ AgentCore resources removed"
else
  echo "  ⏭ AgentCore not found or not installed"
fi

# Delete CloudFormation stack if exists
STACK_NAME="AgentCore-SARAgent-default"
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "  Deleting AgentCore CloudFormation stack..."
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || true
  echo "  ✓ Stack deleted"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Cleanup Complete                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "All resources have been deleted from account ${ACCOUNT_ID}"
echo ""
