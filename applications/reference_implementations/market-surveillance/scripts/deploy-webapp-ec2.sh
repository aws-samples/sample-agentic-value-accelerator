#!/bin/bash

# deploy-webapp-ec2.sh
# Builds and deploys the Next.js web application to EC2 via ECR
# Reads infrastructure outputs from SSM Parameter Store (no Terraform dependency)

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Change to repository root (parent of scripts directory)
cd "$SCRIPT_DIR/.."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
IMAGE_TAG="latest"
WEBAPP_DIR="trade-alerts-app"
SKIP_BUILD=false
SKIP_TERRAFORM=false

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

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build and deploy the Next.js web application to EC2 via ECR

OPTIONS:
    -e, --environment ENV         Environment name [default: dev]
    -t, --tag TAG                 Docker image tag [default: latest]
    --skip-build                  Skip Docker build (use existing image)
    --skip-terraform              Skip Terraform apply
    -h, --help                    Display this help message

EXAMPLES:
    # Deploy with default settings
    $0

    # Deploy to production with version tag
    $0 --environment prod --tag v1.0.0

    # Skip build and just update Terraform
    $0 --skip-build

EOF
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-terraform)
            SKIP_TERRAFORM=true
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

print_info "Starting EC2 web application deployment"
echo "Environment: $ENVIRONMENT"
echo "Image Tag: $IMAGE_TAG"
echo ""

# Check if webapp directory exists
if [ ! -d "$WEBAPP_DIR" ]; then
    print_error "Web application directory '$WEBAPP_DIR' not found"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install AWS CLI first."
    exit 1
fi

# Verify AWS credentials
if ! aws sts get-caller-identity --no-cli-pager &> /dev/null; then
    print_error "AWS credentials are not configured or invalid"
    print_error "Please run 'aws configure' to set up your credentials"
    exit 1
fi

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --no-cli-pager)
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

print_info "AWS Account ID: $AWS_ACCOUNT_ID"
print_info "AWS Region: $AWS_REGION"

# Get ECR repository URL from Parameter Store
print_info "Retrieving ECR repository URL from Parameter Store..."
ECR_REPO=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/app-infra/ecr/webapp-repository-url")

if [ -z "$ECR_REPO" ] || [[ "$ECR_REPO" == *"Warning"* ]] || [[ "$ECR_REPO" == *"Error"* ]]; then
    print_error "Failed to retrieve ECR repository URL from Parameter Store"
    print_error "Make sure the foundations and app-infra layers have been deployed"
    exit 1
fi

print_info "ECR Repository: $ECR_REPO"

