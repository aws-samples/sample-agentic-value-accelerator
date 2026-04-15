# S3 Agent Configs Module

This module manages the S3 bucket for agent configuration files and uploads all configuration files from the agent-backend.

## Configuration Files

The following configuration files are automatically uploaded to S3:

### 1. Schema Config
- **Local Path**: `agent-backend/configs/schema_config.yaml`
- **S3 Key**: `configs/data-shape/schema_config.yaml`
- **Purpose**: Database schema definitions for data discovery agent
- **Type**: Data shape configuration

### 2. Orchestrator Config
- **Local Path**: `agent-backend/configs/orchestrator_config.yaml`
- **S3 Key**: `configs/orchestrator/orchestrator_config.yaml`
- **Purpose**: Multi-agent orchestration configuration
- **Type**: Orchestrator configuration

### 3. Rule Definition Config
- **Local Path**: `agent-backend/configs/rule_definition_config.yml`
- **S3 Key**: `configs/rules/rule_definition_config.yml`
- **Purpose**: Surveillance rule definitions
- **Type**: Rule definition

## S3 Bucket Structure

```
market-surveillance-agent-configs-{environment}-{account-id}/
├── configs/
│   ├── data-shape/
│   │   └── schema_config.yaml
│   ├── orchestrator/
│   │   └── orchestrator_config.yaml
│   ├── rules/
│   │   └── rule_definition_config.yml
```

## Features

### Security
- **Public Access Blocked**: All public access is blocked
- **Encryption**: Server-side encryption with AES256
- **Bucket Key**: Enabled for cost optimization

### Versioning
- **Enabled by default**: All config file changes are versioned
- **Lifecycle Policy**: Old versions are deleted after configurable days (default: 30)

### Automatic Updates
- **ETags**: Files are automatically re-uploaded when content changes
- **Content Type**: Proper YAML content type set for all files

## Usage

### Basic Usage

```terraform
module "s3_agent_configs" {
  source = "./modules/s3-agent-configs"

  environment = "dev"
}
```

### With Custom Settings

```terraform
module "s3_agent_configs" {
  source = "./modules/s3-agent-configs"

  environment                         = "prod"
  enable_versioning                   = true
  noncurrent_version_expiration_days  = 90
}
```

## Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `environment` | string | - | Environment name (dev, staging, prod) |
| `enable_versioning` | bool | `true` | Enable S3 bucket versioning |
| `noncurrent_version_expiration_days` | number | `30` | Days to keep old versions |

## Outputs

| Output | Description |
|--------|-------------|
| `bucket_id` | S3 bucket ID |
| `bucket_arn` | S3 bucket ARN |
| `bucket_name` | S3 bucket name |
| `schema_config_key` | S3 key for schema config |
| `orchestrator_config_key` | S3 key for orchestrator config |
| `rule_definition_config_key` | S3 key for rule definition config |
| `config_keys` | Map of all config file S3 keys |

## Accessing Config Files

### From Agent Code

```python
import boto3
import yaml

s3 = boto3.client('s3')
bucket = os.getenv('CONFIG_BUCKET')

# Load schema config
response = s3.get_object(
    Bucket=bucket,
    Key='configs/data-shape/schema_config.yaml'
)
schema_config = yaml.safe_load(response['Body'])

# Load orchestrator config
response = s3.get_object(
    Bucket=bucket,
    Key='configs/orchestrator/orchestrator_config.yaml'
)
orchestrator_config = yaml.safe_load(response['Body'])

# Load rule definition config
response = s3.get_object(
    Bucket=bucket,
    Key='configs/rules/rule_definition_config.yml'
)
rules = yaml.safe_load(response['Body'])

### From AWS CLI

```bash
# List all config files
aws s3 ls s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/ --recursive

# Download a specific config
aws s3 cp s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/data-shape/schema_config.yaml ./

