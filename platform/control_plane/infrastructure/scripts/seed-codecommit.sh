#!/bin/bash

# Wrapper script for seeding CodeCommit with FSI Foundry templates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}FSI Foundry - CodeCommit Template Seeder${NC}"
echo "============================================"
echo

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Please configure AWS CLI with: aws configure"
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-us-east-1}

echo -e "${GREEN}✓ AWS credentials valid${NC}"
echo "  Account: $AWS_ACCOUNT"
echo "  Region: $AWS_REGION"
echo

# Check Python dependencies
if ! python3 -c "import boto3" &>/dev/null; then
    echo -e "${YELLOW}Installing boto3...${NC}"
    pip3 install boto3
fi

# Parse arguments
MODE=${1:-init}
DRY_RUN=""

if [[ "$2" == "--dry-run" ]] || [[ "$1" == "--dry-run" ]]; then
    DRY_RUN="--dry-run"
    echo -e "${YELLOW}Running in DRY RUN mode (no changes will be made)${NC}"
    echo
fi

# Run the seeder
echo "Starting CodeCommit seeding..."
echo

python3 "$SCRIPT_DIR/seed-codecommit-templates.py" \
    --mode "$MODE" \
    --region "$AWS_REGION" \
    $DRY_RUN

echo
echo -e "${GREEN}Done!${NC}"
