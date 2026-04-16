#!/bin/bash

# Control Plane Infrastructure Destruction Script
# This script safely destroys the Control Plane infrastructure

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}============================================${NC}"
echo -e "${RED}Control Plane Infrastructure Destruction${NC}"
echo -e "${RED}============================================${NC}"
echo

echo -e "${YELLOW}WARNING: This will destroy ALL infrastructure resources!${NC}"
echo -e "${YELLOW}This action cannot be undone!${NC}"
echo
echo "Resources that will be destroyed:"
echo "  - ECS Cluster and Services"
echo "  - API Gateway"
echo "  - DynamoDB Tables (and all data)"
echo "  - S3 Buckets (and all data)"
echo "  - CloudFront Distribution"
echo "  - Cognito User Pool (and all users)"
echo "  - CloudWatch Logs and Dashboards"
echo "  - Step Functions State Machine"
echo "  - VPC (if created by Terraform)"
echo

# First confirmation
read -p "Are you absolutely sure you want to destroy all resources? (yes/no): " confirm1

if [ "$confirm1" != "yes" ]; then
    echo -e "${BLUE}Destruction cancelled${NC}"
    exit 0
fi

# Second confirmation
echo
echo -e "${RED}FINAL WARNING: This is your last chance to cancel!${NC}"
read -p "Type 'destroy' to confirm: " confirm2

if [ "$confirm2" != "destroy" ]; then
    echo -e "${BLUE}Destruction cancelled${NC}"
    exit 0
fi

# Empty S3 buckets first (required before destruction)
echo
echo "Emptying S3 buckets..."

PROJECT_ARCHIVES_BUCKET=$(terraform output -raw project_archives_bucket_name 2>/dev/null || echo "")
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name 2>/dev/null || echo "")

if [ -n "$PROJECT_ARCHIVES_BUCKET" ]; then
    echo "Emptying project archives bucket: $PROJECT_ARCHIVES_BUCKET"
    aws s3 rm s3://$PROJECT_ARCHIVES_BUCKET --recursive || true
fi

if [ -n "$FRONTEND_BUCKET" ]; then
    echo "Emptying frontend bucket: $FRONTEND_BUCKET"
    aws s3 rm s3://$FRONTEND_BUCKET --recursive || true
fi

# Run terraform destroy
echo
echo "Running terraform destroy..."
if terraform destroy; then
    echo
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}All resources have been destroyed${NC}"
    echo -e "${BLUE}============================================${NC}"
else
    echo -e "${RED}Error: Terraform destroy failed${NC}"
    echo "You may need to manually delete some resources in the AWS Console"
    exit 1
fi
