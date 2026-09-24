terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # Partial backend configuration — see infra/main.tf. Injected at init time by
  # deploy_agent.sh with a runtime-scoped key.
  backend "s3" {
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
}

# Local variables for workspace-aware state path
locals {
  # Determine the correct state file path based on workspace
  # Default workspace uses terraform.tfstate directly
  # Named workspaces use terraform.tfstate.d/<workspace>/terraform.tfstate
  # Workspace naming convention: {use_case_id}-{framework_short}-{aws_region}
  workspace_name   = terraform.workspace
  infra_state_path = local.workspace_name == "default" ? "../infra/terraform.tfstate" : "../infra/terraform.tfstate.d/${local.workspace_name}/terraform.tfstate"

  # Framework short name mapping for resource naming
  framework_short_map = {
    "langchain_langgraph" = "langgraph"
    "crewai"              = "crewai"
    "llamaindex"          = "llamaindex"
  }

  # Use case short name mapping to handle AWS naming length limits
  use_case_short_map = {
    "customer_engagement"      = "custeng"
    "customer_service"         = "custsvc"
    "customer_chatbot"         = "custbot"
    "customer_support"         = "custsup"
    "kyc_banking"              = "kyc"
    "agentic_payments"         = "agpay"
    "agentic_commerce"         = "agcom"
    "payment_operations"       = "payops"
    "corporate_sales"          = "corpsales"
    "document_processing"      = "docproc"
    "document_search"          = "docsrch"
    "fraud_detection"          = "fraud"
    "credit_risk"              = "credrisk"
    "compliance_investigation" = "compinv"
    "adverse_media"            = "advmedia"
    "market_surveillance"      = "mktsurv"
    "investment_advisory"      = "invadv"
    "investment_management"    = "invmgmt"
    "earnings_summarization"   = "earnsum"
    "economic_research"        = "econres"
    "email_triage"             = "emailtri"
    "trading_assistant"        = "tradeast"
    "trading_insights"         = "tradeins"
    "research_credit_memo"     = "credmemo"
    "data_analytics"           = "dataanly"
    "call_center_analytics"    = "ccanalytics"
    "post_call_analytics"      = "postcall"
    "call_summarization"       = "callsum"
    "claims_management"        = "claims"
    "life_insurance_agent"     = "lifeins"
    "legacy_migration"         = "legmig"
    "code_generation"          = "codegen"
    "mainframe_migration"      = "mfmig"
    "ai_assistant"             = "aiasst"
  }

  # Derive framework short name from framework variable
  framework_short = lookup(local.framework_short_map, var.framework, var.framework)

  # Derive use case short name with fallback to original
  use_case_short = lookup(local.use_case_short_map, var.use_case_id, var.use_case_id)

  # Derive agent_name from use_case_id and framework if not explicitly provided
  # AgentCore requires: [a-zA-Z][a-zA-Z0-9_]{0,47} (max 48 characters)
  # Convert hyphens to underscores and ensure valid format.
  # use_case_name is capped at 32 chars at the ingestion boundary (frontend
  # maxLength + backend validator), which keeps the derived agent_name
  # inside the 48-char limit without per-resource truncation logic.
  use_case_short_safe  = replace(local.use_case_short, "-", "_")
  framework_short_safe = replace(local.framework_short, "-", "_")
  derived_agent_name   = "ava_${local.use_case_short_safe}_${local.framework_short_safe}"
  agent_name           = var.agent_name != "" ? var.agent_name : local.derived_agent_name
}

# Reference infrastructure module outputs.
#
# infra's state lives in S3 whenever the deploy injects a state bucket (the AVA
# pipeline always does), and on local disk for standalone development. Both are
# supported here because `backend` and `config` are ordinary data-source arguments:
# reading a local path while infra writes to S3 would silently resolve stale or
# missing outputs.
data "terraform_remote_state" "infra" {
  backend = var.infra_state_bucket != "" ? "s3" : "local"

  config = var.infra_state_bucket != "" ? {
    bucket = var.infra_state_bucket
    key    = var.infra_state_key
    region = var.aws_region
    } : {
    path = local.infra_state_path
  }
}

# Local variables for resource naming
locals {
  # Resource prefix includes framework for isolation (Requirement 2.1)
  resource_prefix = "${data.terraform_remote_state.infra.outputs.project_name}-${var.use_case_id}-${local.framework_short}"
  region_suffix   = replace(var.aws_region, "-", "")
  # CloudFormation stack names must match [a-zA-Z][-a-zA-Z0-9]* (no underscores)
  # Convert underscores to hyphens for stack naming
  use_case_id_cfn     = replace(var.use_case_id, "_", "-")
  framework_short_cfn = replace(local.framework_short, "_", "-")
}

