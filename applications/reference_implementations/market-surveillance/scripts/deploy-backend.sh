#!/bin/bash

# deploy-backend.sh
# Deploys AWS infrastructure using Terraform (foundations + app-infra)
#
# Flow:
#   1. Ensure S3 state bucket and DynamoDB lock table exist (bootstrap)
#   2. Deploy foundations (VPC, KMS, RDS, Cognito, ALB, etc.)
#   3. Deploy app-infra (ECR, Lambda, AgentCore, API Gateway, etc.)

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
AUTO_APPROVE=false
DESTROY=false
AWS_REGION="us-east-1"
FOUNDATIONS_DIR="infrastructure/foundations"
APP_INFRA_DIR="infrastructure/app-infra"
STATE_BUCKET_PREFIX="market-surveillance-tf-state-new"
LOCK_TABLE_NAME="market-surveillance-tf-lock"
FOUNDATION_ONLY=false
APP_INFRA_ONLY=false

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy AWS infrastructure using Terraform (foundations then app-infra)

OPTIONS:
    -e, --environment ENV    Environment name (dev, staging, prod) [default: dev]
    -r, --region REGION      AWS region [default: us-east-1]
    -a, --auto-approve       Skip Terraform approval prompt
    -d, --destroy            Destroy infrastructure instead of creating
    --foundation-only        Deploy only foundations (skip app-infra)
    --app-infra-only         Deploy only app-infra (skip foundations)
    -h, --help               Display this help message

EXAMPLES:
    # Deploy full stack (foundations + app-infra)
    $0 --environment dev

    # Deploy only foundations
    $0 --environment dev --foundation-only

    # Deploy only app-infra (foundations must already exist)
    $0 --environment dev --app-infra-only

    # Destroy everything (app-infra first, then foundations)
    $0 --environment dev --destroy --auto-approve

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

# Function to retrieve a value from SSM Parameter Store
get_ssm_param() {
    local param_name=$1
    aws ssm get-parameter \
        --name "$param_name" \
        --query "Parameter.Value" \
        --output text \
        --region "$AWS_REGION" \
        --no-cli-pager 2>/dev/null
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
        -d|--destroy)
            DESTROY=true
            shift
            ;;
        --foundation-only)
            FOUNDATION_ONLY=true
            shift
            ;;
        --app-infra-only)
            APP_INFRA_ONLY=true
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
    print_warning "Environment '$ENVIRONMENT' is not standard (dev, staging, prod), but continuing..."
fi

# Check prerequisites
for cmd in terraform aws; do
    if ! command -v $cmd &> /dev/null; then
        print_error "$cmd is not installed. Please install it first."
        exit 1
    fi
done

# Verify AWS credentials and get account ID
if ! aws sts get-caller-identity --no-cli-pager &> /dev/null; then
    print_error "AWS credentials are not configured or invalid"
    print_error "Please run 'aws configure' to set up your credentials"
    exit 1
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --no-cli-pager)
STATE_BUCKET="${STATE_BUCKET_PREFIX}-${AWS_ACCOUNT_ID}"

print_info "Starting backend deployment for environment: $ENVIRONMENT"
print_info "AWS Account ID: $AWS_ACCOUNT_ID"
print_info "AWS Region: $AWS_REGION"
print_info "State Bucket: $STATE_BUCKET"

# ============================================================================
# Step 1: Bootstrap — Ensure S3 state bucket and DynamoDB lock table exist
# ============================================================================
print_header "STEP 1: Bootstrap State Backend"

# Check if S3 bucket exists
if aws s3api head-bucket --bucket "$STATE_BUCKET" --no-cli-pager 2>/dev/null; then
    print_info "State bucket '$STATE_BUCKET' already exists"
else
    print_info "Creating state bucket '$STATE_BUCKET'..."

    # Create bucket (us-east-1 doesn't use LocationConstraint)
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "$STATE_BUCKET" \
            --region "$AWS_REGION" \
            --no-cli-pager
    else
        aws s3api create-bucket \
            --bucket "$STATE_BUCKET" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION" \
            --no-cli-pager
    fi

    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$STATE_BUCKET" \
        --versioning-configuration Status=Enabled \
        --no-cli-pager

    # Enable default encryption
    aws s3api put-bucket-encryption \
        --bucket "$STATE_BUCKET" \
        --server-side-encryption-configuration \
        '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}' \
        --no-cli-pager

    # Block all public access
    aws s3api put-public-access-block \
        --bucket "$STATE_BUCKET" \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        --no-cli-pager

    print_info "State bucket created and configured"
fi

# Check if DynamoDB lock table exists
if aws dynamodb describe-table --table-name "$LOCK_TABLE_NAME" --region "$AWS_REGION" --no-cli-pager &>/dev/null; then
    print_info "Lock table '$LOCK_TABLE_NAME' already exists"
