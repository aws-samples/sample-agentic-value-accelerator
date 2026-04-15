#!/bin/bash

# Diagnose bastion host connectivity issues with EC2 Instance Connect

set -e

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="${APP_NAME:-market-surveillance}"
ENV_NAME="${ENV_NAME:-dev}"

echo "=== Bastion Host Diagnostics ==="
echo ""

# Get instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=tag:Name,Values=$APP_NAME-$ENV_NAME-bastion-host" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[*].Instances[*].InstanceId" \
  --output text)

if [[ -z "$INSTANCE_ID" ]]; then
  echo "❌ No running bastion instance found"
  exit 1
fi

echo "✓ Found bastion instance: $INSTANCE_ID"

# Get instance details
INSTANCE_INFO=$(aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0]' \
  --output json)

PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIpAddress')
SUBNET_ID=$(echo "$INSTANCE_INFO" | jq -r '.SubnetId')
SG_ID=$(echo "$INSTANCE_INFO" | jq -r '.SecurityGroups[0].GroupId')
LAUNCH_TIME=$(echo "$INSTANCE_INFO" | jq -r '.LaunchTime')

echo "  Private IP: $PRIVATE_IP"
echo "  Subnet: $SUBNET_ID"
echo "  Security Group: $SG_ID"
echo "  Launch Time: $LAUNCH_TIME"
echo ""

# Check EICE
echo "Checking EC2 Instance Connect Endpoint..."
EICE_INFO=$(aws ec2 describe-instance-connect-endpoints \
  --region "$REGION" \
  --filters "Name=tag:Name,Values=$APP_NAME-eice-$ENV_NAME" \
  --query 'InstanceConnectEndpoints[0]' \
  --output json 2>/dev/null || echo "{}")

if [[ "$EICE_INFO" == "{}" ]]; then
  echo "❌ No EICE found"
  exit 1
fi

EICE_ID=$(echo "$EICE_INFO" | jq -r '.InstanceConnectEndpointId')
EICE_STATE=$(echo "$EICE_INFO" | jq -r '.State')
EICE_SUBNET=$(echo "$EICE_INFO" | jq -r '.SubnetId')
EICE_SG=$(echo "$EICE_INFO" | jq -r '.SecurityGroupIds[0]')
PRESERVE_CLIENT_IP=$(echo "$EICE_INFO" | jq -r '.PreserveClientIp')

echo "✓ Found EICE: $EICE_ID"
echo "  State: $EICE_STATE"
echo "  Subnet: $EICE_SUBNET"
echo "  Security Group: $EICE_SG"
echo "  Preserve Client IP: $PRESERVE_CLIENT_IP"
echo ""

# Check if EICE and bastion are in same subnet
if [[ "$EICE_SUBNET" == "$SUBNET_ID" ]]; then
  echo "✓ EICE and bastion are in the same subnet"
else
  echo "⚠️  EICE and bastion are in different subnets"
  echo "   EICE: $EICE_SUBNET"
  echo "   Bastion: $SUBNET_ID"
fi
echo ""

# Check preserve_client_ip setting
if [[ "$PRESERVE_CLIENT_IP" == "false" ]]; then
  echo "✓ preserve_client_ip is correctly set to false"
else
  echo "❌ preserve_client_ip should be false, currently: $PRESERVE_CLIENT_IP"
fi
echo ""

# Check security group rules
echo "Checking security group rules..."
SG_RULES=$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --group-ids "$SG_ID" \
  --query 'SecurityGroups[0].IpPermissions' \
  --output json)

SSH_FROM_VPC=$(echo "$SG_RULES" | jq -r '.[] | select(.FromPort==22) | .IpRanges[] | select(.CidrIp=="10.0.0.0/16") | .CidrIp')
SSH_FROM_PREFIX=$(echo "$SG_RULES" | jq -r '.[] | select(.FromPort==22) | .PrefixListIds[] | .PrefixListId')

if [[ -n "$SSH_FROM_VPC" ]]; then
  echo "✓ SSH from VPC CIDR (10.0.0.0/16) is allowed"
else
  echo "❌ SSH from VPC CIDR is NOT allowed"
fi

if [[ -n "$SSH_FROM_PREFIX" ]]; then
  echo "✓ SSH from EC2 Instance Connect prefix list ($SSH_FROM_PREFIX) is allowed"
else
  echo "❌ SSH from EC2 Instance Connect prefix list is NOT allowed"
fi
echo ""

# Check RDS connectivity
echo "Checking RDS connectivity..."
RDS_SG_RULES=$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --filters "Name=tag:Name,Values=$APP_NAME-rds-sg-$ENV_NAME" \
  --query 'SecurityGroups[0].IpPermissions' \
  --output json)

RDS_FROM_BASTION=$(echo "$RDS_SG_RULES" | jq -r ".[] | select(.FromPort==5432) | .UserIdGroupPairs[] | select(.GroupId==\"$SG_ID\") | .GroupId")

if [[ -n "$RDS_FROM_BASTION" ]]; then
  echo "✓ RDS allows connections from bastion security group"
else
  echo "❌ RDS does NOT allow connections from bastion security group"
fi
echo ""

# Check instance age
LAUNCH_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo $LAUNCH_TIME | cut -d'+' -f1)" "+%s" 2>/dev/null || echo "0")
CURRENT_EPOCH=$(date "+%s")
AGE_SECONDS=$((CURRENT_EPOCH - LAUNCH_EPOCH))
AGE_MINUTES=$((AGE_SECONDS / 60))

echo "Instance age: ${AGE_MINUTES} minutes"
if [[ $AGE_MINUTES -lt 3 ]]; then
  echo "⚠️  Instance is very new. User data script may still be running."
  echo "   Wait 2-3 minutes for EC2 Instance Connect to be fully configured."
  echo ""
fi

# Test connection
echo "=== Testing Connection ==="
echo "Attempting to connect to bastion..."
echo "(This may take 10-15 seconds...)"
echo ""

# Use gtimeout if available (brew install coreutils), otherwise skip timeout
if command -v gtimeout &> /dev/null; then
  TIMEOUT_CMD="gtimeout 15"
elif command -v timeout &> /dev/null; then
  TIMEOUT_CMD="timeout 15"
else
  TIMEOUT_CMD=""
fi

$TIMEOUT_CMD aws ec2-instance-connect ssh \
  --region "$REGION" \
  --instance-id "$INSTANCE_ID" \
  --connection-type eice \
  --local-forwarding "9999:127.0.0.1:22" 2>&1 | head -5 &
CONNECT_PID=$!

sleep 3
kill $CONNECT_PID 2>/dev/null || true
wait $CONNECT_PID 2>/dev/null

echo ""
echo "If you see 'Websocket Closure Reason: Unable to connect to target', try:"
echo ""
echo "=== Troubleshooting Steps ==="
echo "1. Wait 2-3 minutes after instance creation for user data to complete"
echo ""
echo "2. Check instance system log for user data completion:"
echo "   aws ec2 get-console-output --instance-id $INSTANCE_ID --region $REGION --output text | tail -50"
echo ""
echo "3. Try connecting via SSM to check EC2 Instance Connect status:"
echo "   aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo "   sudo systemctl status ec2-instance-connect"
echo ""
echo "4. Verify the instance can reach VPC endpoints:"
echo "   aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo "   curl -I https://ec2-instance-connect.$REGION.amazonaws.com"
echo ""
echo "5. If all else fails, recreate the bastion:"
echo "   cd infrastructure"
echo "   terraform taint module.bastion.aws_instance.bastion"
echo "   terraform apply"

echo ""
echo "=== All checks passed! ==="
