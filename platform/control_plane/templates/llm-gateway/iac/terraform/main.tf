terraform {
  required_version = ">= 1.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.0" }
    random  = { source = "hashicorp/random", version = ">= 3.1" }
    null    = { source = "hashicorp/null", version = ">= 3.0" }
    archive = { source = "hashicorp/archive", version = ">= 2.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Networking — reuse existing VPC (Foundation Stack output) or create a new one
# -----------------------------------------------------------------------------

locals {
  use_existing_vpc = var.existing_vpc_id != ""
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_vpc" "existing" {
  count = local.use_existing_vpc ? 1 : 0
  id    = var.existing_vpc_id
}

data "aws_subnets" "existing_public" {
  count = local.use_existing_vpc ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [var.existing_vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["*public*"]
  }
}

data "aws_subnets" "existing_private" {
  count = local.use_existing_vpc ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [var.existing_vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["*private*"]
  }
}

resource "aws_vpc" "main" {
  count                = local.use_existing_vpc ? 0 : 1
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, { Name = "${var.project_name}-vpc" })
}

resource "aws_internet_gateway" "main" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id
  tags   = merge(var.tags, { Name = "${var.project_name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = local.use_existing_vpc ? 0 : 2
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(var.tags, { Name = "${var.project_name}-public-${count.index}" })
}

resource "aws_subnet" "private" {
  count             = local.use_existing_vpc ? 0 : 2
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = merge(var.tags, { Name = "${var.project_name}-private-${count.index}" })
}

resource "aws_route_table" "public" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }
  tags = merge(var.tags, { Name = "${var.project_name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = local.use_existing_vpc ? 0 : 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_eip" "nat" {
  count  = local.use_existing_vpc ? 0 : 1
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.project_name}-nat-eip" })
}

resource "aws_nat_gateway" "main" {
  count         = local.use_existing_vpc ? 0 : 1
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(var.tags, { Name = "${var.project_name}-nat" })
}

resource "aws_route_table" "private" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }
  tags = merge(var.tags, { Name = "${var.project_name}-private-rt" })
}

resource "aws_route_table_association" "private" {
  count          = local.use_existing_vpc ? 0 : 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

locals {
  vpc_id             = local.use_existing_vpc ? var.existing_vpc_id : aws_vpc.main[0].id
  private_subnet_ids = local.use_existing_vpc ? data.aws_subnets.existing_private[0].ids : aws_subnet.private[*].id
  public_subnet_ids  = local.use_existing_vpc ? data.aws_subnets.existing_public[0].ids : aws_subnet.public[*].id
}

# -----------------------------------------------------------------------------
# LLM Gateway (LiteLLM on ECS Fargate)
# -----------------------------------------------------------------------------

# Per-deployment suffix so a partial-apply failure doesn't strand globally-
# unique resource names (ALB, target group, ECR repo, IAM roles, secrets,
# subnet groups, log groups, ECS cluster) and block the next attempt. The
# suffix is stored in state, so subsequent applies reuse it; a fresh
# deployment_id starts with a fresh suffix.
resource "random_id" "suffix" {
  byte_length = 2
}

module "litellm" {
  source = "./modules/litellm"

  name         = "${var.project_name}-litellm-${random_id.suffix.hex}"
  project_name = var.project_name
  environment  = var.environment

  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids
  public_subnet_ids  = local.public_subnet_ids

  master_key      = var.master_key
  enabled_models  = var.enabled_models
  litellm_version = var.litellm_version

  attach_guardrail_id      = var.attach_guardrail_id
  attach_guardrail_version = var.attach_guardrail_version

  langfuse_host                  = var.langfuse_host
  langfuse_public_key_secret_arn = var.langfuse_public_key_secret_arn
  langfuse_secret_key_secret_arn = var.langfuse_secret_key_secret_arn

  cognito_user_pool_id = var.cognito_user_pool_id
  cognito_region       = var.cognito_region != "" ? var.cognito_region : var.aws_region

  additional_ingress_cidrs = var.additional_ingress_cidrs

  fsi_app_signing_secret = var.fsi_app_signing_secret
  ava_ui_login_url       = var.ava_ui_login_url

  tags = var.tags
}
