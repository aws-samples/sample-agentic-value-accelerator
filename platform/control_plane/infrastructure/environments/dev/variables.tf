# The control-plane region, and only the control-plane region. Everything this root
# creates lives here: the 11 DynamoDB tables, the ECS cluster and both task definitions,
# both ALBs, the VPC. The backend's tier-1 table resolution
# (<TABLE_KEY>_TABLE_REGION -> CONTROL_PLANE_TABLE_REGION -> AWS_REGION) bottoms out on
# this value, so it is the home region of every read-write control-plane table. See
# backend/src/core/region_config.py.
#
# This is NOT the governed-fleet region. The customer's Bedrock agents, AgentCore
# runtimes, guardrails, and the CloudWatch metrics they emit are in us-east-1 (tier 2,
# GOVERN_AWS_REGION / get_governed_regions()), and the two must never be collapsed back
# into one field. They were, once: an AWS call issued against the wrong region does not
# raise, it succeeds and returns that region's smaller or empty inventory. That is how the
# Operations Hub reported a 1-agent fleet against a real fleet of 36 under a Live badge,
# with no exception to catch and nothing in the logs.
#
# us-east-2 is the demo account's control-plane region (the README documents the AWS CLI
# profile as us-east-2), which is why it is the default here rather than a value the caller
# must remember to pass. A default that is wrong but always overridden in practice is a
# trap set for the first person who does not override it, and the failure it produces is
# silent.
variable "aws_region" {
  description = "Control-plane region for this root: AVA's own DynamoDB tables, ECS, and ALBs. NOT the governed-fleet region (tier 2, GOVERN_AWS_REGION)."
  type        = string
  default     = "us-east-2"
}

# The governed-fleet region (tier 2): where the customer's Bedrock agents, AgentCore
# runtimes, guardrails, and the CloudWatch metrics they emit actually live. Deliberately a
# separate variable from aws_region and NOT derived from it, for the reason spelled out
# above: the two answer different questions and collapsing them is a silent failure.
#
# This existed only as the literal "us-east-1" inside main.tf's task definition, which made
# it the one region an AVA deployer could not configure. Someone governing eu-west-1 had no
# way to say so short of editing main.tf, and the failure mode is the quiet one - Bedrock,
# CloudWatch, CloudTrail and Service Quotas are all per-region and none of them errors on
# the wrong region, so they answer 200 with us-east-1's empty inventory and the UI renders
# an AI estate of zero.
#
# THIS VARIABLE HAS NO DEFAULT, ON PURPOSE. That makes Terraform prompt for it on every
# interactive plan/apply, and the `description` below is what Terraform prints as the prompt
# text - so it is written as prompt copy for a deployer who has never read this file, not as
# a summary for someone who has.
#
# A default here was the wrong shape of fix. Empty-meaning-"same as aws_region" is a fine
# resolution rule and config.py still implements it, but as a *default* it is answered
# silently: the deployer never learns that a second region exists, and the first symptom is
# an AI estate rendering as zero under a Live badge. Terraform cannot discover where the
# fleet is - it creates nothing in the governed region - so this is genuinely the deployer's
# to state, and a prompt is how you ask.
#
# Empty is still accepted at the prompt (verified: pressing Enter yields ""), which is what
# keeps this from being friction for the single-region case. The difference is that pressing
# Enter is now a decision rather than an omission.
#
# The validation exists because a malformed region is this bug class in its purest form.
# "us-east1" is not a crash - boto3 builds a client, the call may even resolve, and what
# comes back is not this account's inventory. Catching it at plan time is the only cheap
# place to catch it at all.
#
# Non-interactive callers (CI, `-input=false`) must set TF_VAR_govern_aws_region or
# `-var govern_aws_region=...`; Terraform fails naming the variable. That is deliberate: a
# pipeline that has not decided which region it governs should stop, not guess.
variable "govern_aws_region" {
  description = <<-EOT
    Governed-fleet region (tier 2) - where your Bedrock/AgentCore estate lives.
    This is NOT the control-plane region (that is aws_region, above).

    Press Enter to accept the control-plane region, i.e. your AI estate and AVA's
    own tables are in the same place. That is correct for most single-region deployments.

    Enter a region only if your AI estate is somewhere else (e.g. us-east-1 while the
    control plane is in us-east-2 - the demo account's layout). Getting this wrong does
    not error: Bedrock, CloudWatch, CloudTrail and Service Quotas are all per-region and
    none of them fails on the wrong region, so AVA reads that region's inventory instead
    and the estate renders as zero.
  EOT
  type        = string

  validation {
    # Empty is legitimate ("same as aws_region"). Anything non-empty must look like a
    # region, because a typo is silent - see the comment above.
    condition     = var.govern_aws_region == "" || can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.govern_aws_region))
    error_message = "Must be an AWS region such as us-east-1 or eu-west-2, or empty to mean 'the same region as aws_region'. Check for a missing hyphen: 'us-east1' is not a region, and a malformed region reads as an empty AI estate rather than failing."
  }
}

