# =============================================================================
# LiteLLM Gateway - Dev Environment
# =============================================================================
# Self-contained deployment: VPC + ECS Cluster + LiteLLM module
# Single `terraform apply` from zero to a working gateway.
# =============================================================================

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "ava-litellm-dev-vpc"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Internet Gateway
# -----------------------------------------------------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "ava-litellm-dev-igw"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Public Subnets
# -----------------------------------------------------------------------------

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name        = "ava-litellm-dev-public-a"
    Environment = var.environment
    Tier        = "public"
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true

  tags = {
    Name        = "ava-litellm-dev-public-b"
    Environment = var.environment
    Tier        = "public"
  }
}

# -----------------------------------------------------------------------------
# Private Subnets
# -----------------------------------------------------------------------------

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name        = "ava-litellm-dev-private-a"
    Environment = var.environment
    Tier        = "private"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.aws_region}b"

  tags = {
    Name        = "ava-litellm-dev-private-b"
    Environment = var.environment
    Tier        = "private"
  }
}

# -----------------------------------------------------------------------------
# NAT Gateway (single — cost-saving for dev)
# -----------------------------------------------------------------------------

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name        = "ava-litellm-dev-nat-eip"
    Environment = var.environment
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name        = "ava-litellm-dev-nat"
    Environment = var.environment
  }

  depends_on = [aws_internet_gateway.main]
}

# -----------------------------------------------------------------------------
# Route Tables — Public
# -----------------------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "ava-litellm-dev-public-rt"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# Route Tables — Private
# -----------------------------------------------------------------------------

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name        = "ava-litellm-dev-private-rt"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "ava-litellm-test"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "ava-litellm-test"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# LiteLLM Gateway Module
# -----------------------------------------------------------------------------

module "litellm" {
  source = "../../modules/litellm"

  vpc_id                 = aws_vpc.main.id
  private_subnet_ids     = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  public_subnet_ids      = [aws_subnet.public_a.id, aws_subnet.public_b.id]
  ecs_cluster_id         = aws_ecs_cluster.main.name
  config_s3_bucket       = "ava-litellm-config-${data.aws_caller_identity.current.account_id}"
  environment            = "dev"
  name_prefix            = "ava-litellm"
  bedrock_mantle_api_key = var.bedrock_mantle_api_key
}


# -----------------------------------------------------------------------------
# SSM Bastion (Optional — for validation from inside the VPC)
# -----------------------------------------------------------------------------
# Provides an SSM-accessible EC2 instance for running curl commands against
# the internal ALB gateway endpoint.
#
# Connect: aws ssm start-session --target $(terraform output -raw bastion_instance_id) --profile <your-profile> --region us-east-2
# -----------------------------------------------------------------------------

module "bastion" {
  source = "../../modules/bastion"

  vpc_id      = aws_vpc.main.id
  subnet_id   = aws_subnet.private_a.id
  name_prefix = "ava-litellm"

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "gateway-validation"
  }
}

# =============================================================================
# AVA Control Plane Backend — ECS Fargate Service
# =============================================================================
# Deploys the Control Plane backend API as a Fargate task in the same cluster
# as the LiteLLM gateway.  Exposes port 8000 via a dedicated internal ALB.
# =============================================================================

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/ava-control-plane-backend"
  retention_in_days = 30

  tags = {
    Name        = "ava-control-plane-backend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# IAM — Execution Role (ECR pull, logs, Secrets Manager)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "backend_execution" {
  name = "ava-backend-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "ava-backend-execution-role"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "backend_execution_ecr" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "backend_execution_secrets" {
  name = "secrets-read"
  role = aws_iam_role.backend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        module.litellm.litellm_master_key_secret_arn
      ]
    }]
  })
}

