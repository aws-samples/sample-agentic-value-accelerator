variable "aws_region" {
  description = "AWS region for the v2 runtime"
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "ECR tag of the v2 agent image. Bumped on every push."
  type        = string
  default     = "latest"
}

variable "bedrock_model_id" {
  description = "Bedrock model / cross-region inference profile ID for Strands"
  type        = string
  # Matches the v1 runner's BEDROCK_MODEL_ID env var. v2 will swap to
  # Sonnet 4.6 in a future milestone once Assess is verified.
  default = "us.anthropic.claude-opus-4-7"
}