# Image reference: a PLAIN tag (e.g. "strands-20260629-201145"), never
# "<tag>@sha256:<digest>".
#
# Bedrock AgentCore's container pull cannot resolve the `<tag>@sha256:<digest>`
# reference form — given that form the pull fails before the container starts,
# and every invocation returns HTTP 502 after a ~65s health-check timeout with
# no application logs. (A plain `<repo>:<tag>` pulls fine.)
#
# We previously composed `tag@digest` to force AgentCore to re-pull when the
# same mutable tag (e.g. `strands-latest`) was re-pushed. That is solved
# instead by the build pushing a UNIQUE immutable tag per build and passing it
# in via var.image_tag — so every deploy already has a distinct tag and no
# digest pinning is needed. See modules/codebuild/buildspec.yml.

# ---------------------------------------------------------------------------
# Governance Lambda function NAMES (kyc_governance_insights) sourced from SSM.
#
# When var.governance_ssm_prefix is set, read the 5 function names the kyc-gov service
# stacks publish to SSM (decoupled cross-stack reference — invariant #7). A
# missing parameter makes the apply FAIL LOUD (no silent fallback — invariant #5).
# When the prefix is empty (every non-governance use case), no SSM lookups happen
# and the var.*_function values (default "") are used unchanged.
# ---------------------------------------------------------------------------
locals {
  governance_from_ssm = var.governance_ssm_prefix != ""
}

data "aws_ssm_parameter" "deterministic_check_function" {
  count = local.governance_from_ssm ? 1 : 0
  name  = "${var.governance_ssm_prefix}/deterministic-check-function"
}

data "aws_ssm_parameter" "sanctions_check_function" {
  count = local.governance_from_ssm ? 1 : 0
  name  = "${var.governance_ssm_prefix}/sanctions-check-function"
}

data "aws_ssm_parameter" "pep_check_function" {
  count = local.governance_from_ssm ? 1 : 0
  name  = "${var.governance_ssm_prefix}/pep-check-function"
}

data "aws_ssm_parameter" "policy_cascade_function" {
  count = local.governance_from_ssm ? 1 : 0
  name  = "${var.governance_ssm_prefix}/policy-cascade-function"
}

data "aws_ssm_parameter" "llm_judge_function" {
  count = local.governance_from_ssm ? 1 : 0
  name  = "${var.governance_ssm_prefix}/llm-judge-function"
}

locals {
  # Effective governance URLs: SSM value when prefix is set, else the passed var.
  deterministic_check_function = local.governance_from_ssm ? data.aws_ssm_parameter.deterministic_check_function[0].value : var.deterministic_check_function
  sanctions_check_function     = local.governance_from_ssm ? data.aws_ssm_parameter.sanctions_check_function[0].value : var.sanctions_check_function
  pep_check_function           = local.governance_from_ssm ? data.aws_ssm_parameter.pep_check_function[0].value : var.pep_check_function
  policy_cascade_function      = local.governance_from_ssm ? data.aws_ssm_parameter.policy_cascade_function[0].value : var.policy_cascade_function
  llm_judge_function           = local.governance_from_ssm ? data.aws_ssm_parameter.llm_judge_function[0].value : var.llm_judge_function
}

