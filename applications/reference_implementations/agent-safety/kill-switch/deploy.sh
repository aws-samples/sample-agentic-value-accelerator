#!/bin/bash
# ============================================================
# Agent Safety — Kill Switch Deployment
# ============================================================
# Deploys: Kill Switch Lambda with IAM permissions.
#
# Usage:
#   ./deploy.sh --profile mbavadiy-Admin --region us-east-2
#   ./deploy.sh --profile mbavadiy-Admin --region us-east-2 \
#     --registry-table safety-dashboard-registry
# ============================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
STACK_NAME="agent-safety-kill-switch"
REGISTRY_TABLE="agent-registry"
INTERVENTION_TABLE="intervention-log"
COST_SIGNALS_TABLE="cost-signals"
OBS_SIGNALS_TABLE="observability-signals"
EVAL_SIGNALS_TABLE="evaluation-signals"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --registry-table) REGISTRY_TABLE="$2"; shift 2 ;;
    --intervention-table) INTERVENTION_TABLE="$2"; shift 2 ;;
    --cost-signals-table) COST_SIGNALS_TABLE="$2"; shift 2 ;;
    --obs-signals-table) OBS_SIGNALS_TABLE="$2"; shift 2 ;;
    --eval-signals-table) EVAL_SIGNALS_TABLE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh --profile <profile> [options]"
      echo "  --region <region>                 AWS region (default: us-east-1)"
      echo "  --registry-table <name>           DynamoDB table (default: agent-registry)"
      echo "  --intervention-table <name>       DynamoDB table (default: intervention-log)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS_OPTS="--region $REGION"
if [ -n "$PROFILE" ]; then
  AWS_OPTS="$AWS_OPTS --profile $PROFILE"
fi

echo ""
echo "============================================================"
echo "  Agent Safety — Kill Switch Deploy"
echo "============================================================"
echo "  Region:     $REGION"
echo "  Stack:      $STACK_NAME"
echo "============================================================"

echo ""
echo "🚀 Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    RegistryTableName="$REGISTRY_TABLE" \
    InterventionTableName="$INTERVENTION_TABLE" \
    CostSignalsTableName="$COST_SIGNALS_TABLE" \
    ObsSignalsTableName="$OBS_SIGNALS_TABLE" \
    EvalSignalsTableName="$EVAL_SIGNALS_TABLE" \
  $AWS_OPTS \
  --no-fail-on-empty-changeset || { echo "❌ Stack failed."; exit 1; }
echo "   ✅ Stack deployed"

echo ""
echo "============================================================"
echo "  ✅ Kill Switch deployed!"
echo "============================================================"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table --no-cli-pager 2>/dev/null
