#!/bin/bash

# Import existing AWS resources into Terraform state
# This script imports resources that already exist in AWS account

set -e

# Change to infrastructure directory (parent of scripts/)
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Importing existing resources into Terraform state...${NC}"
echo

# Get AWS account ID for constructing ARNs
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-us-east-1}
NAME_PREFIX="ava-cp-dev-${AWS_ACCOUNT_ID: -6}"

echo "Account ID: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Name Prefix: $NAME_PREFIX"
echo

# Function to safely import (skip if already in state)
safe_import() {
    local resource=$1
    local id=$2

    if terraform state show "$resource" &>/dev/null; then
        echo -e "${YELLOW}  ✓ $resource already in state${NC}"
    else
        echo -e "  Importing $resource..."
        if terraform import "$resource" "$id" 2>/dev/null; then
            echo -e "${GREEN}  ✓ Imported $resource${NC}"
        else
            echo -e "${RED}  ✗ Failed to import $resource (may not exist)${NC}"
        fi
    fi
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================
echo -e "${YELLOW}[1/12] CloudWatch Log Groups${NC}"
safe_import "module.api_gateway.aws_cloudwatch_log_group.api_gateway" "/aws/apigateway/$NAME_PREFIX"
safe_import "module.codebuild.aws_cloudwatch_log_group.codebuild" "/aws/codebuild/${NAME_PREFIX}-deployment"
safe_import "module.ecs.aws_cloudwatch_log_group.ecs" "/ecs/$NAME_PREFIX"
safe_import "module.step_functions.aws_cloudwatch_log_group.step_functions" "/aws/vendedlogs/states/${NAME_PREFIX}-deployment"
echo

# =============================================================================
# IAM Roles
# =============================================================================
echo -e "${YELLOW}[2/12] IAM Roles${NC}"
safe_import "module.codebuild.aws_iam_role.codebuild" "${NAME_PREFIX}-codebuild-role"
safe_import "module.cognito.aws_iam_role.authenticated" "${NAME_PREFIX}-cognito-authenticated-role"
safe_import "module.ecs.aws_iam_role.ecs_task_execution" "${NAME_PREFIX}-ecs-task-execution-role"
safe_import "module.ecs.aws_iam_role.ecs_task" "${NAME_PREFIX}-ecs-task-role"
safe_import "module.eventbridge.aws_iam_role.eventbridge" "${NAME_PREFIX}-eventbridge-role"
safe_import "module.step_functions.aws_iam_role.step_functions" "${NAME_PREFIX}-step-functions-role"
echo

# =============================================================================
# DynamoDB Tables
# =============================================================================
echo -e "${YELLOW}[3/12] DynamoDB Tables${NC}"
safe_import "module.dynamodb.aws_dynamodb_table.app_factory" "${NAME_PREFIX}-app-factory"
safe_import "module.dynamodb.aws_dynamodb_table.application_catalog" "${NAME_PREFIX}-application-catalog"
safe_import "module.dynamodb.aws_dynamodb_table.deployment_metadata" "${NAME_PREFIX}-deployment-metadata"
safe_import "module.dynamodb.aws_dynamodb_table.deployments" "${NAME_PREFIX}-deployments"
safe_import "module.state_backend.aws_dynamodb_table.lock" "${NAME_PREFIX}-tf-lock"
echo

# =============================================================================
# ECR Repository
# =============================================================================
echo -e "${YELLOW}[4/12] ECR Repository${NC}"
safe_import "module.ecr.aws_ecr_repository.backend" "${NAME_PREFIX}-backend"
echo

# =============================================================================
# S3 Buckets
# =============================================================================
echo -e "${YELLOW}[5/12] S3 Buckets${NC}"
safe_import "module.s3.aws_s3_bucket.project_archives" "${NAME_PREFIX}-project-archives"
safe_import "module.s3.aws_s3_bucket.frontend" "${NAME_PREFIX}-frontend"
safe_import "module.s3.aws_s3_bucket.deployments" "${NAME_PREFIX}-deployments"
safe_import "module.state_backend.aws_s3_bucket.state" "${NAME_PREFIX}-tf-state"
echo

# =============================================================================
# EventBridge Event Bus
# =============================================================================
echo -e "${YELLOW}[6/12] EventBridge Event Bus${NC}"
safe_import "module.eventbridge.aws_cloudwatch_event_bus.deployment" "fsi-deployment-events"
echo

# =============================================================================
# CloudFront Origin Access Control
# =============================================================================
echo -e "${YELLOW}[7/12] CloudFront Origin Access Control${NC}"
OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='${NAME_PREFIX}-oac'].Id" --output text 2>/dev/null || echo "")
if [ -n "$OAC_ID" ]; then
    safe_import "module.cloudfront.aws_cloudfront_origin_access_control.main" "$OAC_ID"
