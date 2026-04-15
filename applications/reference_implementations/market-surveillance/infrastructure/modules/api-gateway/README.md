# API Gateway Module - Market Surveillance Web Application

## Overview

This module creates a REST API Gateway that serves as the backend API for the Market Surveillance Web Application. It provides two main categories of endpoints for alert investigation and data retrieval.

### 1. Alert Investigation APIs (Alert API Lambda)

These endpoints manage conversation history and investigation summaries stored in DynamoDB:

- **GET /conversations/{alertId}/{userId}** - Retrieve conversation history for a specific alert and user
- **POST /conversations** - Create or update conversation messages
- **GET /summaries/{alertId}** - Get the latest investigation summary for an alert
- **GET /summaries/{alertId}/history** - Get historical summaries for an alert
- **POST /summaries** - Create or update investigation summaries

### 2. Alert Data APIs (Data API Lambda)

These endpoints query alert and trade data from PostgreSQL RDS:

- **GET /alerts** - List all alerts with optional filtering (status, ISIN, account)
- **GET /alerts/{alertId}** - Get detailed alert information
- **GET /alerts/{alertId}/account** - Get account details for an alert
- **GET /alerts/{alertId}/product** - Get product/security details for an alert
- **GET /alerts/{alertId}/customer-trade** - Get the customer trade that triggered the alert
- **GET /alerts/{alertId}/related-trades** - Get related flagged trades

## Architecture

```
Web Application (Next.js)
    ↓
CloudFront (WAF protected)
    ↓
API Gateway (this module)
    ├── /conversations, /summaries → Alert API Lambda → DynamoDB
    └── /alerts/* → Data API Lambda → RDS PostgreSQL

Note: Chat streaming goes directly: Web App → Next.js API Route → AgentCore Runtime
```

## Features

- **Authentication**: Cognito User Pool authorization on all endpoints
- **CORS**: Full CORS support with OPTIONS preflight for all endpoints
- **Throttling**: Configurable rate limiting to prevent abuse
- **Logging**: CloudWatch logs for monitoring and debugging
- **AWS_PROXY Integration**: Lambda responses pass through directly with CORS headers
- **Automatic Deployment**: Triggers redeploy on any route or integration change

## CORS Configuration

All endpoints support CORS with:
- **Origin**: `*` (all origins allowed)
- **Headers**: `Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token`
- **Methods**: Varies by endpoint (GET, POST, OPTIONS)

CORS is implemented at two levels:
1. **OPTIONS methods** (preflight) - MOCK integrations returning CORS headers
2. **Lambda responses** - Both Lambda functions include CORS headers in all responses

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| environment | Environment name (dev, staging, prod) | string | - | yes |
| alert_api_lambda_invoke_arn | Invoke ARN for Alert API Lambda | string | "" | no |
| data_api_lambda_invoke_arn | Invoke ARN for Data API Lambda | string | "" | no |
| cognito_user_pool_arn | Cognito User Pool ARN for authorization | string | "" | no |
| throttling_rate_limit | Requests per second limit | number | 100 | no |
| throttling_burst_limit | Burst limit | number | 50 | no |
| enable_logging | Enable CloudWatch logging | bool | true | no |
| log_retention_days | Days to retain logs | number | 30 | no |
| stage_name | API stage name (defaults to environment) | string | "" | no |

## Outputs