# AgentCore Runtime via CloudFormation
# Include use_case_id, framework, and region in stack name to support multi-deployment isolation
resource "aws_cloudformation_stack" "agentcore_runtime" {
  # CloudFormation stack names can only contain alphanumeric characters and hyphens
  # Include framework_short_cfn for framework isolation (Requirement 2.8)
  name = "ava-${local.use_case_id_cfn}-${local.framework_short_cfn}-agentcore-runtime-${local.region_suffix}"

  template_body = file("${path.module}/agentcore_runtime.yaml")

  parameters = {
    AgentName     = local.agent_name
    RoleArn       = data.terraform_remote_state.infra.outputs.agentcore_role_arn
    ECRRepository = data.terraform_remote_state.infra.outputs.agentcore_ecr_repository
    # Plain tag only. AgentCore cannot pull "<tag>@sha256:<digest>" (results in
    # a 502 with no logs). Cache-busting on redeploy is handled by the build
    # pushing a unique tag per build (see buildspec.yml), not by digest pinning.
    ImageTag                  = var.image_tag
    DataBucket                = data.terraform_remote_state.infra.outputs.s3_data_bucket
    BedrockModelId            = var.bedrock_model_id
    Description               = "AVA - ${var.use_case_name} (${var.framework})"
    Environment               = data.terraform_remote_state.infra.outputs.environment
    AwsRegion                 = data.terraform_remote_state.infra.outputs.aws_region
    UseCaseId                 = var.use_case_id
    UseCaseName               = var.use_case_name
    Framework                 = var.framework
    EnableTracing             = var.enable_tracing
    LangfuseHost              = var.langfuse_host
    LangfuseSecretName        = var.langfuse_secret_name
    GuardrailId               = var.guardrail_id
    GuardrailVersion          = var.guardrail_version
    LlmGatewayBaseUrl         = var.llm_gateway_base_url
    LlmGatewayApiKeySecretArn = var.llm_gateway_api_key_secret_arn
    # Governance function names (kyc_governance_insights). Sourced from SSM when
    # var.governance_ssm_prefix is set (invariant #7), else the passed vars.
    # Empty for every other use case.
    DeterministicCheckFunctionName = local.deterministic_check_function
    SanctionsCheckFunctionName     = local.sanctions_check_function
    PepCheckFunctionName           = local.pep_check_function
    PolicyCascadeFunctionName      = local.policy_cascade_function
    LlmJudgeFunctionName           = local.llm_judge_function
    GovernanceMode                 = var.governance_mode
  }

  capabilities = ["CAPABILITY_IAM"]

  tags = {
    Name           = "${local.resource_prefix}-agentcore-runtime"
    Environment    = data.terraform_remote_state.infra.outputs.environment
    Region         = var.aws_region
    UseCase        = var.use_case_id
    Framework      = var.framework
    FrameworkShort = local.framework_short
  }
}

# ---------------------------------------------------------------------------
# AgentCore Observability (CloudWatch GenAI Observability)
#
# Routes service-side runtime logs to CloudWatch Logs and tracing spans to
# X-Ray (which then surface in CloudWatch Transaction Search and the
# GenAI Observability console). Separate from Langfuse — Langfuse is wired
# via OTEL env vars on the container; this is the AWS-managed pipeline that
# AgentCore itself emits.
#
# Prereq: CloudWatch Transaction Search must be enabled in the account/region.
# Set enable_xray_transaction_search=true on the first deployment to wire the
# one-time X-Ray resource policy + trace segment destination switch.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {
  count = var.enable_agentcore_observability ? 1 : 0
}

# CloudWatch log group that receives APPLICATION_LOGS for this runtime.
resource "aws_cloudwatch_log_group" "agentcore_runtime" {
  count = var.enable_agentcore_observability ? 1 : 0

  name              = "/aws/vendedlogs/bedrock-agentcore/runtimes/${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeId"]}"
  retention_in_days = var.agentcore_log_retention_days

  tags = {
    Name      = "${local.resource_prefix}-agentcore-runtime-logs"
    UseCase   = var.use_case_id
    Framework = var.framework
  }
}

resource "aws_cloudwatch_log_delivery_source" "agentcore_logs" {
  count = var.enable_agentcore_observability ? 1 : 0

  name         = "${local.resource_prefix}-${local.region_suffix}-logs"
  log_type     = "APPLICATION_LOGS"
  resource_arn = aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeArn"]
}

resource "aws_cloudwatch_log_delivery_destination" "agentcore_logs" {
  count = var.enable_agentcore_observability ? 1 : 0

  name = "${local.resource_prefix}-${local.region_suffix}-logs-dest"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.agentcore_runtime[0].arn
  }
}

resource "aws_cloudwatch_log_delivery" "agentcore_logs" {
  count = var.enable_agentcore_observability ? 1 : 0

  delivery_source_name     = aws_cloudwatch_log_delivery_source.agentcore_logs[0].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.agentcore_logs[0].arn
}

# TRACES → X-Ray delivery is not yet supported by the AWS provider's
# aws_cloudwatch_log_delivery_destination resource (XRAY is missing from the
# enum in v5.x). Falls back to a CLI bootstrap.
#
# The names are stable but the runtime ARN is not: AgentCore mints a new runtime id
# whenever the runtime is recreated. PutDeliverySource refuses to repoint an existing
# source at a different resource ARN and returns ConflictException, so a redeploy after a
# teardown used to fail here with "Update to existing Delivery Source". These resources
# are created by the CLI rather than Terraform, so `terraform destroy` never removes them
# and the stale source outlives the deployment. The script therefore recreates the source
# when it finds a conflict, deleting the delivery that references it first.
locals {
  traces_source_name = substr("${local.resource_prefix}-${local.region_suffix}-traces", 0, 60)
  traces_dest_name   = substr("${local.resource_prefix}-${local.region_suffix}-traces-dest", 0, 60)
}

