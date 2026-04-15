# Lambda Module - Market Surveillance Backend Functions

## Overview

This module provisions AWS Lambda functions that power the Market Surveillance Web Application backend. It creates two Lambda functions with their dependencies, IAM roles, and VPC configurations.

## Lambda Functions

### 1. Alert API Lambda (`alert_api.py`)
**Purpose**: Manages alert investigation data in DynamoDB

**Handles**:
- Conversation history (chat messages between users and AI agent)
- Investigation summaries (findings, conclusions, audit trails)

**Data Store**: DynamoDB tables
- `market-surveillance-alert-conversations-{env}`
- `market-surveillance-alert-summaries-{env}`

**Runtime**: Python 3.13  
**Memory**: 256 MB  
**Timeout**: 30 seconds

---

### 2. Data API Lambda (`data_api.py`)
**Purpose**: Queries alert and trade data from PostgreSQL RDS

**Handles**:
- Alert listings and details
- Account information
- Product/security information
- Customer trades
- Related flagged trades

**Data Store**: RDS PostgreSQL
- Database: `marketsurveillance`
- Credentials: AWS Secrets Manager

**Runtime**: Python 3.13  
**Memory**: 512 MB  
**Timeout**: 30 seconds  
**Dependencies**: `psycopg2-binary` (PostgreSQL driver)

## Architecture

```
API Gateway
    ├── /conversations, /summaries → Alert API Lambda → DynamoDB
    └── /alerts/* → Data API Lambda → RDS PostgreSQL (via VPC)
```

## Features

- **Automatic Dependency Packaging**: Python dependencies installed during Terraform deployment
- **VPC Integration**: Lambda functions run in private subnets for RDS access
- **IAM Permissions**: Least-privilege access to DynamoDB, Secrets Manager, and CloudWatch
- **CORS Support**: All responses include CORS headers
- **Connection Pooling**: Database connections cached across invocations
- **Error Handling**: Comprehensive error handling with CloudWatch logging

## Inputs

| Name | Description | Type | Required |
|------|-------------|------|----------|
| environment | Environment name | string | yes |
| dynamodb_table_arns | ARNs of DynamoDB tables | list(string) | yes |
| conversations_table_name | Conversations table name | string | yes |
| summaries_table_name | Summaries table name | string | yes |
| db_secret_arn | RDS credentials secret ARN | string | yes |
| db_secret_name | RDS credentials secret name | string | yes |
| enable_vpc | Enable VPC configuration | bool | no |
| vpc_subnet_ids | Private subnet IDs | list(string) | no |
| vpc_security_group_ids | Security group IDs | list(string) | no |

## Outputs

| Name | Description |
|------|-------------|
| alert_api_function_name | Alert API Lambda function name |
| alert_api_function_arn | Alert API Lambda ARN |
| alert_api_invoke_arn | Alert API invoke ARN (for API Gateway) |
| data_api_function_name | Data API Lambda function name |
| data_api_function_arn | Data API Lambda ARN |
| data_api_invoke_arn | Data API invoke ARN (for API Gateway) |
| lambda_execution_role_arn | Shared IAM role ARN |

## Deployment Process

### Alert API Lambda
1. Zip `alert_api.py` (no external dependencies)
2. Deploy to AWS Lambda
3. Configure environment variables (table names)

### Data API Lambda
1. Install Python dependencies: `pip install -r requirements.txt`
2. Copy `data_api.py` to package directory
3. Zip entire package (code + dependencies)
4. Deploy to AWS Lambda
5. Configure environment variables (DB secret name)
6. Attach to VPC for RDS access

## IAM Permissions

### Alert API Lambda
- DynamoDB: GetItem, PutItem, UpdateItem, Query, Scan
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

### Data API Lambda
- Secrets Manager: GetSecretValue (for DB credentials)
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
- VPC: CreateNetworkInterface, DescribeNetworkInterfaces, DeleteNetworkInterface

## Environment Variables

### Alert API
- `ENVIRONMENT`: Environment name (dev, staging, prod)
- `CONVERSATIONS_TABLE`: DynamoDB conversations table name
- `SUMMARIES_TABLE`: DynamoDB summaries table name

### Data API
- `ENVIRONMENT`: Environment name
- `DB_SECRET_NAME`: Secrets Manager secret name for RDS credentials

## VPC Configuration

**Data API Lambda** requires VPC access to connect to RDS:
- **Subnets**: Private subnets with NAT gateway access
- **Security Group**: Allows outbound to RDS on port 5432
- **RDS Security Group**: Allows inbound from Lambda security group

**Alert API Lambda** does not require VPC (accesses DynamoDB via AWS endpoints)

## Monitoring

### CloudWatch Logs
- `/aws/lambda/market-surveillance-alert-api-{env}`
- `/aws/lambda/market-surveillance-data-api-{env}`

### Key Metrics
- Invocations
- Duration
- Errors
- Throttles
- Concurrent executions

## Usage

```hcl
module "lambda" {
  source = "./modules/lambda"

  environment              = "dev"
  dynamodb_table_arns      = [aws_dynamodb_table.conversations.arn, aws_dynamodb_table.summaries.arn]
  conversations_table_name = aws_dynamodb_table.conversations.name
  summaries_table_name     = aws_dynamodb_table.summaries.name
  db_secret_arn            = module.rds.db_secret_arn
  db_secret_name           = module.rds.db_secret_name
  enable_vpc               = true
  vpc_subnet_ids           = module.vpc.private_subnets
  vpc_security_group_ids   = [aws_security_group.lambda.id]
}
```

## Troubleshooting

### Data API Connection Issues
- Verify Lambda is in correct VPC subnets
- Check security group allows outbound to RDS
- Verify RDS security group allows inbound from Lambda
- Check DB secret exists and is accessible

### Alert API DynamoDB Errors
- Verify table names are correct
- Check IAM permissions for DynamoDB access
- Review CloudWatch logs for specific errors

### Timeout Issues
- Increase Lambda timeout (max 15 minutes)
- Optimize database queries
- Check for connection pooling issues

### Cold Start Performance
- Consider provisioned concurrency for production
- Optimize package size (remove unused dependencies)
- Use Lambda layers for shared dependencies

## Notes

- **Dependency Installation**: Happens automatically during `terraform apply`
- **Package Directory**: `data_api_package/` is a build artifact (add to .gitignore)
- **Python Version**: 3.13 (ensure local pip matches for dependency compatibility)
- **Connection Caching**: Database connections persist across warm invocations
