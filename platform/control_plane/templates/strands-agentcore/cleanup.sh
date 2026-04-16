#!/bin/bash
set -e

# Strands AgentCore Cleanup Script
# Destroys all infrastructure created by deploy.sh

PROJECT_NAME="${PROJECT_NAME:-my-strands-agent}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "========================================"
echo "Strands AgentCore Cleanup"
echo "========================================"
echo "Project: $PROJECT_NAME"
echo "Region: $AWS_REGION"
echo ""
echo "⚠️  WARNING: This will destroy all infrastructure!"
echo ""

# Confirm destruction
read -p "Are you sure you want to destroy all resources? Type 'yes' to confirm: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cleanup cancelled."
  exit 0
fi

echo ""
echo "Destroying infrastructure..."

# Change to Terraform directory
cd iac/terraform

# Check if Terraform state exists
if [ ! -f "terraform.tfstate" ]; then
  echo "No Terraform state found. Nothing to destroy."
  exit 0
fi

# Plan destruction
echo "Creating destruction plan..."
terraform plan -destroy \
  -var="project_name=$PROJECT_NAME" \
  -var="aws_region=$AWS_REGION" \
  -out=destroy.tfplan

# Apply destruction
echo ""
echo "Destroying resources..."
terraform apply destroy.tfplan

# Clean up Terraform files
echo ""
echo "Cleaning up Terraform files..."
rm -f destroy.tfplan
rm -f tfplan

# Optional: Clean up state files
read -p "Remove Terraform state files? (yes/no): " CLEAN_STATE
if [ "$CLEAN_STATE" = "yes" ]; then
  rm -f terraform.tfstate*
  rm -rf .terraform
  echo "Terraform state files removed."
fi

cd ../..

# Clean up Docker images (optional)
echo ""
read -p "Remove Docker images? (yes/no): " CLEAN_DOCKER
if [ "$CLEAN_DOCKER" = "yes" ]; then
  docker rmi ${PROJECT_NAME}-agent:latest 2>/dev/null || true
  echo "Docker images removed."
fi

echo ""
echo "========================================"
echo "Cleanup complete! ✅"
echo "========================================"
echo ""
echo "All infrastructure has been destroyed."
echo "To redeploy, run ./deploy.sh"