# Per-table region override for the guardrails table, mirroring the backend's
# <TABLE_KEY>_TABLE_REGION escape hatch (see backend/src/core/region_config.py).
#
# Empty - the default - means "wherever this root created it", i.e. var.aws_region, and that
# is the correct answer for anyone deploying AVA fresh: aws_dynamodb_table.guardrails is
# created by this root's provider, so the table is in var.aws_region by construction.
# main.tf used to emit the literal "us-east-1" here, which was true of the demo account only
# and pointed every other deployer's guardrail reads at a region where Terraform had just
# created no such table. An empty Scan, no error.
#
# The demo account DOES need us-east-1: its guardrails table was provisioned there before
# the control plane moved to us-east-2, and it holds real templates. Set
# `-var guardrails_table_region=us-east-1` for that account. See
# infrastructure/terraform.tfvars.example.
#
# This one KEEPS its default and is deliberately NOT prompted, unlike govern_aws_region.
# It is a migration artefact of one account rather than a decision every deployer has to
# make: a fresh deploy's guardrails table is created by this root, in var.aws_region, so ""
# is not merely a reasonable default, it is the only correct answer. Prompting for it would
# put a question with one right answer next to the question that genuinely has two, and
# train people to press Enter through both.
variable "guardrails_table_region" {
  description = "Home region of the guardrails DynamoDB table. Empty means var.aws_region (correct for a fresh deploy). The demo account must set us-east-1."
  type        = string
  default     = ""

  validation {
    # Same reasoning as govern_aws_region: a malformed region here Scans a table that does
    # not exist, and DynamoDB answers that with an empty result rather than an error.
    condition     = var.guardrails_table_region == "" || can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]$", var.guardrails_table_region))
    error_message = "Must be an AWS region such as us-east-1, or empty to mean 'the same region as aws_region'. A malformed region here reads as an empty guardrails table rather than failing."
  }
}

variable "aws_profile" {
  description = "Named AWS profile to use. Leave empty to use the default credential chain."
  type        = string
  default     = ""
}

# Container images for the control-plane tasks. This stack references a
# prebuilt image (it does not create the ECR repo) — build & push with
# scripts/deploy-backend.sh / deploy-frontend.sh, then set these to the
# resulting ECR image URI in your account.
variable "backend_image" {
  description = "ECR image URI for the control-plane backend container"
  type        = string
  default     = "<ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/ava-control-plane-backend:latest"
}

variable "frontend_image" {
  description = "ECR image URI for the control-plane frontend container"
  type        = string
  default     = "<ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/ava-control-plane-frontend:latest"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "bedrock_mantle_api_key" {
  description = "Bedrock Mantle API key for GPT-5.x models. Leave empty to disable."
  type        = string
  default     = ""
  sensitive   = true
}
