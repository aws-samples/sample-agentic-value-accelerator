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

# INCOMPLETE FOR GOVERN, on purpose and not silently. The policies attached below cover what
# AVA needs to run itself - its DynamoDB tables, its buckets, ECS, its own secrets, plus
# Bedrock INFERENCE (InvokeModel). They grant nothing Govern READS: no ce, cloudwatch, logs,
# cloudtrail, securityhub, guardduty, macie2, inspector2, access-analyzer, detective, config,
# organizations, verifiedpermissions, servicequotas, health, support, xray, bedrock-agentcore,
# sagemaker or budgets. Measured: the only services any backend_task_* policy names are
# bedrock, dynamodb, ecs, iam, s3 and secretsmanager.
#
# So a control plane created by this root alone renders every Govern panel as live=false. That
# now degrades honestly - each response names the denied call rather than publishing a zero -
# but the reading is misleading in a different way: "Security Hub unavailable" looks like the
# customer has not enabled Security Hub, when the truth is this role was never granted
# securityhub:GetFindings.
#
# The 172 read actions Govern needs already exist, in infrastructure/iam/ava-govern-role.yaml,
# which no Terraform in this repo references. They are NOT copied here because the two sets do
# not fit on one role: that template's actions come to roughly 8-9 KB against IAM's
# 10,240-character aggregate inline-policy limit, and the DynamoDB policy below enumerates
# every table ARN plus /index/*, which would push it past the ceiling and fail at apply.
# Converting that template to managed policies hits the other limit - 12 policies against a
# default quota of 10 attachments per role.
#
# Merging them therefore needs a Service Quotas increase first. infrastructure/iam/README.md
# has the full per-service comparison and what to do in each deployment shape. Duplicating
# the action list here without resolving the limit would produce an apply-time failure and a
# second place for the list to drift.
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
      Resource = concat([
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
        "${aws_dynamodb_table.govern_a2a_trust.arn}/index/*",
        aws_dynamodb_table.govern_compliance.arn,
        "${aws_dynamodb_table.govern_compliance.arn}/index/*",
        aws_dynamodb_table.govern_operations.arn,
        "${aws_dynamodb_table.govern_operations.arn}/index/*",
        # Declaring the table is not enough on its own. This policy enumerates table ARNs
        # rather than granting dynamodb:* on "*", so a table absent from this list is
        # unreadable even once it exists - and PolicyService's new failure handling would
        # log one WARNING, latch its cool-off, and report source="unavailable" forever
        # without the reason ever naming IAM. Correct degradation, permanently wrong answer.
        aws_dynamodb_table.policies.arn,
        "${aws_dynamodb_table.policies.arn}/index/*"
        ],
        # The nine tables added with the aws_dynamodb_table.control_plane for_each below.
        # Derived from that resource rather than restated, because this policy enumerates ARNs
        # instead of granting dynamodb:* on "*" - so a table missing from here is unreadable
        # even though it exists, and the comment above already records how quietly that fails.
        # Restating nine names would give the omission a second place to happen; concat over
        # the resource itself cannot drift from the set of tables actually created.
        flatten([
          for t in aws_dynamodb_table.control_plane : [t.arn, "${t.arn}/index/*"]
      ]))
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
      # Two regions, and they are not interchangeable. AWS_REGION addresses AVA's own
      # control-plane DynamoDB tables (tier 1); GOVERN_AWS_REGION is where the governed
      # Bedrock/AgentCore fleet lives (tier 2). See backend/src/core/region_config.py.
      #
      # AWS_REGION reads var.aws_region instead of repeating "us-east-2" as a literal. The
      # tables below are created by this root's provider, whose region IS var.aws_region,
      # so binding the two makes it impossible for the region the backend reads from to
      # drift from the region the tables were actually created in. With a literal,
      # `-var aws_region=us-west-2` would provision all 11 tables in us-west-2 and still
      # point the backend at us-east-2, where every Scan returns an empty list and no
      # error. Both render us-east-2 today; variables.tf explains why that is the default.
      #
      # GOVERN_AWS_REGION must NOT follow var.aws_region - it is a fact about the customer's
      # AI estate, not about where this root deploys - but it is no longer a literal either.
      # "us-east-1" hardcoded here was the one region an AVA deployer could not configure:
      # someone governing eu-west-1 had to edit this file, and if they did not, Bedrock,
      # CloudWatch, CloudTrail and Service Quotas each answered 200 with us-east-1's empty
      # inventory. Per-region APIs do not error on the wrong region, so there was no
      # exception to catch and no note to render - the Operations Hub reported a 1-agent
      # fleet against a real fleet of 36 exactly this way, under a Live badge.
      #
      # var.govern_aws_region defaults to "", which config.py resolves to AWS_REGION. Passing
      # "" through rather than suppressing the env var is deliberate: Settings.__init__ owns
      # that resolution, so there is one place where "unset means follow the control plane"
      # is decided instead of two that can drift.
      { name = "AWS_REGION", value = var.aws_region },
      { name = "GOVERN_AWS_REGION", value = var.govern_aws_region },
      { name = "USE_DEV_AUTH", value = "true" },
      { name = "DEPLOYMENTS_TABLE_NAME", value = "fsi-control-plane-deployments" },
      { name = "GUARDRAILS_TABLE_NAME", value = "fsi-control-plane-guardrails" },
      # Required, not optional: without it table_region("GUARDRAILS") falls through to
      # AWS_REGION and a misplaced table reads as an empty one with no error.
      #
      # The literal "us-east-1" that used to be here was true of the demo account and false
      # of every other deployment, and it contradicted this very root: aws_dynamodb_table
      # .guardrails is created by this provider, so for anyone deploying fresh the table is
      # in var.aws_region and this env var was sending reads to a region where Terraform had
      # just created no such table. Terraform disagreeing with itself about where a table it
      # owns lives is the worst version of this bug, because the plan output looks correct.
      #
      # var.guardrails_table_region defaults to "" meaning "wherever this root created it".
      # The demo account overrides it to us-east-1, where its guardrails table was
      # provisioned before the control plane moved to us-east-2.
      { name = "GUARDRAILS_TABLE_REGION", value = var.guardrails_table_region != "" ? var.guardrails_table_region : var.aws_region },
      { name = "FINOPS_SPEND_TABLE_NAME", value = "fsi-control-plane-finops-spend" },
      { name = "GOVERN_AUDIT_TABLE_NAME", value = "fsi-control-plane-govern-audit" },
      { name = "GOVERN_CONFORMANCE_TABLE_NAME", value = "fsi-control-plane-govern-conformance" },
      { name = "GOVERN_GRADUATION_TABLE_NAME", value = "fsi-control-plane-govern-graduation" },
      { name = "GOVERN_SR26_TABLE_NAME", value = "fsi-control-plane-govern-sr26" },
      { name = "GOVERN_ENFORCEMENT_TABLE_NAME", value = "fsi-control-plane-govern-enforcement" },
      { name = "GOVERN_A2A_TRUST_TABLE_NAME", value = "fsi-control-plane-govern-a2a-trust" },
      # The two tables added in this change set. Declared explicitly to match every other
      # table above, and because the names they replace (ava-operations-incidents,
      # ava-govern-compliance) existed in no region: a silent fallback to a default is not
      # a safe way to address an attestation store.
      { name = "GOVERN_OPERATIONS_TABLE_NAME", value = "fsi-control-plane-govern-operations" },
      { name = "GOVERN_COMPLIANCE_TABLE_NAME", value = "fsi-control-plane-govern-compliance" },
      # The nine tables this root now creates (aws_dynamodb_table.control_plane). Read from
      # the resource, not restated as literals, so the name the backend is told to use is by
      # construction the name Terraform created. Every other table above is a literal that
      # happens to match config.py's default; these cannot drift even in principle.
      { name = "APP_FACTORY_TABLE_NAME", value = aws_dynamodb_table.control_plane["app_factory"].name },
      { name = "BUSINESS_CASES_TABLE_NAME", value = aws_dynamodb_table.control_plane["business_cases"].name },
      { name = "GOVERN_MARKETPLACE_TABLE_NAME", value = aws_dynamodb_table.control_plane["govern_marketplace"].name },
      { name = "GOVERN_VALIDATION_PANEL_TABLE_NAME", value = aws_dynamodb_table.control_plane["govern_validation_panel"].name },
      { name = "KNOWLEDGE_TABLE_NAME", value = aws_dynamodb_table.control_plane["knowledge"].name },
      { name = "MATURITY_TABLE_NAME", value = aws_dynamodb_table.control_plane["maturity"].name },
      { name = "OPERATING_MODEL_TABLE_NAME", value = aws_dynamodb_table.control_plane["operating_model"].name },
      { name = "ORGANIZATION_DESIGN_TABLE_NAME", value = aws_dynamodb_table.control_plane["organization_design"].name },
      { name = "PRIORITIZATION_TABLE_NAME", value = aws_dynamodb_table.control_plane["prioritization"].name },
      # The policy metadata store. This env var was missing while the other twelve were
      # present, and the setting's default was the empty string, so PolicyService built
      # boto3.resource("dynamodb").Table("") - which constructs without complaint, because
      # the resource factory validates nothing. Validation happens in botocore's serializer
      # at call time, so the empty name survived __init__ inside a module-level lazy
      # singleton and detonated once per request, deep inside a read, as a ParamValidationError
      # logged at ERROR. The table itself was ACTIVE and empty in us-east-2 the whole time:
      # a working store nobody was addressing.
      { name = "POLICIES_TABLE_NAME", value = "fsi-control-plane-policies" },
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

