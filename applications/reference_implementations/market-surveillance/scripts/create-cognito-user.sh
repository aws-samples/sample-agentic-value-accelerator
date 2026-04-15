#!/bin/bash

# create-cognito-user.sh
# Creates a Cognito user that can sign in immediately (no email verification flow)
#
# Flow:
#   1. Discover User Pool ID from SSM Parameter Store
#   2. Create user with email as username, email verified, suppress invitation
#   3. Set permanent password (bypasses FORCE_CHANGE_PASSWORD state)

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
EMAIL=""
AWS_REGION="us-east-1"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Create a Cognito user that can sign in immediately.

OPTIONS:
    -e, --environment ENV    Environment name [default: dev]
    -m, --email EMAIL        User email address (required)
    -r, --region REGION      AWS region [default: us-east-1]
    -h, --help               Display this help message

ENVIRONMENT VARIABLES:
    COGNITO_USER_PASSWORD    Password for the new user (required).

EXAMPLES:
    # Set password via env var
    COGNITO_USER_PASSWORD='<YourSecurePassword>' $0 -e dev -m user@example.com

    # Or read password without echoing to terminal
    read -s COGNITO_USER_PASSWORD && export COGNITO_USER_PASSWORD
    $0 -e dev -m user@example.com

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
        -m|--email)
            EMAIL="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
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

# Resolve password
if [[ -z "${COGNITO_USER_PASSWORD:-}" ]]; then
    print_error "COGNITO_USER_PASSWORD environment variable is required."
    print_error "Set it before running this script:"
    echo ""
    echo "  COGNITO_USER_PASSWORD='YourP@ssw0rd' $0 -e <env> -m <email>"
    echo ""
    echo "  # Or read without echoing to terminal:"
    echo "  read -s COGNITO_USER_PASSWORD && export COGNITO_USER_PASSWORD"
    echo ""
    exit 1
fi
USER_PASSWORD="$COGNITO_USER_PASSWORD"

# Validate required inputs
if [[ -z "$EMAIL" ]]; then
    print_error "Email is required. Use -m or --email."
    echo ""
    usage
fi

# Validate email format
if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    print_error "Invalid email format: $EMAIL"
    exit 1
fi

# Confirmation prompt
print_header "Create Cognito User"
echo "  Environment:  $ENVIRONMENT"
echo "  Email:        $EMAIL"
echo "  Region:       $AWS_REGION"
echo ""
read -r -p "Proceed? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    print_info "Cancelled."
    exit 0
fi
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! aws sts get-caller-identity --no-cli-pager &> /dev/null; then
    print_error "AWS credentials are not configured or invalid."
    print_error "Please run 'aws configure' to set up your credentials."
    exit 1
fi

# ============================================================================
# Step 1: Discover infrastructure
# ============================================================================
print_header "STEP 1: Discover Infrastructure"

SSM_PATH="/market-surveillance/$ENVIRONMENT/foundations/cognito/user-pool-id"
print_info "Fetching User Pool ID from SSM: $SSM_PATH"

USER_POOL_ID=$(get_ssm_param "$SSM_PATH" || true)
if [[ -z "$USER_POOL_ID" ]]; then
    print_error "User Pool ID not found at SSM path: $SSM_PATH"
    print_error "Have you deployed foundations for the '$ENVIRONMENT' environment?"
    print_error "Run: ./scripts/deploy-backend.sh -e $ENVIRONMENT --foundation-only"
    exit 1
fi
print_info "User Pool ID: $USER_POOL_ID"

# Optionally fetch CloudFront domain for login URL
CLOUDFRONT_DOMAIN=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cloudfront/domain" || true)

# ============================================================================
# Step 2: Create user
# ============================================================================
print_header "STEP 2: Create User"

print_info "Creating user: $EMAIL"

CREATE_OUTPUT=""
if ! CREATE_OUTPUT=$(aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --region "$AWS_REGION" \
    --no-cli-pager 2>&1); then

    if echo "$CREATE_OUTPUT" | grep -q "UsernameExistsException"; then
        print_error "User '$EMAIL' already exists in the user pool."
        print_error "To reset their password, run:"
        echo ""
        echo "  aws cognito-idp admin-set-user-password \\"
        echo "    --user-pool-id $USER_POOL_ID \\"
        echo "    --username \"$EMAIL\" \\"
        echo "    --password '<NEW_PASSWORD>' \\"
        echo "    --permanent \\"
        echo "    --region $AWS_REGION"
        echo ""
        exit 1
    else
        print_error "Failed to create user: $CREATE_OUTPUT"
        exit 1
    fi
fi

print_info "User created successfully."

# ============================================================================
# Step 3: Set permanent password
# ============================================================================
print_header "STEP 3: Set Permanent Password"

print_info "Setting permanent password..."

SET_PW_OUTPUT=""
if ! SET_PW_OUTPUT=$(aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --password "$USER_PASSWORD" \
    --permanent \
    --region "$AWS_REGION" \
    --no-cli-pager 2>&1); then

    if echo "$SET_PW_OUTPUT" | grep -q "InvalidPasswordException"; then
        print_error "Password does not meet policy requirements."
        print_error "Password must be at least 8 characters and include:"
        print_error "  - Uppercase letter"
        print_error "  - Lowercase letter"
        print_error "  - Number"
        print_error "  - Symbol"
        exit 1
    else
        print_error "Failed to set password: $SET_PW_OUTPUT"
        exit 1
    fi
fi

print_info "Password set successfully."

# ============================================================================
# Success
# ============================================================================
print_header "USER CREATED SUCCESSFULLY"

echo "  +------------------------------------------+"
echo "  |  Credentials                             |"
echo "  +------------------------------------------+"
echo "  |  Email:    $EMAIL"
echo "  |  Password: (set via COGNITO_USER_PASSWORD)"
echo "  +------------------------------------------+"
echo ""

if [[ -n "$CLOUDFRONT_DOMAIN" ]]; then
    print_info "Login URL: https://$CLOUDFRONT_DOMAIN"
    echo ""
fi

exit 0
