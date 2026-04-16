# Control Plane Infrastructure

This directory contains Terraform configuration for deploying the AVA Control Plane infrastructure on AWS.

## Architecture

The infrastructure includes:

- **API Gateway**: HTTP API with VPC Link for private integration
- **ECS Fargate**: Containerized backend service with auto-scaling
- **DynamoDB**: Application Catalog and Deployment Metadata tables
- **S3**: Project archives and frontend static hosting
- **Step Functions**: CI/CD deployment pipeline orchestration (Validate → Package → Build → Monitor → Capture → Record)
- **CodeBuild**: IaC execution in isolated Docker containers (Terraform, CDK, CloudFormation)
- **EventBridge**: Deployment lifecycle events with dead-letter queue
- **State Backend**: Terraform remote state (S3 + DynamoDB locking) per deployment
- **CloudFront**: CDN for frontend distribution
- **Cognito**: User authentication and authorization
- **CloudWatch**: Logs, metrics, alarms, and dashboards
- **ECR**: Container registry for backend Docker images
- **VPC** (Optional): Can use existing VPC or create new one

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- Docker (for building container images)
- An AWS account with necessary permissions

## Quick Start

### 1. Configure Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required
AWS_REGION=us-east-1
ENVIRONMENT=dev

# Optional - Use existing VPC (recommended for faster deployment)
VPC_ID=vpc-xxxxx
PUBLIC_SUBNET_IDS=subnet-xxx,subnet-yyy
PRIVATE_SUBNET_IDS=subnet-aaa,subnet-bbb

# Optional - Custom domain
DOMAIN_NAME=ava-platform.example.com
HOSTED_ZONE_ID=Z1234567890ABC
```

### 2. Configure Terraform Variables

Copy the example tfvars file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values.

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Review the Plan

```bash
terraform plan
```

### 5. Deploy Infrastructure

```bash
terraform apply
```

This will create all necessary AWS resources. The deployment typically takes 15-20 minutes.

## Using Existing VPC

To use an existing VPC (recommended to avoid long VPC creation time):

1. Set these variables in your `.env` or `terraform.tfvars`:

```hcl
vpc_id             = "vpc-xxxxx"
public_subnet_ids  = ["subnet-xxxxx", "subnet-yyyyy"]
private_subnet_ids = ["subnet-aaaaa", "subnet-bbbbb"]
```

2. Leave them empty to create a new VPC:

```hcl
vpc_id             = ""
public_subnet_ids  = []
private_subnet_ids = []
```

## Building and Deploying Backend Container

After infrastructure is deployed:

1. Get ECR repository URL from Terraform outputs:

```bash
export ECR_REPO=$(terraform output -raw ecr_repository_url)
```

2. Authenticate Docker to ECR:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO
```

3. Build and push Docker image:

```bash
cd ../backend
docker build -t control-plane-backend .
docker tag control-plane-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

4. Update ECS service to use the new image (automatic if using `latest` tag).

## Deploying Frontend

After infrastructure is deployed:

1. Get S3 bucket and CloudFront distribution ID:

```bash
export FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
export CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
```

2. Build frontend:

```bash
cd ../frontend
npm install
npm run build
```

3. Deploy to S3:

```bash
aws s3 sync dist/ s3://$FRONTEND_BUCKET/
```

4. Invalidate CloudFront cache:

```bash
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
```

## Module Structure

```
infrastructure/
├── main.tf                   # Main orchestration
├── variables.tf              # Input variables
├── outputs.tf                # Output values
├── providers.tf              # Provider configuration
├── .env.example              # Environment variables template
├── terraform.tfvars.example  # Terraform variables template
└── modules/
    ├── networking/           # VPC, subnets, security groups
    ├── dynamodb/             # DynamoDB tables
    ├── s3/                   # S3 buckets
    ├── ecr/                  # ECR repository
    ├── ecs/                  # ECS cluster, service, tasks
    ├── api_gateway/          # API Gateway with VPC Link
    ├── step_functions/       # Step Functions CI/CD pipeline
    ├── codebuild/            # CodeBuild for IaC execution
    ├── eventbridge/          # EventBridge deployment events
    ├── state_backend/        # Terraform remote state (S3 + DynamoDB)
    ├── cognito/              # Cognito user pool and identity pool
    ├── cloudfront/           # CloudFront distribution
    └── observability/        # CloudWatch dashboards and alarms
```

## Important Outputs

After deployment, Terraform outputs key information:

```bash
# Get all outputs
terraform output

# Get specific outputs
terraform output api_endpoint
terraform output frontend_url
terraform output cognito_user_pool_id
terraform output ecr_repository_url
```

## Cleanup

To destroy all infrastructure:

```bash
terraform destroy
```

**Warning**: This will delete all resources including data in DynamoDB and S3.

## Cost Considerations

This infrastructure uses the following AWS services that incur costs:

- **ECS Fargate**: Pay per vCPU and memory per hour
- **API Gateway**: Pay per request
- **CloudFront**: Pay per data transfer
- **DynamoDB**: On-demand billing
- **S3**: Pay per GB stored and data transfer
- **Step Functions**: Pay per state transition
- **CloudWatch**: Logs and metrics storage

Estimated monthly cost for dev environment: $50-100 (with minimal traffic)

## Troubleshooting

### ECS Tasks Not Starting

Check CloudWatch logs:

```bash
aws logs tail /ecs/ava-control-plane-dev --follow
```

### API Gateway 502 Errors

Check:
1. ECS service is running
2. Target group health checks are passing
3. VPC Link is active

### CloudFront Not Serving Updated Content

Invalidate cache:

```bash
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

## Remote State Management

For production, enable remote state:

1. Uncomment the backend configuration in `main.tf`:

```hcl
backend "s3" {
  bucket         = "ava-terraform-state"
  key            = "control-plane/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "terraform-state-lock"
}
```

2. Create the S3 bucket and DynamoDB table:

```bash
aws s3api create-bucket --bucket ava-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

3. Re-initialize Terraform:

```bash
terraform init -migrate-state
```

## Security Notes

- All S3 buckets have public access blocked
- ECS tasks run in private subnets
- API Gateway uses VPC Link for private integration
- DynamoDB tables use encryption at rest
- CloudWatch logs are retained for 7 days
- Cognito enforces strong password policy

## Support

For issues or questions:
- Check CloudWatch dashboards for metrics
- Review CloudWatch logs for errors
- Check GitHub issues: https://github.com/anthropics/ava