# Govern module — compliance control attestations + evidence.
# pk = COMPLIANCE#<framework_id> or EVIDENCE#<framework_id>#<control_id>, sk = control_id.
# Attestations are partitioned per framework id, so a framework's rows are one query.
#
# This table was previously referenced by the backend as "ava-govern-compliance" in
# us-east-1 and was never declared here, so it existed in no region. The service silently
# fell back to a class-level in-memory dict: attestation writes returned 200 and were lost
# on every restart. Declared here so the name has one source of truth.
resource "aws_dynamodb_table" "govern_compliance" {
  name         = "fsi-control-plane-govern-compliance"
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

  # PITR on, unlike the other tables in this root. This one holds compliance control
  # attestations and their evidence - who signed off on which control, when, and against
  # what AWS signal. That is the audit record a regulator would ask for, and it is the one
  # kind of data here that cannot be regenerated by re-running a scan: auto-detected rows
  # can be rebuilt, human attestations cannot. Matches the 17 tables in modules/dynamodb,
  # which all enable it.
  #
  # deletion_protection is deliberately NOT set, so `terraform destroy` still works for dev
  # teardown as documented in this environment's README. Turn it on before this table holds
  # any attestation that matters.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "fsi-control-plane-govern-compliance"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Govern module — Operations Hub records (incidents, alerts, SLAs, change events).
# Renamed from "ava-operations-incidents", which was off the fsi-control-plane-* convention
# and existed in no region, so every Operations write went nowhere and the API reported
# source="memory" with no note explaining why. Nothing was ever stored under the old name,
# so there is no data to migrate.
resource "aws_dynamodb_table" "govern_operations" {
  name         = "fsi-control-plane-govern-operations"
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

  # PITR on. Incident records carry MTTR/MTTD timelines that feed the Operations Hub's SLA
  # reporting; unlike the fleet inventory, none of it can be re-derived from AWS after the
  # fact, because the incidents themselves are entered here rather than discovered.
  # deletion_protection left off for the same dev-teardown reason as govern_compliance.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "fsi-control-plane-govern-operations"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Policy metadata and policy audit events, written by PolicyService.
# pk/sk only. This is deliberately NOT a copy of modules/dynamodb's "policies" table, which
# also declares a `status` attribute and a `status-index` GSI with ALL projection. Verified
# against the live table: it has no GSI, and policy_service.py only ever Scans, never Queries
# an index, so the GSI in the module root is drift - it would be provisioned, billed, and
# never read. Declaring it here to match the module would have created that cost in this root
# too. If a status query is ever added, add the GSI back in the same change as the query.
#
# The name was absent from this root entirely while the backend's POLICIES_TABLE_NAME default
# was "", so a fresh dev deploy reproduced exactly the empty-table-name crash described at
# that env var above. See the comment there for why an empty name fails at call time rather
# than at construction.
resource "aws_dynamodb_table" "policies" {
  name         = "fsi-control-plane-policies"
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

  # PITR on, for the same reason as govern_compliance: this table holds policy audit events,
  # which are a record of what was decided and by whom. A scan can rebuild an inventory; it
  # cannot rebuild the history of decisions made against it.
  #
  # Confirmed DISABLED on the live table as of 2026-09-14, so this declaration is currently
  # drift in the honest direction - Terraform says what the table should be, the table has not
  # been reconciled yet. Reconcile with `terraform apply` rather than by hand, so the table and
  # this file cannot disagree again.
  #
  # deletion_protection left off for the same dev-teardown reason as govern_compliance.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "fsi-control-plane-policies"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# The nine control-plane tables the backend expected and no Terraform created
# -----------------------------------------------------------------------------
# Every one of these is a `*_TABLE_NAME` default in backend/src/core/config.py with a
# concrete `fsi-control-plane-*` name, so the backend addresses them on the assumption they
# exist. Nothing in this repo created them. A deployer who ran this root got a control plane
# whose Use Cases, Business Cases, Maturity assessments, Operating Model, Organization
# Design, App Factory submissions, Knowledge registrations, Marketplace listings and
# adversarial Validation Panels all pointed at tables that were never provisioned - which is
# precisely the "DynamoDB (prioritization) / Error" class of symptom this environment hit.
#
# `fsi-control-plane-govern-validation-panel` is the sharpest case: GovernValidationService
# was just hardened to stop silently swallowing store failures, and the store it addresses
# had no Terraform at all. The service degrades correctly to its in-memory fallback and now
# says so in the log, but "correct degradation, permanently in memory" is not a provisioned
# audit trail.
#
# Grouped under one for_each rather than nine copy-pasted resource blocks because they are
# genuinely identical - `pk` (S) hash + `sk` (S) range, no GSI, no TTL, verified against
# every put_item/get_item/query call site in the nine services - and because the bug being
# fixed here was an OMISSION. A single list is auditable at a glance against config.py; nine
# near-identical blocks are exactly the shape in which a tenth goes missing. The IAM policy
# above derives its ARNs from this same map for the same reason.
#
# PITR on all nine: unlike deployments/finops-spend, none of these is a cache of AWS state
# that a re-scan could rebuild. They hold hand-authored work product (assessments, business
# cases, operating models) and audit records (validation verdicts, marketplace subscription
# history). The twelve tables above predate this rule and are deliberately left as they are;
# changing an existing table's backup posture is not this change set's business.
locals {
  # Keys are Terraform-local identifiers; values are the table names config.py defaults to.
  # Keep this map and the *_TABLE_NAME defaults in config.py in lockstep.
  control_plane_tables = {
    app_factory             = "fsi-control-plane-app-factory"
    business_cases          = "fsi-control-plane-business-cases"
    govern_marketplace      = "fsi-control-plane-govern-marketplace"
    govern_validation_panel = "fsi-control-plane-govern-validation-panel"
    knowledge               = "fsi-control-plane-knowledge"
    maturity                = "fsi-control-plane-maturity"
    operating_model         = "fsi-control-plane-operating-model"
    organization_design     = "fsi-control-plane-organization-design"
    prioritization          = "fsi-control-plane-prioritization"
  }
}

resource "aws_dynamodb_table" "control_plane" {
  for_each = local.control_plane_tables

  name         = each.value
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

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = each.value
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