resource "null_resource" "agentcore_traces_delivery" {
  count = var.enable_agentcore_observability ? 1 : 0

  triggers = {
    runtime_arn = aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeArn"]
    region      = var.aws_region
    source      = local.traces_source_name
    dest        = local.traces_dest_name
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      REGION="${var.aws_region}"
      RUNTIME_ARN="${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeArn"]}"
      SOURCE_NAME="${local.traces_source_name}"
      DEST_NAME="${local.traces_dest_name}"

      put_source() {
        aws logs put-delivery-source \
          --name "$SOURCE_NAME" \
          --log-type TRACES \
          --resource-arn "$RUNTIME_ARN" \
          --region "$REGION" >/dev/null 2>/tmp/put_delivery_source.err
      }

      if ! put_source; then
        if grep -qiE "conflict|existing delivery source" /tmp/put_delivery_source.err; then
          echo "delivery source $SOURCE_NAME exists for a previous runtime — recreating it"
          # A delivery source cannot be deleted while a delivery references it.
          for DID in $(aws logs describe-deliveries --region "$REGION" \
              --query "deliveries[?deliverySourceName=='$SOURCE_NAME'].id" --output text 2>/dev/null); do
            [ -n "$DID" ] && [ "$DID" != "None" ] || continue
            aws logs delete-delivery --id "$DID" --region "$REGION" >/dev/null 2>&1 || true
          done
          aws logs delete-delivery-source --name "$SOURCE_NAME" --region "$REGION" >/dev/null 2>&1 || true
          put_source || { echo "put-delivery-source failed after recreate:" >&2
                          cat /tmp/put_delivery_source.err >&2; exit 1; }
        else
          echo "put-delivery-source failed:" >&2
          cat /tmp/put_delivery_source.err >&2
          exit 1
        fi
      fi

      aws logs put-delivery-destination \
        --name "$DEST_NAME" \
        --delivery-destination-type XRAY \
        --region "$REGION" >/dev/null

      DEST_ARN=$(aws logs get-delivery-destination \
        --name "$DEST_NAME" \
        --region "$REGION" \
        --query 'deliveryDestination.arn' --output text)

      # create-delivery is the only non-idempotent call here. If it already
      # exists, swallow that specific error; any other failure should fail
      # the apply so we don't silently end up with sources/destinations but
      # no delivery linking them.
      ERR=$(aws logs create-delivery \
        --delivery-source-name "$SOURCE_NAME" \
        --delivery-destination-arn "$DEST_ARN" \
        --region "$REGION" 2>&1 >/dev/null) || true
      if [ -n "$ERR" ] && ! echo "$ERR" | grep -qiE "already exists|conflict"; then
        echo "create-delivery failed: $ERR" >&2
        exit 1
      fi
    EOT
  }

  depends_on = [aws_cloudformation_stack.agentcore_runtime]
}

# ---- Account/region-level Transaction Search prereq (optional, run once) ----
# X-Ray must be allowed to write spans to the aws/spans + application-signals
# log groups. This is account-wide; only flip the flag on for the first
# deployment in a given account/region.

# X-Ray Transaction Search is enabled ONCE per account/region by the Control
# Plane infrastructure (platform/control_plane/infrastructure/main.tf), not
# here. The Control Plane manages:
#   - aws_cloudwatch_log_resource_policy.xray_to_cwlogs (account-wide policy)
#   - aws_cloudformation_stack.xray_transaction_search wrapping
#     AWS::XRay::TransactionSearchConfig (which causes AWS to auto-create
#     the aws/spans log group and flip the trace segment destination to
#     CloudWatchLogs)
#
# Per-runtime, we only need to grant the AgentCore service principal X-Ray
# write permissions. AWS handles the log group provisioning service-side.
resource "aws_xray_resource_policy" "agentcore_observability" {
  count = var.enable_xray_transaction_search ? 1 : 0

  policy_name = "AgentCoreObservabilityXRayAccess"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AgentCoreXRayWrite"
        Effect = "Allow"
        Principal = {
          Service = "bedrock-agentcore.amazonaws.com"
        }
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      }
    ]
  })
}

# Drop legacy resources from state on existing deployments WITHOUT destroying
# the underlying AWS resources. The aws_cloudwatch_log_group.aws_spans had
# `prevent_destroy = true`, the null_resources were the v3.0 hotfix attempts
# that all failed against AWS's reservation of `aws/`-prefixed names.
# Requires Terraform 1.7+.
removed {
  from = aws_cloudwatch_log_group.aws_spans
  lifecycle {
    destroy = false
  }
}

removed {
  from = null_resource.aws_spans_log_group
  lifecycle {
    destroy = false
  }
}

removed {
  from = null_resource.xray_trace_segment_destination
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_cloudwatch_log_resource_policy.xray_transaction_search
  lifecycle {
    destroy = false
  }
}
