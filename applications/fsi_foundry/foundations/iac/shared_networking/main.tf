# ============================================================================
# FSI Foundry - Shared VPC Infrastructure
# ============================================================================
# This module creates a shared VPC that can be used by all use cases.
# Deploy this ONCE per region/environment, then reference it from use cases.
#
# Benefits of shared VPC:
# - Single VPC per region instead of one per use case × framework
# - Reduces AWS VPC quota usage
# - Lower costs (single NAT gateway, single VPC endpoints)
# - Centralized network management
# - Use security groups for use case isolation
#
# Usage:
#   cd applications/fsi_foundry/foundations/iac/shared_networking
#   terraform init
#   terraform apply -var="aws_region=us-east-1"
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ava"
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "shared-networking"
    }
  }
}

# Get available availability zones in the region
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Use first 3 available AZs for high availability
  availability_zones = slice(data.aws_availability_zones.available.names, 0, min(3, length(data.aws_availability_zones.available.names)))

  # VPC name for easy reference
  vpc_name = "ava-foundry-${var.environment}-vpc"
}

# ============================================================================
# VPC
# ============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = local.vpc_name
  }
}

# ============================================================================
# Internet Gateway
# ============================================================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.vpc_name}-igw"
  }
}

# ============================================================================
# Public Subnets (for ALBs, NAT Gateways)
# ============================================================================

resource "aws_subnet" "public" {
  count = length(local.availability_zones)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.vpc_name}-public-${count.index + 1}"
    Tier = "public"
  }
}

# ============================================================================
# Private Subnets (for compute: EC2, ECS, Lambda)
# ============================================================================

resource "aws_subnet" "private_app" {
  count = length(local.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)
  availability_zone = local.availability_zones[count.index]

  tags = {
    Name = "${local.vpc_name}-app-${count.index + 1}"
    Tier = "app"
  }
}

# ============================================================================
# Private Subnets (for data: RDS, ElastiCache)
# ============================================================================

resource "aws_subnet" "private_data" {
  count = length(local.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 20 + count.index)
  availability_zone = local.availability_zones[count.index]

  tags = {
    Name = "${local.vpc_name}-data-${count.index + 1}"
    Tier = "data"
  }
}

# ============================================================================
# NAT Gateway (Optional - only if private subnets need internet access)
# ============================================================================

resource "aws_eip" "nat" {
  count = var.enable_nat_gateway ? 1 : 0

  domain = "vpc"

  tags = {
    Name = "${local.vpc_name}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${local.vpc_name}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# ============================================================================
# Route Tables
# ============================================================================

# Public route table (internet access via IGW)
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.vpc_name}-public-rt"
  }
}

# Private route table for app subnets (internet via NAT if enabled)
resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[0].id
    }
  }

  tags = {
    Name = "${local.vpc_name}-app-rt"
  }
}

# Private route table for data subnets (no internet access)
resource "aws_route_table" "private_data" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.vpc_name}-data-rt"
  }
}

# ============================================================================
# Route Table Associations
# ============================================================================

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_app" {
  count = length(aws_subnet.private_app)

  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app.id
}

resource "aws_route_table_association" "private_data" {
  count = length(aws_subnet.private_data)

  subnet_id      = aws_subnet.private_data[count.index].id
  route_table_id = aws_route_table.private_data.id
}

# ============================================================================
# VPC Flow Logs (Optional - for monitoring)
# ============================================================================

resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name              = "/aws/vpc/${local.vpc_name}/flow-logs"
  retention_in_days = 7

  tags = {
    Name = "${local.vpc_name}-flow-logs"
  }
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name = "${local.vpc_name}-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name = "${local.vpc_name}-flow-logs-policy"
  role = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

resource "aws_flow_log" "main" {
  count = var.enable_flow_logs ? 1 : 0

  iam_role_arn    = aws_iam_role.flow_logs[0].arn
  log_destination = aws_cloudwatch_log_group.flow_logs[0].arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id

  tags = {
    Name = "${local.vpc_name}-flow-log"
  }
}
