#!/bin/bash

# cleanup-secrets.sh
# Force-deletes AWS Secrets Manager secrets that are pending deletion.
#
# When `make destroy` tears down the foundations stack, Terraform deletes the
# aws_secretsmanager_secret resource, but AWS schedules it for deletion with a
# 30-day recovery window. Redeploying later fails because Terraform cannot
# create a new secret with the same name while the old one is pending deletion.
# This script force-deletes those pending secrets so Terraform can recreate them.

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Change to repository root (parent of scripts directory)
cd "$SCRIPT_DIR/.."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
AWS_REGION="us-east-1"
AUTO_APPROVE=false
SECRET_NAME_PATTERN="market-surveillance-db"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Force-delete AWS Secrets Manager secrets that are pending deletion, so
Terraform can cleanly recreate them on the next deploy.

OPTIONS:
    -e, --environment ENV    Environment name (dev, staging, prod) [default: dev]
    -r, --region REGION      AWS region [default: us-east-1]
    -a, --auto-approve       Skip confirmation prompt
    -h, --help               Display this help message

EXAMPLES:
    # Check and clean up pending secrets for dev (will prompt before deleting)
    $0 --environment dev

    # Auto-approve for CI/scripting use
    $0 --environment dev --auto-approve

    # Target a specific region
    $0 --environment staging --region us-west-2

EOF
    exit 0
}

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -a|--auto-approve)
            AUTO_APPROVE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT (must be dev, staging, or prod)"
    exit 1
fi

print_header "Secrets Manager Cleanup"

print_info "Environment: $ENVIRONMENT"
print_info "Region:      $AWS_REGION"
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    print_error "jq is not installed. Please install it first."
    exit 1
fi

# Verify AWS credentials
print_info "Verifying AWS credentials..."
if ! aws sts get-caller-identity --region "$AWS_REGION" &> /dev/null; then
    print_error "AWS credentials are not configured or are invalid."
    print_error "Please configure your AWS credentials and try again."
    exit 1
fi

CALLER_IDENTITY=$(aws sts get-caller-identity --region "$AWS_REGION" --output json)
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
print_info "AWS Account: $ACCOUNT_ID"
echo ""

# Build the secret name to look for
SECRET_NAME="${SECRET_NAME_PATTERN}-${ENVIRONMENT}"
print_info "Looking for pending-deletion secrets matching: $SECRET_NAME"

# List secrets including those pending deletion
SECRETS_JSON=$(aws secretsmanager list-secrets \
    --region "$AWS_REGION" \
    --include-planned-deletion \
    --filters "Key=name,Values=$SECRET_NAME" \
    --output json 2>/dev/null || echo '{"SecretList":[]}')

# Parse and find candidates (only secrets with DeletedDate set)
CANDIDATES=$(echo "$SECRETS_JSON" | jq -c '[.SecretList[] | select(.DeletedDate != null)]')
CANDIDATE_COUNT=$(echo "$CANDIDATES" | jq 'length')

ACTIVE_COUNT=$(echo "$SECRETS_JSON" | jq '[.SecretList[] | select(.DeletedDate == null)] | length')

if [[ "$ACTIVE_COUNT" -gt 0 ]]; then
    print_warning "Found $ACTIVE_COUNT active secret(s) matching the pattern — these will NOT be deleted."
fi

if [[ "$CANDIDATE_COUNT" -eq 0 ]]; then
    print_info "No pending-deletion secrets found. Nothing to clean up."
    exit 0
fi

# Display candidates
print_header "Secrets Pending Deletion"

echo "$CANDIDATES" | jq -r '.[] | "  Name: \(.Name)\n  ARN:  \(.ARN)\n  Deleted: \(.DeletedDate)\n"'

print_warning "Found $CANDIDATE_COUNT secret(s) pending deletion."
print_warning "These will be PERMANENTLY deleted (no recovery possible)."
echo ""

# Confirm unless auto-approved
if [[ "$AUTO_APPROVE" != "true" ]]; then
    read -p "Do you want to proceed with force-deletion? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
    echo ""
fi

# Force-delete each candidate
DELETED=0
FAILED=0

print_info "Force-deleting secrets..."
echo ""

for ARN in $(echo "$CANDIDATES" | jq -r '.[].ARN'); do
    SECRET_DISPLAY=$(echo "$CANDIDATES" | jq -r --arg arn "$ARN" '.[] | select(.ARN == $arn) | .Name')
    printf "  Deleting %-50s " "$SECRET_DISPLAY"

    if aws secretsmanager delete-secret \
        --region "$AWS_REGION" \
        --secret-id "$ARN" \
        --force-delete-without-recovery &> /dev/null; then
        echo -e "${GREEN}OK${NC}"
        DELETED=$((DELETED + 1))
    else
        echo -e "${RED}FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi
done

# Print summary
echo ""
print_header "Summary"

print_info "Deleted: $DELETED"
if [[ "$ACTIVE_COUNT" -gt 0 ]]; then
    print_info "Skipped (active): $ACTIVE_COUNT"
fi
if [[ "$FAILED" -gt 0 ]]; then
    print_error "Failed:  $FAILED"
fi

if [[ "$FAILED" -gt 0 ]]; then
    print_error "Some deletions failed. Check AWS permissions and try again."
    exit 1
fi

print_info "Cleanup complete. Terraform can now recreate the secrets."
exit 0