# -----------------------------------------------------------------------------
# IAM — Task Role (DynamoDB, S3, Bedrock, Secrets Manager)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "backend_task" {
  name = "ava-backend-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "ava-backend-task-role"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy" "backend_task_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ]
      Resource = [
        aws_dynamodb_table.deployments.arn,
        "${aws_dynamodb_table.deployments.arn}/index/*",
        aws_dynamodb_table.guardrails.arn,
        "${aws_dynamodb_table.guardrails.arn}/index/*",
        aws_dynamodb_table.finops_spend.arn,
        "${aws_dynamodb_table.finops_spend.arn}/index/*",
        aws_dynamodb_table.govern_audit.arn,
        "${aws_dynamodb_table.govern_audit.arn}/index/*",
        aws_dynamodb_table.govern_conformance.arn,
        "${aws_dynamodb_table.govern_conformance.arn}/index/*",
        aws_dynamodb_table.govern_graduation.arn,
        "${aws_dynamodb_table.govern_graduation.arn}/index/*",
        aws_dynamodb_table.govern_sr26.arn,
        "${aws_dynamodb_table.govern_sr26.arn}/index/*",
        aws_dynamodb_table.govern_enforcement.arn,
        "${aws_dynamodb_table.govern_enforcement.arn}/index/*",
        aws_dynamodb_table.govern_a2a_trust.arn,
        "${aws_dynamodb_table.govern_a2a_trust.arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "backend_task_s3" {
  name = "s3-config-access"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ]
      Resource = [
        "arn:aws:s3:::${module.litellm.config_s3_bucket}",
        "arn:aws:s3:::${module.litellm.config_s3_bucket}/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "backend_task_ecs" {
  name = "ecs-update"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ava-litellm-*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "backend_task_bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel"
      ]
      Resource = ["*"]
    }]
  })
}

resource "aws_iam_role_policy" "backend_task_secrets" {
  name = "secrets-read"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        module.litellm.litellm_master_key_secret_arn,
        # LLM Gateways deployed dynamically via the `llm-gateway` template store
        # their master key in a Secrets Manager entry named `llm-gateway-*-secrets`.
        # The backend discovers each gateway (and its master_key_secret_arn) from
        # the deployments DDB table and reads the key at runtime via _resolve_master_key
        # to authenticate to the gateway admin API (virtual keys, spend, config).
        # Scoped to the gateway secret name prefix — not all secrets.
        "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:llm-gateway-*"
      ]
    }]
  })
}

# -----------------------------------------------------------------------------
# Security Group — Backend Tasks
# -----------------------------------------------------------------------------

