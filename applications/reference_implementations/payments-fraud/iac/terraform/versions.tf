terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      # >= 6.17.0 required for the aws_bedrockagentcore_agent_runtime resources
      # used by the agent-runtime-agentcore module.
      version = ">= 6.17.0"
    }
  }
}