else
    print_info "Creating DynamoDB lock table '$LOCK_TABLE_NAME'..."

    aws dynamodb create-table \
        --table-name "$LOCK_TABLE_NAME" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$AWS_REGION" \
        --no-cli-pager

    # Wait for table to become active
    print_info "Waiting for lock table to become active..."
    aws dynamodb wait table-exists \
        --table-name "$LOCK_TABLE_NAME" \
        --region "$AWS_REGION" \
        --no-cli-pager

    print_info "Lock table created"
fi

# Generate backend config file
BACKEND_CONFIG="infrastructure/backend.hcl"
print_info "Writing backend config to $BACKEND_CONFIG"

# Ensure infrastructure directory exists
mkdir -p "$(dirname "$BACKEND_CONFIG")"

cat > "$BACKEND_CONFIG" << EOF
bucket         = "${STATE_BUCKET}"
dynamodb_table = "${LOCK_TABLE_NAME}"
EOF

# ============================================================================
# Helper: Run Terraform init + apply/destroy for a given root module
# ============================================================================
run_terraform() {
    local dir="$1"
    local label="$2"
    local extra_vars="${3:-}"

    print_header "$label"

    if [ ! -d "$dir" ]; then
        print_error "Directory '$dir' not found"
        exit 1
    fi

    # Init with backend config
    print_info "Initializing Terraform in $dir..."
    if ! terraform -chdir="$dir" init -backend-config="../backend.hcl"; then
        print_error "Terraform init failed for $dir"
        exit 1
    fi

    # Build command
    local tf_command="apply"
    if [ "$DESTROY" = true ]; then
        tf_command="destroy"
    fi

    local tf_flags=""
    if [ "$AUTO_APPROVE" = true ]; then
        tf_flags="-auto-approve"
    fi

    # Run apply/destroy
    print_info "Running terraform $tf_command in $dir..."
    if ! terraform -chdir="$dir" $tf_command $tf_flags \
        -var="environment=$ENVIRONMENT" \
        $extra_vars; then
        print_error "Terraform $tf_command failed for $dir"
        exit 1
    fi

    print_info "$label completed successfully"
}

# ============================================================================
# Helper: Pre-deploy cleanup for Code Interpreter resources
# ============================================================================

# Wait for a code interpreter deletion to complete (poll up to $timeout seconds)
wait_for_ci_deletion() {
    local ci_id="$1"
    local timeout=120
    local elapsed=0

    print_info "Waiting for Code Interpreter deletion to complete..."
    while [ $elapsed -lt $timeout ]; do
        if ! aws bedrock-agentcore-control get-code-interpreter \
            --code-interpreter-id "$ci_id" \
            --region "$AWS_REGION" \
            --no-cli-pager &>/dev/null; then
            print_info "Code Interpreter $ci_id deleted successfully"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        print_info "Still waiting... (${elapsed}s / ${timeout}s)"
    done

    print_warning "Timed out waiting for Code Interpreter deletion — proceeding anyway"
    return 0
}

# Delete a code interpreter from AWS by ID, then wait for deletion
delete_ci_from_aws() {
    local ci_id="$1"

    print_info "Deleting Code Interpreter $ci_id from AWS..."
    if aws bedrock-agentcore-control delete-code-interpreter \
        --code-interpreter-id "$ci_id" \
        --region "$AWS_REGION" \
        --no-cli-pager 2>/dev/null; then
        wait_for_ci_deletion "$ci_id"
        return 0
    else
        print_warning "Failed to delete Code Interpreter $ci_id from AWS — proceeding anyway"
        return 1
    fi
}