# Download all configs
aws s3 sync s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/ ./configs/
```

## Updating Config Files

### Automatic Updates via Terraform

When you modify any config file in `agent-backend/configs/`, Terraform will automatically detect the change and re-upload the file:

```bash
# Edit a config file
vim agent-backend/configs/schema_config.yaml

# Apply changes
cd infrastructure
terraform apply -target=module.s3_agent_configs
```

### Manual Upload

```bash
# Upload a single file
aws s3 cp agent-backend/configs/schema_config.yaml \
  s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/data-shape/schema_config.yaml

# Upload all configs
aws s3 sync agent-backend/configs/ \
  s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/
```

## Adding New Config Files

To add a new config file:

1. **Create the config file** in `agent-backend/configs/`

2. **Add S3 object resource** in `main.tf`:
   ```terraform
   resource "aws_s3_object" "new_config" {
     bucket       = aws_s3_bucket.agent_configs.id
     key          = "configs/category/new_config.yaml"
     source       = "${path.root}/../agent-backend/configs/new_config.yaml"
     etag         = filemd5("${path.root}/../agent-backend/configs/new_config.yaml")
     content_type = "application/x-yaml"

     tags = {
       Name        = "new-config"
       Environment = var.environment
       Project     = "market-surveillance"
       ConfigType  = "category"
     }
   }
   ```

3. **Add output** in `outputs.tf`:
   ```terraform
   output "new_config_key" {
     description = "The S3 key for the new config file"
     value       = aws_s3_object.new_config.key
   }
   ```

4. **Update config_keys map** in `outputs.tf`:
   ```terraform
   output "config_keys" {
     value = {
       # ... existing configs
       new_config = aws_s3_object.new_config.key
     }
   }
   ```

5. **Apply changes**:
   ```bash
   terraform apply -target=module.s3_agent_configs
   ```

## IAM Permissions

The AgentCore Runtime execution role has read access to this bucket:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:GetObjectVersion",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::market-surveillance-agent-configs-*",
    "arn:aws:s3:::market-surveillance-agent-configs-*/*"
  ]
}
```

## Versioning and Rollback

### View File Versions

```bash
aws s3api list-object-versions \
  --bucket market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID> \
  --prefix configs/data-shape/schema_config.yaml
```

### Rollback to Previous Version

```bash
# Get the version ID from list-object-versions
VERSION_ID="abc123..."

# Download specific version
aws s3api get-object \
  --bucket market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID> \
  --key configs/data-shape/schema_config.yaml \
  --version-id $VERSION_ID \
  schema_config_backup.yaml

# Re-upload as current version
aws s3 cp schema_config_backup.yaml \
  s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/data-shape/schema_config.yaml
```

## Monitoring

### CloudWatch Metrics

S3 automatically provides metrics for:
- Number of requests
- Bytes downloaded/uploaded
- 4xx/5xx errors

### CloudTrail Logging

All S3 API calls are logged to CloudTrail for audit purposes.

## Cost Optimization

- **Bucket Key Enabled**: Reduces encryption costs
- **Lifecycle Policy**: Automatically deletes old versions
- **Small Files**: Config files are typically < 1MB each

Estimated monthly cost: < $1 for storage + minimal request costs

## Troubleshooting

### Config File Not Found

```bash
# Verify file exists in S3
aws s3 ls s3://market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>/configs/ --recursive

# Check IAM permissions
aws iam get-role-policy \
  --role-name market-surveillance-agentcore-role-dev \
  --policy-name market-surveillance-agentcore-s3-dev
```

### File Content Not Updating

```bash
# Check ETag to verify file changed
terraform state show module.s3_agent_configs.aws_s3_object.schema_config

# Force re-upload
terraform taint module.s3_agent_configs.aws_s3_object.schema_config
terraform apply -target=module.s3_agent_configs
```

### Access Denied Errors

1. Verify bucket policy allows access
2. Check IAM role has S3 read permissions
3. Ensure bucket is in the same region as the agent

## References

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Terraform AWS S3 Bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket)
- [Terraform AWS S3 Object](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_object)
