# RDS Module with Secrets Manager

This module creates an RDS PostgreSQL instance with credentials stored securely in AWS Secrets Manager.

## Features

- **Automatic password generation**: Uses Terraform's `random_password` resource
- **Secrets Manager integration**: Stores all database credentials securely
- **No plaintext passwords**: Password never appears in tfvars or state files (only in Secrets Manager)
- **Complete connection info**: Secret includes host, port, database name, username, and password

## Secret Structure

The Secrets Manager secret contains a JSON object with all connection details:

```json
{
  "HOST": "market-surveillance-db-dev.xxxxx.us-east-1.rds.amazonaws.com",
  "PORT": "5432",
  "DBNAME": "marketsurveillance",
  "USERNAME": "dbadmin",
  "PASSWORD": "randomly-generated-32-char-password",  # pragma: allowlist secret
  "ENGINE": "postgres",
  "ENDPOINT": "market-surveillance-db-dev.xxxxx.us-east-1.rds.amazonaws.com:5432"
}
```

## Usage

### In Terraform

```hcl
module "rds" {
  source = "./modules/rds"

  environment        = "dev"
  db_name            = "marketsurveillance"
  db_username        = "dbadmin"
  instance_class     = "db.t3.micro"
  subnet_ids         = ["subnet-xxx", "subnet-yyy"]
  security_group_ids = ["sg-xxx"]
  vpc_id             = "vpc-xxx"
  multi_az           = false
}

# Grant access to the secret
resource "aws_iam_role_policy" "app_db_access" {
  name = "database-access"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = module.rds.db_secret_arn
      }
    ]
  })
}
```

### In Application Code (Python)

```python
import boto3
import json

def get_db_credentials():
    """Retrieve database credentials from Secrets Manager"""
    client = boto3.client('secretsmanager')
    
    response = client.get_secret_value(
        SecretId='<your-secret-name-or-arn>'  # pragma: allowlist secret
    )
    
    return json.loads(response['SecretString'])

# Usage
creds = get_db_credentials()
connection_string = f"postgresql://{creds['USERNAME']}:{creds['PASSWORD']}@{creds['HOST']}:{creds['PORT']}/{creds['DBNAME']}"
```

### Using AWS CLI

```bash
# Get the secret ARN
SECRET_ARN=$(terraform output -raw db_secret_arn)

# Retrieve credentials
aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text | jq .

# Extract specific values
PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text | jq -r .PASSWORD)

HOST=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text | jq -r .HOST)
```

### Connect with psql

```bash
# Get credentials from Secrets Manager
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id market-surveillance-db-dev \
  --query SecretString \
  --output text)

HOST=$(echo $SECRET | jq -r .HOST)
PORT=$(echo $SECRET | jq -r .PORT)
DBNAME=$(echo $SECRET | jq -r .DBNAME)
USERNAME=$(echo $SECRET | jq -r .USERNAME)
PASSWORD=$(echo $SECRET | jq -r .PASSWORD)

# Connect
PGPASSWORD=$PASSWORD psql -h $HOST -p $PORT -U $USERNAME -d $DBNAME
```

## Outputs

| Output | Description |
|--------|-------------|
| `db_endpoint` | Full database endpoint (host:port) |
| `db_address` | Database hostname only |
| `db_port` | Database port (5432) |
| `db_name` | Database name |
| `db_secret_arn` | ARN of the Secrets Manager secret |
| `db_secret_name` | Name of the Secrets Manager secret |

## Security Best Practices

1. **IAM Permissions**: Grant least-privilege access to the secret
2. **VPC Isolation**: Database is in isolated subnets with no internet access
3. **Encryption**: Storage encryption enabled by default
4. **Rotation**: Consider enabling automatic secret rotation (not implemented yet)
5. **Audit**: Enable CloudTrail to log secret access

## Rotation (Future Enhancement)

To enable automatic password rotation:

```hcl
resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_lambda_arn = aws_lambda_function.rotate_secret.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
```

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Environment name | Required |
| `db_name` | Database name | `marketsurveillance` |
| `db_username` | Master username | `dbadmin` |
| `instance_class` | RDS instance type | `db.t3.micro` |
| `engine_version` | PostgreSQL version | `15` |
| `allocated_storage` | Storage in GB | `20` |
| `multi_az` | Enable Multi-AZ | `false` |
| `backup_retention_period` | Backup retention days | `7` |

## Migration from Plaintext Passwords

If you're migrating from plaintext passwords in tfvars:

1. **Backup current password** (if you need to keep it)
2. **Apply this module** - it will generate a new password
3. **Update applications** to read from Secrets Manager
4. **Remove password from tfvars** and version control

The database password will change during migration. Plan accordingly.

## Cost

- **Secrets Manager**: $0.40/month per secret + $0.05 per 10,000 API calls
- **RDS**: Standard RDS pricing applies

## Troubleshooting

### Secret not found

```bash
# List all secrets
aws secretsmanager list-secrets \
  --query 'SecretList[?contains(Name, `market-surveillance`)].Name'
```

### Permission denied

Ensure your IAM role has `secretsmanager:GetSecretValue` permission:

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:*:*:secret:market-surveillance-db-*"
}
```

### Connection refused

Check security group rules allow traffic from your application to RDS port 5432.
