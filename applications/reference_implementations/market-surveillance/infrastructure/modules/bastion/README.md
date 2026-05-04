# Bastion Host Module

This module creates a bastion host (jump server) for secure access to private resources like RDS databases.

## Features

- **Amazon Linux 2023** - Latest AL2023 AMI with automatic security updates
- **EC2 Instance Connect Endpoint (EICE)** - Secure shell access without SSH keys or public IPs
- **IMDSv2 Required** - Enhanced EC2 metadata security
- **Encrypted EBS Volume** - 30GB encrypted root volume
- **Pre-installed Tools**:
  - PostgreSQL 15 client
  - AWS CLI v2
  - jq (JSON processor)
  - Java 21 (Amazon Corretto)
  - EC2 Instance Connect

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    VPC                          │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Private Subnet                   │  │
│  │                                          │  │
│  │  ┌────────────────┐                     │  │
│  │  │ Bastion Host   │                     │  │
│  │  │ (t3.micro)     │────────────────┐    │  │
│  │  │ AL2023         │                │    │  │
│  │  └────────────────┘                │    │  │
│  │         │                          │    │  │
│  │         │                          │    │  │
│  │  ┌──────▼──────────┐               │    │  │
│  │  │ EC2 Instance    │               │    │  │
│  │  │ Connect         │               │    │  │
│  │  │ Endpoint (EICE) │               │    │  │
│  │  └─────────────────┘               │    │  │
│  └─────────┼──────────────────────────┼────┘  │
│            │                          │        │
│            │ PostgreSQL (5432)        │        │
│            ▼                          │        │
│  ┌──────────────────┐                │        │
│  │   RDS Database   │                │        │
│  │   (PostgreSQL)   │                │        │
│  └──────────────────┘                │        │
│                                       │        │
│                                       │        │
│                          HTTPS/HTTP  │        │
│                          (443/80)    │        │
│                                       ▼        │
│                              ┌──────────────┐  │
│                              │ NAT Gateway  │  │
│                              └──────────────┘  │
└─────────────────────────────────────────────────┘
                                      │
                                      │ Internet
                                      ▼
```

## Usage

### Connecting via EC2 Instance Connect

```bash
# Connect to bastion host
aws ec2-instance-connect ssh \
  --instance-id <instance-id> \
  --connection-type eice \
  --region us-east-1

# Or use the helper script
./scripts/start-ssh-session.sh ssh us-east-1 market-surveillance dev
```

### Connecting to RDS from Bastion

Once connected to the bastion host:

```bash
# Get database credentials from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id <secret-arn> \
  --region us-east-1 \
  --query SecretString \
  --output text)

# Extract credentials
DB_HOST=$(echo $DB_SECRET | jq -r .host)
DB_PORT=$(echo $DB_SECRET | jq -r .port)
DB_NAME=$(echo $DB_SECRET | jq -r .dbname)
DB_USER=$(echo $DB_SECRET | jq -r .username)
DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Connect to PostgreSQL
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME
```

### Port Forwarding

You can use EC2 Instance Connect to forward the RDS port to your local machine:

```bash
# Forward RDS port 5432 to local port 5432
aws ec2-instance-connect ssh \
  --instance-id <instance-id> \
  --connection-type eice \
  --region us-east-1 \
  --local-forwarding 5432:<rds-endpoint>:5432

# Or use the helper script
./scripts/aurora-port-forward.sh
```

Then connect from your local machine:
```bash
psql -h localhost -p 5432 -U <username> -d <database>
```

## Security Features

### Network Security
- Deployed in **private subnet** with NAT gateway for outbound internet access
- **No public IP address** - access only via SSM Session Manager
- Security group allows:
  - Outbound to RDS (port 5432)
  - Outbound HTTPS (port 443) for AWS APIs and package downloads
  - Outbound HTTP (port 80) for package downloads

### IAM Security
- **Least privilege IAM role** with only required permissions:
  - Read access to RDS secrets (optional)
- **No SSH keys required** - authentication via AWS IAM and EC2 Instance Connect

### Instance Security
- **IMDSv2 required** - prevents SSRF attacks
- **Encrypted EBS volume** - data at rest encryption
- **No detailed monitoring** - reduces costs (can be enabled if needed)
- **No termination protection** - can be easily recreated

## Cost Optimization

- **t3.micro instance** - ~$7.50/month (on-demand)
- **No detailed monitoring** - saves ~$2.10/month
- **Stop when not in use** - only pay for EBS storage (~$3/month for 30GB)

To stop the instance:
```bash
aws ec2 stop-instances --instance-ids <instance-id>
```

To start the instance:
```bash
aws ec2 start-instances --instance-ids <instance-id>
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| app_name | Application name | string | - | yes |
| environment | Environment name | string | - | yes |
| subnet_id | Subnet ID for bastion (private subnet) | string | - | yes |
| security_group_id | Security group ID for bastion | string | - | yes |
| instance_type | EC2 instance type | string | t3.micro | no |
| root_volume_size | Root EBS volume size in GB | number | 30 | no |
| db_secret_arn | RDS database secret ARN | string | "" | no |
| enable_detailed_monitoring | Enable detailed CloudWatch monitoring | bool | false | no |

## Outputs

| Name | Description |
|------|-------------|
| instance_id | Bastion host EC2 instance ID |
| instance_arn | Bastion host EC2 instance ARN |
| private_ip | Bastion host private IP address |
| iam_role_arn | Bastion host IAM role ARN |
| iam_role_name | Bastion host IAM role name |
| security_group_id | Security group ID attached to bastion |

## Prerequisites

- VPC with private subnets and NAT gateway
- EC2 Instance Connect Endpoint (EICE) in the VPC
- RDS database in the same VPC
- AWS CLI v2 with EC2 Instance Connect plugin:
  ```bash
  # Verify AWS CLI version
  aws --version  # Should be 2.x
  
  # EC2 Instance Connect is built into AWS CLI v2
  ```

## Troubleshooting

### Cannot connect via EC2 Instance Connect
- Verify the instance is in a private subnet with EICE configured
- Check that the IAM user/role has ec2-instance-connect:SendSSHPublicKey permission
- Ensure the security group allows the connection
- Verify AWS CLI v2 is installed (EC2 Instance Connect requires v2)

### Cannot connect to RDS
- Verify security group allows traffic from bastion to RDS on port 5432
- Check that RDS is in the same VPC
- Verify database credentials are correct

### Package installation fails
- Ensure NAT gateway is configured and routing is correct
- Check security group allows outbound HTTPS (443) and HTTP (80)
- Verify VPC DNS resolution is enabled

## References

- [EC2 Instance Connect Endpoint](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-using-eice.html)
- [Amazon Linux 2023](https://aws.amazon.com/linux/amazon-linux-2023/)
- [PostgreSQL Client Documentation](https://www.postgresql.org/docs/15/app-psql.html)
