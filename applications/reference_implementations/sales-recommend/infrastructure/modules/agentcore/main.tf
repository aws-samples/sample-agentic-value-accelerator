###############################################################################
# AgentCore Module — Code-based Deployment (proven-working method in this account)
#
# Container-based deployment 502s in this account across 10 versions despite a
# provably-correct image (works locally). Code deploy (S3 zip + managed
# PYTHON_3_12) is the method the working reference runtime uses and is proven.
###############################################################################

data "aws_caller_identity" "current" {}

# Read the deployed code zip so its etag can force a new runtime version when
# the code changes. AgentCore snapshots code into a version at update time;
# without this, overwriting the S3 zip at the same key does NOT re-snapshot,
# so the runtime keeps serving stale code. deploy scripts upload the zip
# before `terraform apply`, so this data source resolves to the current code.
data "aws_s3_object" "agent_code" {
  bucket = var.code_s3_bucket
  key    = var.code_s3_prefix
}

locals {
  # AgentCore names only allow alphanumeric and underscores
  agentcore_name = replace(var.project, "-", "_")
}

# --------------------------------------------------------------------------
# AgentCore Runtime — Code Deploy (S3 zip)
# --------------------------------------------------------------------------
resource "aws_bedrockagentcore_agent_runtime" "this" {
  agent_runtime_name = "${local.agentcore_name}_runtime"
  description        = "AWS Solutions Advisor - streaming agent (${var.environment})"
  role_arn           = var.execution_role_arn

  agent_runtime_artifact {
    code_configuration {
      code {
        s3 {
          bucket = var.code_s3_bucket
          prefix = var.code_s3_prefix
        }
      }
      runtime     = "PYTHON_3_12"
      entry_point = ["recommend.py"]
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "HTTP"
  }

  environment_variables = {
    AWS_REGION        = var.aws_region
    KNOWLEDGE_BASE_ID = var.knowledge_base_id
    BEDROCK_MODEL_ID  = var.model_id
    APP_ENV           = var.environment
    AGENT_NAME        = "sales_recommend"
    # Deploy marker: changes when the code zip changes, forcing AgentCore to
    # create a new runtime version that re-snapshots the latest S3 code.
    DEPLOY_CODE_ETAG = data.aws_s3_object.agent_code.etag
  }
}

# --------------------------------------------------------------------------
# AgentCore Runtime Endpoint (required for invocation)
# --------------------------------------------------------------------------
resource "aws_bedrockagentcore_agent_runtime_endpoint" "this" {
  name                  = "${local.agentcore_name}_endpoint"
  agent_runtime_id      = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
  agent_runtime_version = aws_bedrockagentcore_agent_runtime.this.agent_runtime_version
  description           = "Endpoint for sales-recommend agent runtime"
}