else
    echo -e "${YELLOW}  No CloudFront OAC found (will be created)${NC}"
fi
echo

# =============================================================================
# Cognito User Pool Domain
# =============================================================================
echo -e "${YELLOW}[8/12] Cognito User Pool Domain${NC}"
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='${NAME_PREFIX}-user-pool'].Id" --output text 2>/dev/null || echo "")
if [ -n "$USER_POOL_ID" ]; then
    safe_import "module.cognito.aws_cognito_user_pool_domain.main" "${NAME_PREFIX}-login"
else
    echo -e "${YELLOW}  No Cognito User Pool found (will be created)${NC}"
fi
echo

# =============================================================================
# CloudWatch Query Definitions
# =============================================================================
echo -e "${YELLOW}[9/12] CloudWatch Query Definitions${NC}"
# Query definitions use query-definition-id, which we need to look up
API_QUERY_ID=$(aws logs describe-query-definitions --query "queryDefinitions[?name=='${NAME_PREFIX}/api-errors'].queryDefinitionId" --output text 2>/dev/null || echo "")
if [ -n "$API_QUERY_ID" ]; then
    safe_import "module.observability.aws_cloudwatch_query_definition.api_errors" "$API_QUERY_ID"
fi

ECS_QUERY_ID=$(aws logs describe-query-definitions --query "queryDefinitions[?name=='${NAME_PREFIX}/ecs-errors'].queryDefinitionId" --output text 2>/dev/null || echo "")
if [ -n "$ECS_QUERY_ID" ]; then
    safe_import "module.observability.aws_cloudwatch_query_definition.ecs_errors" "$ECS_QUERY_ID"
fi

DEPLOY_QUERY_ID=$(aws logs describe-query-definitions --query "queryDefinitions[?name=='${NAME_PREFIX}/deployment-status'].queryDefinitionId" --output text 2>/dev/null || echo "")
if [ -n "$DEPLOY_QUERY_ID" ]; then
    safe_import "module.observability.aws_cloudwatch_query_definition.deployment_status" "$DEPLOY_QUERY_ID"
fi
echo

# =============================================================================
# ECS Cluster (if exists)
# =============================================================================
echo -e "${YELLOW}[10/12] ECS Cluster${NC}"
ECS_CLUSTER_ARN=$(aws ecs describe-clusters --clusters "${NAME_PREFIX}-cluster" --query 'clusters[0].clusterArn' --output text 2>/dev/null || echo "")
if [ "$ECS_CLUSTER_ARN" != "None" ] && [ -n "$ECS_CLUSTER_ARN" ]; then
    safe_import "module.ecs.aws_ecs_cluster.main" "$ECS_CLUSTER_ARN"
else
    echo -e "${YELLOW}  No ECS Cluster found (will be created)${NC}"
fi
echo

# =============================================================================
# SQS Queue (EventBridge DLQ)
# =============================================================================
echo -e "${YELLOW}[11/12] SQS Queue${NC}"
SQS_URL=$(aws sqs get-queue-url --queue-name "${NAME_PREFIX}-eventbridge-dlq" --query 'QueueUrl' --output text 2>/dev/null || echo "")
if [ -n "$SQS_URL" ]; then
    safe_import "module.eventbridge.aws_sqs_queue.dlq" "$SQS_URL"
else
    echo -e "${YELLOW}  No SQS Queue found (will be created)${NC}"
fi
echo

# =============================================================================
# VPC (if exists and using existing)
# =============================================================================
echo -e "${YELLOW}[12/12] VPC${NC}"
VPC_ID=$(terraform show -json 2>/dev/null | jq -r '.values.root_module.child_modules[]? | select(.address=="module.networking[0]") | .resources[]? | select(.type=="aws_vpc") | .values.id' 2>/dev/null || echo "")
if [ -n "$VPC_ID" ]; then
    echo -e "${YELLOW}  VPC already in state${NC}"
else
    echo -e "${YELLOW}  No VPC in state (new VPC will be created)${NC}"
fi
echo

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Import completed!${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo "Next steps:"
echo "1. Run: terraform plan"
echo "2. Review the changes"
echo "3. Run: terraform apply"