resource "aws_security_group" "backend_tasks" {
  name        = "ava-backend-tasks-sg"
  description = "Security group for AVA Control Plane backend ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow port 8000 from VPC"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "ava-backend-tasks-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Backend ALB
# -----------------------------------------------------------------------------

resource "aws_security_group" "backend_alb" {
  name        = "ava-backend-alb-sg"
  description = "Security group for AVA backend ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow port 8000 from VPC"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "ava-backend-alb-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Application Load Balancer — Backend
# -----------------------------------------------------------------------------

resource "aws_lb" "backend" {
  name               = "ava-backend-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.backend_alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  tags = {
    Name        = "ava-backend-alb"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "ava-backend-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/ping"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name        = "ava-backend-tg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lb_listener" "backend" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 8000
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# -----------------------------------------------------------------------------
# ECS Task Definition — Backend
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "ava-control-plane-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.backend_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = var.backend_image
    essential = true

    portMappings = [{
      containerPort = 8000
      protocol      = "tcp"
    }]

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:8000/ping || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }

    environment = [
      { name = "LITELLM_GATEWAY_URL", value = module.litellm.gateway_endpoint },
      { name = "LITELLM_CONFIG_S3_BUCKET", value = module.litellm.config_s3_bucket },
      { name = "LITELLM_CONFIG_S3_PREFIX", value = "litellm" },
      { name = "LITELLM_ECS_CLUSTER", value = aws_ecs_cluster.main.name },
      { name = "LITELLM_ECS_SERVICE", value = module.litellm.ecs_service_name },
      { name = "LITELLM_TEAM_BUDGET_CAP_USD", value = "10000" },
      { name = "AWS_REGION", value = "us-east-2" },
      { name = "USE_DEV_AUTH", value = "true" },
      { name = "DEPLOYMENTS_TABLE_NAME", value = "fsi-control-plane-deployments" },
      { name = "GUARDRAILS_TABLE_NAME", value = "fsi-control-plane-guardrails" },
      { name = "FINOPS_SPEND_TABLE_NAME", value = "fsi-control-plane-finops-spend" },
      { name = "GOVERN_AUDIT_TABLE_NAME", value = "fsi-control-plane-govern-audit" },
      { name = "GOVERN_CONFORMANCE_TABLE_NAME", value = "fsi-control-plane-govern-conformance" },
      { name = "GOVERN_GRADUATION_TABLE_NAME", value = "fsi-control-plane-govern-graduation" },
      { name = "GOVERN_SR26_TABLE_NAME", value = "fsi-control-plane-govern-sr26" },
      { name = "GOVERN_ENFORCEMENT_TABLE_NAME", value = "fsi-control-plane-govern-enforcement" },
      { name = "GOVERN_A2A_TRUST_TABLE_NAME", value = "fsi-control-plane-govern-a2a-trust" },
      { name = "PYTHONPATH", value = "/app/src" },
    ]

    secrets = [
      { name = "LITELLM_MASTER_KEY", valueFrom = module.litellm.litellm_master_key_secret_arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  tags = {
    Name        = "ava-control-plane-backend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# ECS Service — Backend
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "backend" {
  name            = "ava-control-plane-backend"
  cluster         = aws_ecs_cluster.main.arn
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_groups  = [aws_security_group.backend_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.backend]

  tags = {
    Name        = "ava-control-plane-backend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# DynamoDB Tables
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "deployments" {
  name         = "fsi-control-plane-deployments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-deployments"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "guardrails" {
  name         = "fsi-control-plane-guardrails"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-guardrails"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "finops_spend" {
  name         = "fsi-control-plane-finops-spend"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-finops-spend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — append-only audit / decision log (Human Oversight handoff
# decisions, guardrail activity, incidents). Single-partition, sortable sk for
# newest-first queries. Same shape as the other control-plane tables.
resource "aws_dynamodb_table" "govern_audit" {
  name         = "fsi-control-plane-govern-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-audit"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — ISO/IEC 42001 AIMS conformance records (editable clause
# controls with status/evidence/owner). CRUD record store, same shape as the
# other control-plane tables.
resource "aws_dynamodb_table" "govern_conformance" {
  name         = "fsi-control-plane-govern-conformance"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-conformance"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — earned/progressive autonomy graduation records (grant intent;
# signals computed live from the audit log). Same shape as the other tables.
resource "aws_dynamodb_table" "govern_graduation" {
  name         = "fsi-control-plane-govern-graduation"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-graduation"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — SR 26-2 agent-aware model-risk control mappings. Same shape.
resource "aws_dynamodb_table" "govern_sr26" {
  name         = "fsi-control-plane-govern-sr26"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-sr26"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — runtime enforcement decisions (append-only) + policies.
resource "aws_dynamodb_table" "govern_enforcement" {
  name         = "fsi-control-plane-govern-enforcement"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-enforcement"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — A2A trust policies + agent identities (delegation authz).
resource "aws_dynamodb_table" "govern_a2a_trust" {
  name         = "fsi-control-plane-govern-a2a-trust"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Name        = "fsi-control-plane-govern-a2a-trust"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}


# =============================================================================
# AVA Control Plane Frontend — Public-Facing ECS Fargate Service
# =============================================================================
# Deploys the React frontend (Nginx) as a Fargate task with a public ALB
# restricted to a single IP address for development access.
# =============================================================================

# -----------------------------------------------------------------------------
# CloudWatch Log Group — Frontend
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/ava-control-plane-frontend"
  retention_in_days = 30

  tags = {
    Name        = "ava-control-plane-frontend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Frontend ALB (Public, IP-restricted)
# -----------------------------------------------------------------------------

resource "aws_security_group" "frontend_alb" {
  name        = "ava-frontend-alb-sg"
  description = "Security group for AVA frontend public ALB - IP restricted"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow HTTP from developer IP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["67.188.13.146/32"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "ava-frontend-alb-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Security Group — Frontend Tasks
# -----------------------------------------------------------------------------

resource "aws_security_group" "frontend_tasks" {
  name        = "ava-frontend-tasks-sg"
  description = "Security group for AVA frontend ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Allow port 80 from frontend ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend_alb.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "ava-frontend-tasks-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Application Load Balancer — Frontend (Public)
# -----------------------------------------------------------------------------

resource "aws_lb" "frontend" {
  name               = "ava-frontend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.frontend_alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  tags = {
    Name        = "ava-frontend-alb"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lb_target_group" "frontend" {
  name        = "ava-frontend-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name        = "ava-frontend-tg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lb_listener" "frontend" {
  load_balancer_arn = aws_lb.frontend.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# -----------------------------------------------------------------------------
# ECS Task Definition — Frontend
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "frontend" {
  family                   = "ava-control-plane-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.backend_execution.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = var.frontend_image
    essential = true

    portMappings = [{
      containerPort = 80
      protocol      = "tcp"
    }]

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])

  tags = {
    Name        = "ava-control-plane-frontend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# ECS Service — Frontend
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "frontend" {
  name            = "ava-control-plane-frontend"
  cluster         = aws_ecs_cluster.main.arn
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_groups  = [aws_security_group.frontend_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.frontend]

  tags = {
    Name        = "ava-control-plane-frontend"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
