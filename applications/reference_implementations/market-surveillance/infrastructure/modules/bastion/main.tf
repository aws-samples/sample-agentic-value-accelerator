# Data sources
data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# IAM Role for Bastion Host
resource "aws_iam_role" "bastion" {
  name = "${var.app_name}-${var.environment}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.app_name}-${var.environment}-bastion-role"
    Environment = var.environment
    Project     = var.app_name
  }
}

# Attach SSM Session Manager policy
resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Attach CloudWatch Agent policy for logs
resource "aws_iam_role_policy_attachment" "bastion_cloudwatch" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}


# Policy to read RDS secrets
resource "aws_iam_role_policy" "bastion_secrets" {
  count = var.enable_secrets ? 1 : 0
  name  = "${var.app_name}-${var.environment}-bastion-secrets"
  role  = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.db_secret_arn
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "bastion" {
  name = "${var.app_name}-${var.environment}-bastion-profile"
  role = aws_iam_role.bastion.name

  tags = {
    Name        = "${var.app_name}-${var.environment}-bastion-profile"
    Environment = var.environment
    Project     = var.app_name
  }
}

# CloudWatch Log Group for Bastion Logs
resource "aws_cloudwatch_log_group" "bastion" {
  name              = "/aws/ec2/bastion/${var.app_name}-${var.environment}"
  retention_in_days = 7

  tags = {
    Name        = "${var.app_name}-${var.environment}-bastion-logs"
    Environment = var.environment
    Project     = var.app_name
  }
}

# Bastion Host EC2 Instance
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.bastion.name

  # Require IMDSv2
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # Encrypted root volume
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name        = "${var.app_name}-${var.environment}-bastion-root"
      Environment = var.environment
      Project     = var.app_name
    }
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e
    
    # Log all output
    exec > >(tee /var/log/user-data.log)
    exec 2>&1
    
    echo "Starting bastion host setup at $(date)"
    
    # Update system
    echo "Updating system packages..."
    sudo yum update -y
    
    # Install CloudWatch Agent
    echo "Installing CloudWatch Agent..."
    sudo yum install -y amazon-cloudwatch-agent
    
    # Configure CloudWatch Agent for system logs
    cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWCONFIG'
    {
      "logs": {
        "logs_collected": {
          "files": {
            "collect_list": [
              {
                "file_path": "/var/log/user-data.log",
                "log_group_name": "/aws/ec2/bastion/${var.app_name}-${var.environment}",
                "log_stream_name": "{instance_id}/user-data.log",
                "retention_in_days": 7
              },
              {
                "file_path": "/var/log/messages",
                "log_group_name": "/aws/ec2/bastion/${var.app_name}-${var.environment}",
                "log_stream_name": "{instance_id}/messages",
                "retention_in_days": 7
              },
              {
                "file_path": "/var/log/cloud-init.log",
                "log_group_name": "/aws/ec2/bastion/${var.app_name}-${var.environment}",
                "log_stream_name": "{instance_id}/cloud-init.log",
                "retention_in_days": 7
              },
              {
                "file_path": "/var/log/cloud-init-output.log",
                "log_group_name": "/aws/ec2/bastion/${var.app_name}-${var.environment}",
                "log_stream_name": "{instance_id}/cloud-init-output.log",
                "retention_in_days": 7
              }
            ]
          }
        }
      }
    }
    CWCONFIG
    
    # Start CloudWatch Agent
    echo "Starting CloudWatch Agent..."
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
      -a fetch-config \
      -m ec2 \
      -s \
      -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
    
    # Verify EC2 Instance Connect is installed (pre-installed on AL2023 standard AMI)
    echo "Verifying EC2 Instance Connect..."
    if rpm -qa | grep -q ec2-instance-connect; then
      echo "✓ EC2 Instance Connect is installed"
      rpm -qa | grep ec2-instance-connect
    else
      echo "⚠ EC2 Instance Connect not found, installing..."
      sudo yum -y install ec2-instance-connect
    fi
    
    # Verify SSH configuration for EC2 Instance Connect
    echo "Checking SSH configuration..."
    if sudo sshd -T | grep -q "AuthorizedKeysCommand"; then
      echo "✓ SSH is configured for EC2 Instance Connect"
    else
      echo "⚠ SSH may not be configured for EC2 Instance Connect"
    fi
    
    # Install PostgreSQL 15 client
    echo "Installing PostgreSQL 15 client..."
    sudo dnf -y install postgresql15
    
    # Install jq for JSON parsing
    echo "Installing jq..."
    sudo yum -y install jq
    
    # Install Java 21 (Amazon Corretto)
    echo "Installing Java 21..."
    sudo yum -y install java-21-amazon-corretto-headless
    
    # Install AWS CLI v2 (if not already installed)
    if ! command -v aws &> /dev/null; then
      echo "Installing AWS CLI v2..."
      curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
      unzip awscliv2.zip
      sudo ./aws/install
      rm -rf aws awscliv2.zip
    else
      echo "AWS CLI already installed"
    fi
    
    echo "Bastion host setup complete at $(date)"
  EOF

  # Enable detailed monitoring (can be disabled to save costs)
  monitoring = var.enable_detailed_monitoring

  tags = {
    Name        = "${var.app_name}-${var.environment}-bastion-host"
    Environment = var.environment
    Project     = var.app_name
    Purpose     = "Database access and troubleshooting"
  }

  lifecycle {
    ignore_changes = [
      ami,
      user_data
    ]
  }
}
