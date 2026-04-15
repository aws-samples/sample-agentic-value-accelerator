# Bastion Host Connection Scripts

Scripts for connecting to the bastion host and setting up port forwarding to Aurora RDS using EC2 Instance Connect Endpoint (EICE).

## Prerequisites

- AWS CLI v2 installed and configured
- Appropriate AWS credentials with permissions to:
  - Describe EC2 instances
  - Use EC2 Instance Connect
  - Access Terraform outputs (for `aurora-port-forward.sh`)

## Scripts

### 1. start-ssh-session.sh

General-purpose script for SSH connections and port forwarding via EC2 Instance Connect.

**Usage:**
```bash
./start-ssh-session.sh <MODE> <REGION> <APP_NAME> <ENV_NAME> [<LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>]
```

**Modes:**
- `ssh` - Start an interactive SSH session
- `pf` - Set up port forwarding (requires additional parameters)

**Examples:**

Start an SSH session:
```bash
./start-ssh-session.sh ssh us-east-1 market-surveillance dev
```

Port forward to a database:
```bash
./start-ssh-session.sh pf us-east-1 market-surveillance dev 5432 my-db.us-east-1.rds.amazonaws.com 5432
```

### 2. aurora-port-forward.sh

Convenience script that automatically detects the Aurora RDS endpoint and sets up port forwarding.

**Usage:**
```bash
./aurora-port-forward.sh
```

**Environment Variables:**
- `AWS_REGION` - AWS region (default: us-east-1)
- `APP_NAME` - Application name (default: market-surveillance)
- `ENV_NAME` - Environment name (default: dev)
- `LOCAL_PORT` - Local port to forward (default: 5432)

**Example:**
```bash
# Use defaults
./aurora-port-forward.sh

# Custom local port
LOCAL_PORT=5490 ./aurora-port-forward.sh
```

Once connected, you can access the database at `localhost:5432` (or your custom port).

### 3. diagnose-bastion.sh

Diagnostic script to troubleshoot EC2 Instance Connect issues with the bastion host.

**Usage:**
```bash
./diagnose-bastion.sh
```

This script checks:
- Bastion instance status and configuration
- EC2 Instance Connect Endpoint (EICE) configuration
- Security group rules
- RDS connectivity permissions
- Instance age (warns if too new)
- Attempts a test connection

### 4. check-bastion-logs.sh

View the bastion host console output to verify user data script completion.

**Usage:**
```bash
./check-bastion-logs.sh
```

This script displays the last 100 lines of console output. Look for:
- "Bastion host setup complete" - indicates successful initialization
- Any error messages from cloud-init or package installation
- EC2 Instance Connect installation status

**Note:** Console output can be delayed. For real-time logs, use CloudWatch (see below).

### 5. view-bastion-cloudwatch-logs.sh

View bastion host logs from CloudWatch Logs (real-time, more reliable than console output).

**Usage:**
```bash
./view-bastion-cloudwatch-logs.sh
```

This script shows logs from CloudWatch including:
- `/var/log/user-data.log` - User data script execution
- `/var/log/messages` - System messages
- `/var/log/cloud-init.log` - Cloud-init logs
- `/var/log/cloud-init-output.log` - Cloud-init output

**Advantages over console output:**
- Real-time log streaming
- Logs persist even after instance termination
- Better for troubleshooting ongoing issues
- Can tail logs with `--follow` flag

### 6. create-cognito-user.sh

Creates a Cognito user that can sign in immediately, skipping the email invitation and temporary password flow.

**Usage:**
```bash
./create-cognito-user.sh -e <ENVIRONMENT> -m <EMAIL> [-r <REGION>]
```

**Options:**
- `-e, --environment ENV` - Environment name (required)
- `-m, --email EMAIL` - User email address (required)
- `-r, --region REGION` - AWS region (default: us-east-1)
- `-h, --help` - Display help

**Environment Variables:**
- `COGNITO_USER_PASSWORD` - Password for the new user (required).

**Examples:**
```bash
# Set password via env var
COGNITO_USER_PASSWORD='<YourSecurePassword>' 
./create-cognito-user.sh -e dev -m user@example.com
```

**Prerequisites:**
- AWS CLI v2 installed and configured
- IAM permissions: `cognito-idp:AdminCreateUser` and `cognito-idp:AdminSetUserPassword`
- Foundations infrastructure deployed (Cognito User Pool must exist)

## Troubleshooting

