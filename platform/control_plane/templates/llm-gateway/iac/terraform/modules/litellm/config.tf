# LiteLLM proxy config rendered into SSM Parameter Store. The ECS task entrypoint
# (see ecs.tf) reads this parameter via boto3 on boot and writes it to
# /etc/litellm/config.yaml before launching the proxy; updating the parameter +
# restarting the service rolls out new configuration without rebuilding the image.

locals {
  litellm_config = yamlencode({
    model_list = [
      for m in var.enabled_models : {
        model_name = m
        litellm_params = {
          model           = "bedrock/${m}"
          aws_region_name = data.aws_region.current.region
          # Bedrock Converse rejects LangChain/OpenAI-family tool_choice values
          # ("any"). LangChain's create_tool_calling_agent and with_structured_output
          # both emit tool_choice="any" internally. drop_params below drops
          # tool_choice specifically before the call is proxied to Bedrock,
          # letting the model decide autonomously (equivalent to "auto").
          drop_params            = true
          additional_drop_params = ["tool_choice"]
        }
      }
    ]

    litellm_settings = merge({
      drop_params = true
      set_verbose = false
      json_logs   = true
      cache       = true
      cache_params = {
        type = "redis"
        host = aws_elasticache_replication_group.redis.primary_endpoint_address
        port = 6379
      }
      request_timeout  = 600
      success_callback = compact([local.attach_lf ? "langfuse" : ""])
      failure_callback = compact([local.attach_lf ? "langfuse" : ""])
      }, local.attach_gr ? {
      guardrails = [
        {
          guardrail_name = "bedrock-default"
          litellm_params = {
            guardrail           = "bedrock"
            mode                = "during_call"
            guardrailIdentifier = var.attach_guardrail_id
            guardrailVersion    = var.attach_guardrail_version
          }
        }
      ]
    } : {})

    general_settings = {
      master_key                       = "os.environ/LITELLM_MASTER_KEY"
      database_url                     = "os.environ/DATABASE_URL"
      ui_username                      = "admin"
      disable_spend_logs               = false
      allow_requests_on_db_unavailable = false
      disable_admin_ui                 = var.disable_admin_ui
    }

    router_settings = {
      routing_strategy = "least-busy"
      redis_host       = aws_elasticache_replication_group.redis.primary_endpoint_address
      redis_port       = 6379
    }
  })
}

resource "aws_ssm_parameter" "config" {
  name        = "/${var.project_name}/${var.environment}/litellm/config.yaml"
  description = "LiteLLM proxy config rendered by the LLM Gateway template"
  type        = "String"
  tier        = "Advanced"
  value       = local.litellm_config

  tags = merge(local.common_tags, { Name = "${local.tag_name} Config" })
}
