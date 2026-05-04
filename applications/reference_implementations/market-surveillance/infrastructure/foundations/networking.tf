# Networking Infrastructure
# Separate from application resources for better modularity and reusability

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# VPC Flow Logs - IAM Role
resource "aws_iam_role" "vpc_flow_logs" {
  name = "vpc-flow-logs-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "vpc-flow-logs-role-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# VPC Flow Logs - IAM Policy
resource "aws_iam_role_policy" "vpc_flow_logs" {
  name = "vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:log-group:*"
      }
    ]
  })
}

# VPC Module
module "vpc" {
  #checkov:skip=CKV_TF_1:Using Terraform Registry with pinned version — registry serves immutable signed artifacts
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.16.0" # Pinned version with deprecation fixes

  name = "market-surveillance-vpc-${var.environment}"
  cidr = var.vpc_cidr

  azs              = var.availability_zones
  public_subnets   = var.public_subnet_cidrs
  private_subnets  = var.private_subnet_cidrs
  database_subnets = var.database_subnet_cidrs

  # Database subnet group
  create_database_subnet_group           = true
  create_database_subnet_route_table     = true
  create_database_internet_gateway_route = false

  # NAT Gateway
  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "prod" # Single NAT for dev/staging, one per AZ for prod
  one_nat_gateway_per_az = var.environment == "prod"

  # DNS
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPC Flow Logs
  enable_flow_log                                 = true
  create_flow_log_cloudwatch_iam_role             = false
  flow_log_cloudwatch_iam_role_arn                = aws_iam_role.vpc_flow_logs.arn
  create_flow_log_cloudwatch_log_group            = true
  flow_log_cloudwatch_log_group_retention_in_days = 7
  flow_log_max_aggregation_interval               = 60
  vpc_flow_log_tags = {
    Name = "vpc-flow-logs-${var.environment}"
  }

  # Tags
  tags = {
    Environment = var.environment
    Project     = "market-surveillance"
    ManagedBy   = "terraform"
  }

  public_subnet_tags = {
    Type = "public"
    Tier = "web"
  }

  private_subnet_tags = {
    Type = "private"
    Tier = "application"
  }

  database_subnet_tags = {
    Type = "database"
    Tier = "data"
  }

  vpc_tags = {
    Name = "market-surveillance-vpc-${var.environment}"
  }
}

# VPC Endpoints for private subnet access to AWS services
module "vpc_endpoints" {
  #checkov:skip=CKV_TF_1:Using Terraform Registry with pinned version — registry serves immutable signed artifacts
  source  = "terraform-aws-modules/vpc/aws//modules/vpc-endpoints"
  version = "5.16.0" # Match VPC module version

  vpc_id = module.vpc.vpc_id

  # Security group for VPC endpoints
  create_security_group      = true
  security_group_name        = "vpc-endpoints-sg-${var.environment}"
  security_group_description = "Security group for VPC endpoints"

  security_group_rules = {
    ingress_https = {
      description = "HTTPS from VPC"
      cidr_blocks = [var.vpc_cidr]
    }
  }

  endpoints = {
    # S3 Gateway endpoint
    s3 = {
      service         = "s3"
      service_type    = "Gateway"
      route_table_ids = flatten([module.vpc.private_route_table_ids, module.vpc.database_route_table_ids])
      tags = {
        Name = "s3-endpoint-${var.environment}"
      }
    }

    # DynamoDB Gateway endpoint (for Lambda to access DynamoDB privately)
    dynamodb = {
      service         = "dynamodb"
      service_type    = "Gateway"
      route_table_ids = flatten([module.vpc.private_route_table_ids, module.vpc.database_route_table_ids])
      tags = {
        Name = "dynamodb-endpoint-${var.environment}"
      }
    }

    # ECR Docker endpoint
    ecr_dkr = {
      service             = "ecr.dkr"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "ecr-dkr-endpoint-${var.environment}"
      }
    }