cleanup_code_interpreter() {
    local dir="$1"

    print_header "PRE-DEPLOY: Code Interpreter Cleanup"

    # Initialize Terraform so we can query state
    print_info "Initializing Terraform to check Code Interpreter state..."
    if ! terraform -chdir="$dir" init -backend-config="../backend.hcl" -input=false 2>/dev/null; then
        print_warning "Terraform init failed during cleanup — skipping cleanup"
        return 0
    fi

    # All module state paths that contain a code interpreter resource
    local state_paths=(
        "module.agentcore.aws_bedrockagentcore_code_interpreter.code_interpreter"
        "module.risk_agentcore.aws_bedrockagentcore_code_interpreter.code_interpreter"
    )

    for state_path in "${state_paths[@]}"; do
        print_info "Checking state: $state_path..."

        local ci_info
        ci_info=$(terraform -chdir="$dir" state show "$state_path" 2>/dev/null) || true

        if [ -z "$ci_info" ]; then
            print_info "No Code Interpreter found at $state_path — skipping"
            continue
        fi

        local ci_id
        ci_id=$(echo "$ci_info" | grep -E '^\s+code_interpreter_id\s+=' | sed 's/.*= *"\(.*\)"/\1/' | tr -d ' ')

        if [ -z "$ci_id" ]; then
            print_warning "Could not extract Code Interpreter ID from $state_path — skipping"
            continue
        fi

        print_info "Found Code Interpreter in state ($state_path): $ci_id"

        # Verify the resource still exists in AWS
        if ! aws bedrock-agentcore-control get-code-interpreter \
            --code-interpreter-id "$ci_id" \
            --region "$AWS_REGION" \
            --no-cli-pager &>/dev/null; then
            print_warning "Code Interpreter $ci_id not found in AWS — removing stale state entry"
            terraform -chdir="$dir" state rm "$state_path" 2>/dev/null || true
            continue
        fi

        delete_ci_from_aws "$ci_id"

        print_info "Removing $state_path from Terraform state..."
        terraform -chdir="$dir" state rm "$state_path" 2>/dev/null || true
    done

    # Safety net: find orphaned code interpreters in AWS by name
    # (handles resources that exist in AWS but not in Terraform state)
    print_info "Checking for orphaned code interpreters in AWS..."
    local ci_list
    ci_list=$(aws bedrock-agentcore-control list-code-interpreters \
        --region "$AWS_REGION" \
        --no-cli-pager 2>/dev/null) || true

    if [ -n "$ci_list" ]; then
        local ci_names=(
            "market_surveillance_code_interpreter_${ENVIRONMENT}"
            "msp_code_interpreter_${ENVIRONMENT}"
        )

        for ci_name in "${ci_names[@]}"; do
            local orphan_id
            orphan_id=$(echo "$ci_list" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for ci in data.get('codeInterpreters', []):
    if ci.get('name') == '$ci_name':
        print(ci.get('codeInterpreterId', ''))
        break
" 2>/dev/null) || true

            if [ -n "$orphan_id" ]; then
                print_info "Found orphaned '$ci_name' (ID: $orphan_id) — deleting..."
                delete_ci_from_aws "$orphan_id"
            fi
        done
    fi

    print_info "Code Interpreter cleanup complete"
    return 0
}

# ============================================================================
# Step 2 & 3: Deploy or Destroy
# ============================================================================
if [ "$DESTROY" = true ]; then
    # Destroy in reverse order: app-infra first, then foundations
    print_warning "DESTROY mode — tearing down in reverse dependency order"

    if [ "$FOUNDATION_ONLY" = false ]; then
        run_terraform "$APP_INFRA_DIR" "DESTROY: App-Infra"
    fi

    if [ "$APP_INFRA_ONLY" = false ]; then
        run_terraform "$FOUNDATIONS_DIR" "DESTROY: Foundations"
    fi

    print_info "Infrastructure destroyed successfully"
    exit 0
fi

# Deploy in dependency order: foundations first, then app-infra
if [ "$APP_INFRA_ONLY" = false ]; then
    run_terraform "$FOUNDATIONS_DIR" "STEP 2: Deploy Foundations"
fi

if [ "$FOUNDATION_ONLY" = false ]; then
    cleanup_code_interpreter "$APP_INFRA_DIR"
    run_terraform "$APP_INFRA_DIR" "STEP 3: Deploy App-Infra"
fi

# ============================================================================
# Display outputs
# ============================================================================
print_header "DEPLOYMENT COMPLETE"

if [ "$APP_INFRA_ONLY" = false ]; then
    echo "--- Foundations Outputs ---"
    terraform -chdir="$FOUNDATIONS_DIR" output
    echo ""
fi

if [ "$FOUNDATION_ONLY" = false ]; then
    echo "--- App-Infra Outputs ---"
    terraform -chdir="$APP_INFRA_DIR" output
    echo ""
fi

print_info "Next steps:"
echo ""

# Show appropriate next steps based on what was deployed
if [ "$FOUNDATION_ONLY" = true ]; then
    echo "1. Deploy app-infra:"
    echo "   make deploy-app-infra ENV=$ENVIRONMENT"
    echo "   OR"
    echo "   scripts/deploy-backend.sh --environment $ENVIRONMENT --app-infra-only"
    echo ""
else
    # App-infra was deployed (either alone or with foundations)
    echo "1. Deploy the web application to EC2:"
    echo "   make deploy-webapp ENV=$ENVIRONMENT"
    echo "   OR"
    echo "   scripts/deploy-webapp-ec2.sh --environment $ENVIRONMENT"
    echo ""
    echo "2. Access the application via CloudFront:"
    CLOUDFRONT_DOMAIN=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cloudfront/domain" || echo "")
    echo "   https://$CLOUDFRONT_DOMAIN"
    echo ""
    print_warning "Note: EC2 instances may take 5-10 minutes to become healthy."
fi

echo ""

exit 0
