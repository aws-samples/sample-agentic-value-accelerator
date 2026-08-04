# Agent Guardrails

Deploy Amazon Bedrock Guardrails to enforce content safety, PII protection, topic restrictions, and profanity filtering for your AI agents.

## Features

- **Content Filtering** — Block or filter SEXUAL, VIOLENCE, HATE, INSULTS, MISCONDUCT, and PROMPT_ATTACK content at configurable strengths
- **PII Protection** — Detect and ANONYMIZE or BLOCK sensitive data (email, phone, credit cards, SSN, IP addresses)
- **Topic Denial** — Define custom denied topics with examples to prevent off-topic conversations
- **Profanity Filter** — AWS-managed profanity word list blocking
- **Versioned** — Creates a published guardrail version for stable agent integration

## Usage

```bash
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform plan
terraform apply
```

## Inputs

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| project_name | string | yes | — | Project name for resource naming |
| aws_region | string | yes | — | AWS region |
| environment | string | no | `dev` | Environment name |
| blocked_input_messaging | string | no | Content policy message | Message shown when input is blocked |
| blocked_outputs_messaging | string | no | Content policy message | Message shown when output is blocked |
| content_filters | list(object) | no | All 6 types at MEDIUM | Content filter configuration |
| pii_entities | list(object) | no | EMAIL, PHONE, CC at ANONYMIZE | PII entities to protect |
| denied_topics | list(object) | no | `[]` | Custom denied topics |
| enable_profanity_filter | bool | no | `true` | Enable managed profanity word list |
| tags | map(string) | no | `{}` | Additional resource tags |

## Outputs

| Output | Description |
|--------|-------------|
| guardrail_id | Bedrock Guardrail ID |
| guardrail_arn | Bedrock Guardrail ARN |
| guardrail_version | Published guardrail version number |