    # ECR API endpoint
    ecr_api = {
      service             = "ecr.api"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "ecr-api-endpoint-${var.environment}"
      }
    }

    # CloudWatch Logs endpoint
    logs = {
      service             = "logs"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "logs-endpoint-${var.environment}"
      }
    }

    # SSM endpoint for Session Manager
    ssm = {
      service             = "ssm"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "ssm-endpoint-${var.environment}"
      }
    }

    # SSM Messages endpoint
    ssmmessages = {
      service             = "ssmmessages"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "ssmmessages-endpoint-${var.environment}"
      }
    }

    # EC2 Messages endpoint
    ec2messages = {
      service             = "ec2messages"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "ec2messages-endpoint-${var.environment}"
      }
    }

    # Secrets Manager endpoint (for Lambda to access RDS credentials)
    secretsmanager = {
      service             = "secretsmanager"
      private_dns_enabled = true
      subnet_ids          = module.vpc.private_subnets
      tags = {
        Name = "secretsmanager-endpoint-${var.environment}"
      }
    }
  }

  tags = {
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Groups
# Security Group for Application Load Balancer
resource "aws_security_group" "alb" {
  #checkov:skip=CKV_AWS_382:ALB requires unrestricted egress to reach backend targets and health checks
  #checkov:skip=CKV_AWS_260:ALB accepts public HTTP traffic for the web application. Suitable for development environment only — production should restrict ingress to HTTPS and use HTTP-to-HTTPS redirect at the ALB listener level.
  #checkov:skip=CKV_AWS_382:For public facing resource we need to allow ingress to port -1 to serve traffic back to user.

  name        = "market-surveillance-alb-sg-${var.environment}"
  description = "Security group for Application Load Balancer"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "market-surveillance-alb-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group for EC2 Web Application Instances
resource "aws_security_group" "webapp_ec2" {
  #checkov:skip=CKV2_AWS_5:Security group is being attached in main.tf file
  #checkov:skip=CKV_AWS_382:Public-facing webapp EC2 instances require unrestricted egress for package updates and external API calls
  name        = "market-surveillance-webapp-ec2-sg-${var.environment}"
  description = "Security group for web application EC2 instances"
  vpc_id      = module.vpc.vpc_id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "market-surveillance-webapp-ec2-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group rule to allow webapp EC2 inbound from ALB
resource "aws_security_group_rule" "webapp_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.webapp_ec2.id
  source_security_group_id = aws_security_group.alb.id
  description              = "HTTP from ALB"
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "market-surveillance-rds-sg-${var.environment}"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = module.vpc.vpc_id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "market-surveillance-rds-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group for Lambda Functions
resource "aws_security_group" "lambda" {
  #checkov:skip=CKV2_AWS_5:Security group is attached to Lambda functions in main.tf
  name        = "market-surveillance-lambda-sg-${var.environment}"
  description = "Security group for Lambda functions"
  vpc_id      = module.vpc.vpc_id

  # Note: Using separate aws_security_group_rule resources instead of inline rules
  # to avoid conflicts and allow better management

  tags = {
    Name        = "market-surveillance-lambda-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group rule to allow Lambda outbound HTTPS for AWS services
resource "aws_security_group_rule" "lambda_to_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.lambda.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS for AWS services"
}

# Security Group rule to allow Lambda outbound to itself
resource "aws_security_group_rule" "lambda_to_self" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.lambda.id
  self              = true
  description       = "Allow all outbound traffic to itself"
}

# Security Group rule to allow Lambda outbound to RDS
resource "aws_security_group_rule" "lambda_to_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.lambda.id
  source_security_group_id = aws_security_group.rds.id
  description              = "PostgreSQL to RDS"
}

# Security Group for Bedrock AgentCore Runtime
resource "aws_security_group" "agentcore" {
  #checkov:skip=CKV2_AWS_5:Security group is being attached in main.tf file
  name        = "market-surveillance-agentcore-sg-${var.environment}"
  description = "Security group for Bedrock AgentCore Runtime"
  vpc_id      = module.vpc.vpc_id

  # Outbound to RDS PostgreSQL
  egress {
    description     = "PostgreSQL to RDS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
  }

  # Outbound HTTPS for AWS services (ECR, CloudWatch, Bedrock)
  egress {
    description = "HTTPS for AWS services"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound to itself (for AgentCore internal communication)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Allow all outbound traffic to itself"
  }

  tags = {
    Name        = "market-surveillance-agentcore-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group for Public Subnet Resources
resource "aws_security_group" "public_subnet" {
  #checkov:skip=CKV2_AWS_5:Security group is being attached in main.tf file
  #checkov:skip=CKV_AWS_382:Public subnet resources require unrestricted egress for internet-facing services
  #checkov:skip=CKV_AWS_260:Public subnet security group intentionally allows HTTP ingress for internet-facing services
  name        = "market-surveillance-public-subnet-sg-${var.environment}"
  description = "Security group for resources in public subnet"
  vpc_id      = module.vpc.vpc_id

  # Inbound HTTP from anywhere
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP traffic from Internet"
  }

  # Inbound HTTPS from anywhere
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS traffic from Internet"
  }

  # Outbound to anywhere
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "market-surveillance-public-subnet-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group for Private Subnet Resources
resource "aws_security_group" "private_subnet" {
  name        = "market-surveillance-private-subnet-sg-${var.environment}"
  description = "Security group for resources in private subnet"
  vpc_id      = module.vpc.vpc_id

  # Inbound SSH from VPC (for EC2 Instance Connect when preserveClientIp=false)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
    description = "SSH from VPC for EC2 Instance Connect"
  }

  # Inbound SSH from EC2 Instance Connect Service (AWS managed prefix list)
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    prefix_list_ids = ["pl-09f90e410b133fe9f"] # EC2 Instance Connect prefix list for us-east-1
    description     = "SSH from EC2 Instance Connect Service"
  }

  # Inbound HTTPS from VPC (for EC2 Instance Connect communication)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
    description = "HTTPS from VPC for EC2 Instance Connect"
  }

  # Outbound to RDS
  egress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
    description     = "PostgreSQL to RDS"
  }

  # Outbound HTTPS for package downloads and AWS API calls
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS for package downloads and AWS APIs"
  }

  # Outbound HTTP for package downloads
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP for package downloads"
  }

  # Outbound to itself (for EC2 Instance Connect and internal communication)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Allow all outbound traffic to itself"
  }

  tags = {
    Name        = "market-surveillance-private-subnet-sg-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Security Group rule to allow private subnet inbound from public subnet
resource "aws_security_group_rule" "private_from_public" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 0
  protocol                 = "-1"
  security_group_id        = aws_security_group.private_subnet.id
  source_security_group_id = aws_security_group.public_subnet.id
  description              = "All traffic from public subnet"
}

# Security Group rule to allow RDS inbound from AgentCore
resource "aws_security_group_rule" "rds_from_agentcore" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.agentcore.id
  description              = "PostgreSQL from AgentCore Runtime"
}

# Security Group rule to allow RDS inbound from Private Subnet
resource "aws_security_group_rule" "rds_from_private_subnet" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.private_subnet.id
  description              = "PostgreSQL from Private Subnet (includes Bastion)"
}

# Security Group rule to allow RDS inbound from Lambda
resource "aws_security_group_rule" "rds_from_lambda" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.lambda.id
  description              = "PostgreSQL from Lambda Functions"
}

# EC2 Instance Connect Endpoint (EICE) for bastion host access
resource "aws_ec2_instance_connect_endpoint" "bastion" {
  subnet_id          = module.vpc.private_subnets[0]
  security_group_ids = [aws_security_group.private_subnet.id]
  preserve_client_ip = false # Critical for EICE to work properly

  tags = {
    Name        = "market-surveillance-eice-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