| Name | Description |
|------|-------------|
| api_id | REST API ID |
| api_arn | REST API ARN |
| api_endpoint | Full API invoke URL (e.g., https://xxx.execute-api.us-east-1.amazonaws.com/dev) |
| api_domain | API domain for CloudFront origin |
| stage_name | Deployment stage name |
| execution_arn | API execution ARN for Lambda permissions |

## Usage

```hcl
module "api_gateway" {
  source = "./modules/api-gateway"

  environment                 = "dev"
  alert_api_lambda_invoke_arn = module.lambda.alert_api_invoke_arn
  data_api_lambda_invoke_arn  = module.lambda.data_api_invoke_arn
  cognito_user_pool_arn       = module.cognito.user_pool_arn
  throttling_rate_limit       = 100
  throttling_burst_limit      = 50
  enable_logging              = true
}
```

## API Endpoints Reference

### Conversations API

| Method | Path | Lambda | Purpose |
|--------|------|--------|---------|
| GET | /conversations/{alertId}/{userId} | alert_api | Get conversation history |
| POST | /conversations | alert_api | Create/update conversation |
| OPTIONS | /conversations | MOCK | CORS preflight |
| OPTIONS | /conversations/{alertId}/{userId} | MOCK | CORS preflight |

### Summaries API

| Method | Path | Lambda | Purpose |
|--------|------|--------|---------|
| GET | /summaries/{alertId} | alert_api | Get latest summary |
| GET | /summaries/{alertId}/history | alert_api | Get summary history |
| POST | /summaries | alert_api | Create/update summary |
| OPTIONS | /summaries | MOCK | CORS preflight |
| OPTIONS | /summaries/{alertId} | MOCK | CORS preflight |
| OPTIONS | /summaries/{alertId}/history | MOCK | CORS preflight |

### Alerts Data API

| Method | Path | Lambda | Purpose |
|--------|------|--------|---------|
| GET | /alerts | data_api | List alerts with filters |
| GET | /alerts/{alertId} | data_api | Get alert details |
| GET | /alerts/{alertId}/account | data_api | Get account info |
| GET | /alerts/{alertId}/product | data_api | Get product info |
| GET | /alerts/{alertId}/customer-trade | data_api | Get customer trade |
| GET | /alerts/{alertId}/related-trades | data_api | Get related trades |
| OPTIONS | /alerts | MOCK | CORS preflight |
| OPTIONS | /alerts/{alertId} | MOCK | CORS preflight |
| OPTIONS | /alerts/{alertId}/account | MOCK | CORS preflight |
| OPTIONS | /alerts/{alertId}/product | MOCK | CORS preflight |
| OPTIONS | /alerts/{alertId}/customer-trade | MOCK | CORS preflight |
| OPTIONS | /alerts/{alertId}/related-trades | MOCK | CORS preflight |

## Security

- **Authentication**: All non-OPTIONS endpoints require Cognito JWT tokens
- **Authorization**: Cognito User Pool authorizer validates tokens
- **Rate Limiting**: Throttling prevents API abuse
- **CloudWatch Logs**: All requests logged for audit trails
- **WAF Protection**: Additional protection via CloudFront WAF
- **VPC Integration**: Lambda functions run in private VPC subnets

## Monitoring

### CloudWatch Logs
Logs are created at: `/aws/apigateway/market-surveillance-api-{environment}`

### Key Metrics to Monitor
- **4XXError** - Client errors (authentication, validation)
- **5XXError** - Server errors (Lambda failures, timeouts)
- **Count** - Total request count
- **Latency** - Response time
- **IntegrationLatency** - Lambda execution time

### Alarms to Set Up
- High 4XX error rate (authentication issues)
- High 5XX error rate (backend failures)
- High latency (performance degradation)
- Throttling events (rate limit exceeded)

## Deployment

The API Gateway automatically redeploys when any of these change:
- Route definitions
- Method configurations
- Integration settings
- CORS configurations

Deployment is managed by Terraform with `create_before_destroy` lifecycle to ensure zero downtime.

## Troubleshooting

### CORS Errors
- Verify OPTIONS methods exist for all endpoints
- Check Lambda functions return CORS headers
- Ensure `Access-Control-Allow-Origin: *` in responses
- Run `terraform apply` to deploy latest changes

### Authentication Errors (401/403)
- Verify Cognito User Pool ARN is correct
- Check JWT token is valid and not expired
- Ensure `Authorization: Bearer <token>` header is present

### Lambda Integration Errors (502/504)
- Check Lambda function logs in CloudWatch
- Verify Lambda has correct IAM permissions
- Ensure Lambda is in correct VPC subnets
- Check Lambda timeout settings (30s default)

### Rate Limiting (429)
- Increase `throttling_rate_limit` if needed
- Implement exponential backoff in client
- Consider per-user rate limiting

## Notes

- **Chat Streaming**: Real-time chat goes directly to AgentCore Runtime, not through this API Gateway
- **AWS_PROXY Integration**: Lambda responses pass through unchanged, including CORS headers
- **Stage Name**: Defaults to environment name if not specified
- **Cognito Authorization**: Can be disabled by setting `cognito_user_pool_arn = ""`
