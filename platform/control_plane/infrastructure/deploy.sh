#!/bin/bash

# Control Plane Infrastructure Deployment Script
# This script helps deploy the Control Plane infrastructure with proper checks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Control Plane Infrastructure Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${RED}Please edit .env with your configuration before continuing${NC}"
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$AWS_REGION" ]; then
    echo -e "${RED}Error: AWS_REGION not set in .env${NC}"
    exit 1
fi

if [ -z "$ENVIRONMENT" ]; then
    echo -e "${RED}Error: ENVIRONMENT not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configuration loaded${NC}"
echo -e "  Region: ${AWS_REGION}"
echo -e "  Environment: ${ENVIRONMENT}"
echo

# Check AWS credentials
echo "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Please configure AWS CLI with: aws configure"
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✓ AWS credentials valid${NC}"
echo -e "  Account: ${AWS_ACCOUNT}"
echo

# Check if terraform.tfvars exists
if [ ! -f terraform.tfvars ]; then
    echo -e "${YELLOW}Warning: terraform.tfvars not found${NC}"
    echo "Creating terraform.tfvars from example..."
    cp terraform.tfvars.example terraform.tfvars

    # Update with values from .env
    sed -i.bak "s/aws_region = .*/aws_region = \"${AWS_REGION}\"/" terraform.tfvars
    sed -i.bak "s/environment = .*/environment = \"${ENVIRONMENT}\"/" terraform.tfvars

    if [ -n "$VPC_ID" ]; then
        sed -i.bak "s/# vpc_id .*/vpc_id = \"${VPC_ID}\"/" terraform.tfvars
    fi

    if [ -n "$DOMAIN_NAME" ]; then
        sed -i.bak "s/domain_name = .*/domain_name = \"${DOMAIN_NAME}\"/" terraform.tfvars
    fi

    rm terraform.tfvars.bak
    echo -e "${GREEN}✓ terraform.tfvars created${NC}"
fi

# Initialize Terraform
echo "Initializing Terraform..."
if ! terraform init; then
    echo -e "${RED}Error: Terraform initialization failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Terraform initialized${NC}"
echo

# Validate Terraform configuration
echo "Validating Terraform configuration..."
if ! terraform validate; then
    echo -e "${RED}Error: Terraform configuration is invalid${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Terraform configuration is valid${NC}"
echo

# Run terraform plan
echo "Running terraform plan..."
terraform plan -out=tfplan
echo

# Ask for confirmation
echo -e "${YELLOW}Review the plan above.${NC}"
read -p "Do you want to apply this plan? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    rm tfplan
    exit 0
fi

# Apply the plan
echo
echo "Applying Terraform configuration..."
if terraform apply tfplan; then
    rm tfplan
    echo
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}Deployment completed successfully!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo

    # Show important outputs
    echo "Important outputs:"
    echo
    echo "ECR Repository:"
    terraform output -raw ecr_repository_url
    echo
    echo
    echo "API Endpoint:"
    terraform output -raw api_endpoint
    echo
    echo
    echo "Frontend URL:"
    terraform output -raw frontend_url
    echo
    echo
    echo "Cognito User Pool ID:"
    terraform output -raw cognito_user_pool_id
    echo
    echo

    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Build and push Docker image to ECR"
    echo "2. Build and deploy frontend to S3"
    echo "3. Create Cognito users"
    echo
    echo "See README.md for detailed instructions."
else
    echo -e "${RED}Error: Terraform apply failed${NC}"
    rm tfplan
    exit 1
fi
