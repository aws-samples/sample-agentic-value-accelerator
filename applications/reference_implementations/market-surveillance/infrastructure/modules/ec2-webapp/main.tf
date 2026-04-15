# EC2 Auto Scaling Module for Web Application
# Purpose: Auto Scaling Group running Next.js web app in Docker containers

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# Get latest Amazon Linux 2023 AMI (ARM64)
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  asg_name = "trade-webapp-asg-${var.environment}"
  lt_name  = "trade-webapp-lt-${var.environment}"
}

# IAM Role for EC2 instances
resource "aws_iam_role" "webapp_ec2" {
  name = "trade-webapp-ec2-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "trade-webapp-ec2-role-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# IAM Policy for ECR access
resource "aws_iam_role_policy" "ecr_access" {
  #checkov:skip=CKV_AWS_355:ecr:GetAuthorizationToken does not support resource-level permissions and requires Resource="*"
  name = "ecr-access"
  role = aws_iam_role.webapp_ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Policy for CloudWatch Logs
resource "aws_iam_role_policy" "cloudwatch_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.webapp_ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:log-group:/aws/ec2/webapp-${var.environment}:*"
      }
    ]
  })
}

# Attach SSM managed policy for Session Manager access
resource "aws_iam_role_policy_attachment" "ssm_managed_policy" {
  role       = aws_iam_role.webapp_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "webapp_ec2" {
  name = "trade-webapp-ec2-profile-${var.environment}"
  role = aws_iam_role.webapp_ec2.name

  tags = {
    Name        = "trade-webapp-ec2-profile-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "webapp" {
  name              = "/aws/ec2/webapp-${var.environment}"
  retention_in_days = 365
  kms_key_id        = var.kms_key_arn

  tags = {
    Name        = "webapp-logs-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# User data script to run Docker container
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -e
    
    # Update system
    yum update -y
    
    # Install Docker
    yum install -y docker
    systemctl start docker
    systemctl enable docker
    usermod -a -G docker ec2-user
    
    # Install CloudWatch agent
    yum install -y amazon-cloudwatch-agent
    
    # Configure CloudWatch agent
    cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json <<'CWCONFIG'
    {
      "logs": {
        "logs_collected": {
          "files": {
            "collect_list": [
              {
                "file_path": "/var/log/webapp.log",
                "log_group_name": "/aws/ec2/webapp-${var.environment}",
                "log_stream_name": "{instance_id}/webapp",
                "timezone": "UTC"
              },
              {
                "file_path": "/var/log/docker.log",
                "log_group_name": "/aws/ec2/webapp-${var.environment}",
                "log_stream_name": "{instance_id}/docker",
                "timezone": "UTC"
              }
            ]
          }
        }
      }
    }
    CWCONFIG
    
    # Start CloudWatch agent
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
      -a fetch-config \
      -m ec2 \
      -s \
      -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
    
    # Authenticate Docker to ECR
    echo "Authenticating to ECR..."
    aws ecr get-login-password --region ${var.aws_region} | \
      docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com
    
    if [ $? -ne 0 ]; then
      echo "Failed to authenticate to ECR" > /var/log/docker-startup-error.log
      exit 1
    fi
    
    # Pull Docker image
    echo "Pulling Docker image ${var.ecr_repository_url}:${var.image_tag}..."
    docker pull ${var.ecr_repository_url}:${var.image_tag} 2>&1 | tee /var/log/docker-pull.log
    
    if [ $? -ne 0 ]; then
      echo "Failed to pull Docker image" >> /var/log/docker-startup-error.log
      exit 1
    fi
    
    # Run Docker container
    echo "Starting Docker container..."
    docker run -d \
      --name webapp \
      --restart unless-stopped \
      -p ${var.container_port}:3000 \
      -e NEXT_PUBLIC_AWS_REGION=${var.aws_region} \
      -e NEXT_PUBLIC_COGNITO_USER_POOL_ID=${var.cognito_user_pool_id} \
      -e NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${var.cognito_client_id} \
      -e NEXT_PUBLIC_API_ENDPOINT=${var.api_endpoint} \
      -e AGENTCORE_ENDPOINT=${var.agentcore_endpoint} \
      -e RISK_AGENTCORE_ENDPOINT=${var.risk_agentcore_endpoint} \
      ${var.ecr_repository_url}:${var.image_tag}
    
    if [ $? -ne 0 ]; then
      echo "Failed to start Docker container" >> /var/log/docker-startup-error.log
      exit 1
    fi
    
    # Wait for container to be healthy
    echo "Waiting for container to be healthy..."
    for i in {1..60}; do
      if docker inspect --format='{{.State.Health.Status}}' webapp 2>/dev/null | grep -q "healthy"; then
        echo "Container is healthy"
        break
      fi
      if [ $i -eq 60 ]; then
        echo "Container failed to become healthy after 60 seconds"
        docker logs webapp > /var/log/docker-startup-error.log 2>&1
        exit 1
      fi
      sleep 1
    done
    
    # Stream container logs to file in background
    docker logs -f webapp >> /var/log/webapp.log 2>&1 &
    
    echo "Web application container started successfully"
  EOF
}

# Launch Template
resource "aws_launch_template" "webapp" {
  name_prefix   = "${local.lt_name}-"
  image_id      = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = var.key_name != "" ? var.key_name : null

  iam_instance_profile {
    arn = aws_iam_instance_profile.webapp_ec2.arn
  }

  vpc_security_group_ids = var.security_group_ids

  user_data = base64encode(local.user_data)

  monitoring {
    enabled = var.enable_monitoring
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "trade-webapp-${var.environment}"
      Environment = var.environment
      Project     = "market-surveillance"
      Component   = "webapp"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name        = "trade-webapp-volume-${var.environment}"
      Environment = var.environment
      Project     = "market-surveillance"
    }
  }

  tags = {
    Name        = local.lt_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "webapp" {
  name                      = local.asg_name
  vpc_zone_identifier       = var.private_subnet_ids
  target_group_arns         = var.target_group_arns
  health_check_type         = var.health_check_type
  health_check_grace_period = var.health_check_grace_period
  min_size                  = var.min_size
  max_size                  = var.max_size
  desired_capacity          = var.desired_capacity

  launch_template {
    id      = aws_launch_template.webapp.id
    version = "$Latest"
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupMaxSize",
    "GroupMinSize",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances"
  ]

  tag {
    key                 = "Name"
    value               = "trade-webapp-${var.environment}"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = "market-surveillance"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Policy - Target Tracking (CPU)
resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "${local.asg_name}-cpu-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.webapp.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = var.target_cpu_utilization
  }
}

