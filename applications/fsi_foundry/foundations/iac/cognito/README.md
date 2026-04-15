# Cognito Authentication Infrastructure

Terraform module for deploying Cognito User Pool and Identity Pool for the FSI Foundry Testing Dashboard.

## What This Creates

- **Cognito User Pool**: Handles user sign-up and sign-in
- **User Pool Client**: App client for the React UI (no secret, public client)
- **Identity Pool**: Provides temporary AWS credentials for authenticated users
- **IAM Role**: Grants authenticated users permission to invoke AgentCore

## Prerequisites

- AWS CLI configured
- Terraform >= 1.0

## Deployment

```bash
cd platform/iac/cognito

# Initialize
terraform init

# Review
terraform plan

# Deploy
terraform apply
```

## Outputs

After deployment, you'll get:

```
user_pool_id          = "us-east-1_xxxxxxxxx"
user_pool_client_id   = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
identity_pool_id      = "us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
env_config            = "# Copy to .env.local..."
```

Use these values when deploying Amplify (`platform/iac/amplify/`).

## Creating Users

Users can self-register via the UI, or you can create them via CLI:

```bash
USER_POOL_ID=$(terraform output -raw user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password "TempPass123!"
```

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `environment` | Environment name | `dev` |
| `agentcore_runtime_arn` | Restrict to specific runtime | `""` (allows all) |

## Cleanup

```bash
terraform destroy
```

Note: This will invalidate all user sessions and delete all users.
