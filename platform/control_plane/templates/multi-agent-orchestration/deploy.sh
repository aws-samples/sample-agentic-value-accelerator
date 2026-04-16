#!/bin/bash
set -e

# Multi-Agent Orchestration Deployment Script
# Deploys infrastructure and application to AWS

PROJECT_NAME="${PROJECT_NAME:-my-multi-agent}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-dev}"

echo "========================================"
echo "Multi-Agent Orchestration Deployment"
echo "========================================"
echo "Project: $PROJECT_NAME"
echo "Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v terraform >/dev/null 2>&1 || { echo "Error: terraform is required but not installed. Aborting." >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "Error: aws CLI is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: docker is required but not installed. Aborting." >&2; exit 1; }

# Check AWS credentials
echo "Verifying AWS credentials..."
aws sts get-caller-identity > /dev/null || { echo "Error: AWS credentials not configured. Run 'aws configure' first." >&2; exit 1; }

# Build Docker image
echo ""
echo "Building Docker image..."
docker build -t ${PROJECT_NAME}-orchestration:latest .

# Deploy infrastructure with Terraform
echo ""
echo "Deploying infrastructure with Terraform..."
cd iac/terraform

# Initialize Terraform
terraform init

# Plan deployment
echo "Creating deployment plan..."
terraform plan \
  -var="project_name=$PROJECT_NAME" \
  -var="aws_region=$AWS_REGION" \
  -var="environment=$ENVIRONMENT" \
  -out=tfplan

# Apply deployment
echo ""
read -p "Apply this plan? (yes/no): " CONFIRM
if [ "$CONFIRM" = "yes" ]; then
  terraform apply tfplan
  echo ""
  echo "✅ Deployment complete!"

  # Output useful information
  echo ""
  echo "========================================"
  echo "Deployment Information"
  echo "========================================"
  terraform output

  echo ""
  echo "Next steps:"
  echo "1. Configure agent-specific environment variables"
  echo "2. Run ./test.sh to verify deployment"
  echo "3. Check CloudWatch logs for agent coordination"
  echo "4. Monitor orchestration patterns"
else
  echo "Deployment cancelled."
  rm tfplan
  exit 0
fi

cd ../..

echo ""
echo "Deployment script completed successfully!"