### "Unable to connect to target" Error

This is the most common error with EC2 Instance Connect. Try these steps in order:

1. **Check if the instance is too new:**
   ```bash
   ./check-bastion-logs.sh
   ```
   Look for "Bastion host setup complete" at the end. If not present, wait 2-3 minutes for user data to finish.

2. **Run the diagnostic script:**
   ```bash
   ./diagnose-bastion.sh
   ```
   This will check all configuration and identify issues.

3. **Wait for bastion initialization:**
   The bastion instance needs 2-3 minutes after creation for the user data script to install EC2 Instance Connect. If the instance was just created, wait and try again.

4. **Verify user data completed successfully:**
   ```bash
   ./check-bastion-logs.sh
   ```
   Check for errors in the console output. Common issues:
   - Package installation failures
   - Network connectivity problems
   - EC2 Instance Connect installation errors

5. **Recreate the bastion instance:**
   ```bash
   cd infrastructure
   terraform taint module.bastion.aws_instance.bastion
   terraform apply -target=module.bastion.aws_instance.bastion -auto-approve
   ```
   Wait 2-3 minutes after creation, then test again with `./check-bastion-logs.sh`.

6. **Recreate the EICE:**
   ```bash
   cd infrastructure
   terraform taint aws_ec2_instance_connect_endpoint.bastion
   terraform apply -target=aws_ec2_instance_connect_endpoint.bastion -auto-approve
   ```
   This takes 5-6 minutes to complete.

7. **Check security group rules:**
   Ensure the bastion security group allows:
   - SSH (port 22) from VPC CIDR (10.0.0.0/16)
   - SSH (port 22) from EC2 Instance Connect prefix list (pl-09f90e410b133fe9f for us-east-1)
   - HTTPS (port 443) from VPC CIDR

8. **Verify EICE configuration:**
   - EICE must have `preserve_client_ip = false`
   - EICE must be in the same subnet as the bastion
   - EICE must use the same security group as the bastion

### "No running instance found"
- Verify the bastion host is running: 
  ```bash
  aws ec2 describe-instances --filters "Name=tag:Name,Values=market-surveillance-dev-bastion-host" --region us-east-1
  ```
- Check that you're using the correct APP_NAME and ENV_NAME

### "Could not find RDS endpoint"
- Ensure Terraform has been applied successfully
- Verify RDS cluster exists: 
  ```bash
  aws rds describe-db-clusters --region us-east-1
  ```
- Check you're in the correct AWS region

### Connection Hangs or Times Out
- Check VPC endpoints are working (ssm, ssmmessages, ec2messages)
- Verify NAT gateway is functioning for private subnet internet access
- Ensure the bastion instance has the EC2 Instance Connect agent installed

### Secret Already Exists (Terraform Re-deploy Failure)

When redeploying after a `make destroy`, Terraform may fail with an error like:

```
Error: Creating Secrets Manager Secret: already exists
```

This happens because AWS schedules deleted secrets for a 30-day recovery window rather than removing them immediately. Terraform cannot create a new secret with the same name while the old one is pending deletion.

**Fix:** Run the cleanup script to force-delete the pending secrets:

```bash
# Interactive — will prompt before deleting
./cleanup-secrets.sh --environment dev

# Non-interactive (for CI)
./cleanup-secrets.sh --environment dev --auto-approve
```

Then re-run your Terraform deploy.

### RDS Connection Refused
- Verify RDS security group allows connections from bastion security group
- Check RDS is in the same VPC
- Ensure database is running and accessible

## Architecture Notes

- These scripts use EC2 Instance Connect Endpoint (EICE), not SSM Session Manager
- The bastion host is in a private subnet with no public IP
- EICE creates a secure tunnel from your local machine to the bastion
- Port forwarding sessions remain active until you terminate them (Ctrl+C)
- The bastion has PostgreSQL 15 client, AWS CLI v2, jq, and Java 21 pre-installed

## Security Configuration

The bastion host requires these security group rules:

**Ingress:**
- Port 22 (SSH) from VPC CIDR (10.0.0.0/16)
- Port 22 (SSH) from EC2 Instance Connect prefix list
- Port 443 (HTTPS) from VPC CIDR

**Egress:**
- Port 5432 (PostgreSQL) to RDS security group
- Port 443 (HTTPS) to 0.0.0.0/0 (for AWS APIs and package downloads)
- Port 80 (HTTP) to 0.0.0.0/0 (for package downloads)
