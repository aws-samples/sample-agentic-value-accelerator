terraform {
  required_version = ">= 1.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.0" }
    random = { source = "hashicorp/random", version = ">= 3.1" }
    null   = { source = "hashicorp/null", version = ">= 3.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Networking — reuse existing VPC or create a new one
# -----------------------------------------------------------------------------

locals {
  use_existing_vpc = var.existing_vpc_id != ""
}

data "aws_availability_zones" "available" {
  state = "available"
}

# --- Existing VPC data sources (used when existing_vpc_id is provided) ---

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

# --- New VPC resources (created only when no existing VPC) ---

resource "aws_vpc" "main" {
  count                = local.use_existing_vpc ? 0 : 1
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  tags = merge(var.tags, {
    Name = "${var.project_name}-igw"
  })
}

resource "aws_subnet" "public" {
  count                   = local.use_existing_vpc ? 0 : 2
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-public-${count.index}"
  })
}

resource "aws_subnet" "private" {
  count             = local.use_existing_vpc ? 0 : 2
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-${count.index}"
  })
}

resource "aws_route_table" "public" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = local.use_existing_vpc ? 0 : 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_eip" "nat" {
  count  = local.use_existing_vpc ? 0 : 1
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.project_name}-nat-eip"
  })
}

resource "aws_nat_gateway" "main" {
  count         = local.use_existing_vpc ? 0 : 1
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(var.tags, {
    Name = "${var.project_name}-nat"
  })
}

resource "aws_route_table" "private" {
  count  = local.use_existing_vpc ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-rt"
  })
}

resource "aws_route_table_association" "private" {
  count          = local.use_existing_vpc ? 0 : 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

resource "aws_security_group" "default" {
  count       = local.use_existing_vpc ? 0 : 1
  name_prefix = "${var.project_name}-sg"
  vpc_id      = aws_vpc.main[0].id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-default-sg"
  })
}

# --- Resolved networking outputs ---

locals {
  vpc_id             = local.use_existing_vpc ? var.existing_vpc_id : aws_vpc.main[0].id
  private_subnet_ids = local.use_existing_vpc ? data.aws_subnets.existing_private[0].ids : aws_subnet.private[*].id
  public_subnet_ids  = local.use_existing_vpc ? data.aws_subnets.existing_public[0].ids : aws_subnet.public[*].id
}

# -----------------------------------------------------------------------------
# Observability (Langfuse on ECS)
# -----------------------------------------------------------------------------

module "langfuse" {
  source = "./modules/langfuse"

  name         = "${var.project_name}-langfuse"
  project_name = var.project_name
  environment  = var.environment

  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids
  public_subnet_ids  = local.public_subnet_ids

  langfuse_init_user_email    = var.langfuse_admin_email
  langfuse_init_user_password = var.langfuse_admin_password
}