# Build and push Docker image
if [ "$SKIP_BUILD" = false ]; then
    print_info "Building Docker image..."

    cd "$WEBAPP_DIR"

    # Authenticate Docker to ECR
    print_info "Authenticating Docker to ECR..."
    aws ecr get-login-password --region $AWS_REGION --no-cli-pager | \
        docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

    if [ $? -ne 0 ]; then
        print_error "Failed to authenticate Docker to ECR"
        exit 1
    fi

    # Build Docker image
    print_info "Building Docker image for linux/arm64 (this may take a few minutes)..."

    # Get environment variables from Parameter Store
    print_info "Retrieving environment configuration from Parameter Store..."
    COGNITO_USER_POOL_ID=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cognito/user-pool-id" || echo "")
    COGNITO_CLIENT_ID=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cognito/web-app-client-id" || echo "")
    API_ENDPOINT=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/app-infra/api-gateway/endpoint" || echo "")
    CLOUDFRONT_DOMAIN=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cloudfront/domain" || echo "")

    print_info "Build configuration:"
    echo "  AWS Region: $AWS_REGION"
    echo "  Cognito User Pool: $COGNITO_USER_POOL_ID"
    echo "  Cognito Client: $COGNITO_CLIENT_ID"
    echo "  API Endpoint: $API_ENDPOINT"
    echo "  CloudFront Domain: $CLOUDFRONT_DOMAIN"

    # Validate required variables
    if [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_CLIENT_ID" ] || [ -z "$API_ENDPOINT" ]; then
        print_error "Missing required environment variables from Parameter Store"
        print_error "Please ensure the foundations and app-infra layers have been deployed"
        exit 1
    fi

    # Ensure buildx is available
    if ! docker buildx version &> /dev/null; then
        print_error "docker buildx is not available. Please update Docker to a version that supports buildx."
        exit 1
    fi

    # Create builder if it doesn't exist
    if ! docker buildx inspect multiarch &> /dev/null; then
        print_info "Creating buildx builder..."
        docker buildx create --name multiarch --use
        docker buildx inspect --bootstrap
    else
        docker buildx use multiarch
    fi

    # Build for ARM64 (EC2 t4g architecture) and push with build args
    docker buildx build \
        --platform linux/arm64 \
        --push \
        --build-arg NEXT_PUBLIC_AWS_REGION="$AWS_REGION" \
        --build-arg NEXT_PUBLIC_COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
        --build-arg NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID="$COGNITO_CLIENT_ID" \
        --build-arg NEXT_PUBLIC_API_ENDPOINT="$API_ENDPOINT" \
        --build-arg NEXT_PUBLIC_CLOUDFRONT_DOMAIN="$CLOUDFRONT_DOMAIN" \
        -t $ECR_REPO:$IMAGE_TAG \
        .

    if [ $? -ne 0 ]; then
        print_error "Docker build failed"
        exit 1
    fi

    # Tag as latest if not already
    if [ "$IMAGE_TAG" != "latest" ]; then
        print_info "Tagging image as latest..."
        docker buildx build \
            --platform linux/arm64 \
            --push \
            --build-arg NEXT_PUBLIC_AWS_REGION="$AWS_REGION" \
            --build-arg NEXT_PUBLIC_COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
            --build-arg NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID="$COGNITO_CLIENT_ID" \
            --build-arg NEXT_PUBLIC_API_ENDPOINT="$API_ENDPOINT" \
            --build-arg NEXT_PUBLIC_CLOUDFRONT_DOMAIN="$CLOUDFRONT_DOMAIN" \
            -t $ECR_REPO:latest \
            .
    fi

    print_info "Docker image pushed successfully"

    cd ..
else
    print_warning "Skipping Docker build (--skip-build flag specified)"
fi

# Update Auto Scaling Group to use new image
if [ "$SKIP_TERRAFORM" = false ]; then
    print_info "Updating Auto Scaling Group..."

    # Get ASG name from Parameter Store
    ASG_NAME=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/app-infra/ec2/webapp-asg-name")

    if [ -n "$ASG_NAME" ] && [[ "$ASG_NAME" != *"Warning"* ]] && [[ "$ASG_NAME" != *"Error"* ]]; then
        print_info "Auto Scaling Group: $ASG_NAME"

        # Trigger instance refresh to deploy new image
        print_info "Starting instance refresh..."
        aws autoscaling start-instance-refresh \
            --auto-scaling-group-name "$ASG_NAME" \
            --preferences '{"MinHealthyPercentage": 50, "InstanceWarmup": 300}' \
            --region $AWS_REGION \
            --no-cli-pager

        if [ $? -eq 0 ]; then
            print_info "Instance refresh started successfully"
            print_info "New instances will be launched with the updated Docker image"
            print_info "This process may take 5-10 minutes"
        else
            print_warning "Failed to start instance refresh"
            print_warning "You may need to manually terminate instances to deploy the new image"
        fi
    else
        print_warning "Could not retrieve Auto Scaling Group name"
        print_warning "Instances will pull the new image on next launch"
    fi

    # Invalidate CloudFront cache
    print_info "Invalidating CloudFront cache..."
    CF_DIST_ID=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cloudfront/distribution-id")

    if [ -n "$CF_DIST_ID" ] && [[ "$CF_DIST_ID" != *"Warning"* ]] && [[ "$CF_DIST_ID" != *"Error"* ]] && [[ "$CF_DIST_ID" != "null" ]]; then
        print_info "CloudFront Distribution ID: $CF_DIST_ID"

        INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
            --distribution-id "$CF_DIST_ID" \
            --paths "/*" \
            --region us-east-1 \
            --no-cli-pager 2>&1)

        if [ $? -eq 0 ]; then
            INVALIDATION_ID=$(echo "$INVALIDATION_OUTPUT" | grep -o '"Id": "[^"]*"' | head -1 | cut -d'"' -f4)
            print_info "CloudFront cache invalidation created successfully"
            if [ -n "$INVALIDATION_ID" ]; then
                print_info "Invalidation ID: $INVALIDATION_ID"
            fi
            print_info "Note: It may take a few minutes for the invalidation to complete"
        else
            print_warning "Failed to create CloudFront cache invalidation"
            print_warning "Users may see cached content until the TTL expires"
        fi
    else
        print_warning "Could not retrieve CloudFront distribution ID"
        print_warning "Skipping cache invalidation"
    fi
else
    print_warning "Skipping Terraform operations (--skip-terraform flag specified)"
fi

# Display deployment information
echo ""
echo "=========================================="
echo "      DEPLOYMENT COMPLETE"
echo "=========================================="
echo "Docker Image: $ECR_REPO:$IMAGE_TAG"
echo ""

# Get ALB DNS name from Parameter Store
ALB_DNS=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/alb/dns-name")
if [ -n "$ALB_DNS" ] && [[ "$ALB_DNS" != *"Warning"* ]] && [[ "$ALB_DNS" != *"Error"* ]]; then
    echo "ALB Endpoint: http://$ALB_DNS"
fi

# Get CloudFront domain from Parameter Store
CF_DOMAIN=$(get_ssm_param "/market-surveillance/$ENVIRONMENT/foundations/cloudfront/domain")
if [ -n "$CF_DOMAIN" ] && [[ "$CF_DOMAIN" != *"Warning"* ]] && [[ "$CF_DOMAIN" != *"Error"* ]]; then
    echo "CloudFront URL: https://$CF_DOMAIN"
fi

echo "=========================================="
echo ""

print_info "Deployment complete!"
print_info "Monitor the deployment:"
echo "  - CloudWatch Logs: aws logs tail /aws/ec2/webapp-$ENVIRONMENT --follow"
echo "  - ASG Status: aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG_NAME"
echo "  - Target Health: aws elbv2 describe-target-health --target-group-arn <target-group-arn>"

exit 0
