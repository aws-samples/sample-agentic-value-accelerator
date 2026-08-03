#!/bin/bash
# ===========================================================================
# Event-Driven Signal Processing — Deploy Script
# ===========================================================================
# Deploys the event-driven signals CloudFormation stack:
#   1. Creates S3 bucket for Lambda code (if not exists)
#   2. Zips and uploads all 6 Lambda functions
#   3. Deploys CloudFormation stack
#
# Usage:
#   ./deploy.sh --profile <aws-profile> --region us-east-1 \
#     --sns-topic-arn arn:aws:sns:us-east-1:ACCOUNT:agent-cost-alerts
#
# Prerequisites:
#   - AWS CLI v2 configured
#   - Python 3.11+ (for zip)
# ===========================================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
SNS_TOPIC_ARN=""
STACK_NAME="agent-safety-event-driven-signals"
COST_SIGNALS_TABLE="safety-dashboard-cost-signals"
OBS_SIGNALS_TABLE="safety-dashboard-obs-signals"
EVAL_SIGNALS_TABLE="safety-dashboard-eval-signals"
REGISTRY_TABLE="safety-dashboard-registry"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --sns-topic-arn) SNS_TOPIC_ARN="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --cost-signals-table) COST_SIGNALS_TABLE="$2"; shift 2 ;;
    --obs-signals-table) OBS_SIGNALS_TABLE="$2"; shift 2 ;;
    --eval-signals-table) EVAL_SIGNALS_TABLE="$2"; shift 2 ;;
    --registry-table) REGISTRY_TABLE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh --sns-topic-arn <arn> [options]"
      echo ""
      echo "Required:"
      echo "  --sns-topic-arn <arn>    ARN of the agent-cost-alerts SNS topic"
      echo ""
      echo "Optional:"
      echo "  --profile <name>        AWS CLI profile"
      echo "  --region <region>       AWS region (default: us-east-1)"
      echo "  --stack-name <name>     Stack name (default: agent-safety-event-driven-signals)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$SNS_TOPIC_ARN" ]; then
  echo "❌ --sns-topic-arn is required"; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_FLAG=""
if [ -n "$PROFILE" ]; then
  PROFILE_FLAG="--profile $PROFILE"
fi
AWS_OPTS="--region $REGION $PROFILE_FLAG"

ACCOUNT_ID=$(aws sts get-caller-identity $AWS_OPTS --query Account --output text)
CODE_BUCKET="${STACK_NAME}-code-${ACCOUNT_ID}-${REGION}"
CODE_PREFIX="event-driven-signals"

echo ""
echo "============================================================"
echo "  🚀 Event-Driven Signal Processing — Deploy"
echo "============================================================"
echo "  Account:    $ACCOUNT_ID"
echo "  Region:     $REGION"
echo "  Stack:      $STACK_NAME"
echo "  SNS Topic:  $SNS_TOPIC_ARN"
echo "  Code:       s3://$CODE_BUCKET/$CODE_PREFIX/"
echo "============================================================"
echo ""

# ── Phase 1: Create S3 bucket for Lambda code ──
echo "📦 Phase 1: Creating code bucket..."
aws s3 mb "s3://$CODE_BUCKET" $AWS_OPTS 2>/dev/null || true
echo "   ✅ Bucket ready: $CODE_BUCKET"

# ── Phase 2: Zip and upload Lambda functions ──
echo ""
echo "📦 Phase 2: Packaging and uploading Lambda functions..."
LAMBDAS=(
  "cost_signal_event"
  "cost_signal_poll"
  "obs_signal_event"
  "obs_signal_poll"
  "eval_signal_event"
  "eval_signal_poll"
)

for LAMBDA in "${LAMBDAS[@]}"; do
  ZIP_FILE="/tmp/${LAMBDA}.zip"
  rm -f "$ZIP_FILE"
  # Create a temp dir with the Lambda code + boto3
  TEMP_DIR=$(mktemp -d)
  cp "$SCRIPT_DIR/${LAMBDA}.py" "$TEMP_DIR/"
  pip3 install "boto3>=1.42.80" -t "$TEMP_DIR" --quiet --upgrade --no-cache-dir 2>/dev/null
  (cd "$TEMP_DIR" && zip -r "$ZIP_FILE" . -q)
  aws s3 cp "$ZIP_FILE" "s3://$CODE_BUCKET/$CODE_PREFIX/${LAMBDA}.zip" $AWS_OPTS --quiet
  echo "   ✅ ${LAMBDA}.zip uploaded"
  rm -rf "$TEMP_DIR" "$ZIP_FILE"
done

# ── Phase 3: Deploy CloudFormation stack ──
echo ""
echo "🚀 Phase 3: Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    SNSTopicArn="$SNS_TOPIC_ARN" \
    CostSignalsTable="$COST_SIGNALS_TABLE" \
    ObsSignalsTable="$OBS_SIGNALS_TABLE" \
    EvalSignalsTable="$EVAL_SIGNALS_TABLE" \
    RegistryTable="$REGISTRY_TABLE" \
    LambdaCodeBucket="$CODE_BUCKET" \
    LambdaCodePrefix="$CODE_PREFIX" \
  --no-fail-on-empty-changeset \
  $AWS_OPTS

echo "   ✅ Stack deployed"

# ── Summary ──
echo ""
echo "============================================================"
echo "  🎉 Event-Driven Signals Deployed!"
echo "============================================================"
echo ""
echo "  Lambdas:"
for LAMBDA in "${LAMBDAS[@]}"; do
  echo "    • ${STACK_NAME}-$(echo $LAMBDA | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | sed 's/ //g')"
done
echo ""
echo "  Triggers:"
echo "    • SNS → CostSignalEvent (budget threshold breach)"
echo "    • EventBridge → ObsSignalEvent (alarm state change)"
echo "    • EventBridge → EvalSignalEvent (eval alarm state change)"
echo "    • Scheduler → CostSignalPoll (every 5 min)"
echo "    • Scheduler → ObsSignalPoll (every 5 min)"
echo "    • Scheduler → EvalSignalPoll (every 15 min)"
echo ""
echo "  Next steps:"
echo "    1. Verify signals appear in DynamoDB tables"
echo "    2. Remove sync functions from dashboard/api.py"
echo "    3. Update dashboard frontend (remove 5-min sync)"
echo ""
echo "============================================================"
