# Knowledge Base — Bedrock

Deploys an Amazon Bedrock Knowledge Base backed by OpenSearch Serverless (vector search) with an S3 document source.

## Architecture

```
S3 Bucket (documents) → Bedrock Knowledge Base → OpenSearch Serverless (vectors)
```

## Resources Created

- **Bedrock Knowledge Base** — vector knowledge base with configurable embedding model
- **Bedrock Data Source** — S3-backed with configurable chunking strategy
- **OpenSearch Serverless Collection** — VECTORSEARCH type with encryption and network policies
- **S3 Bucket** — versioned, encrypted document source
- **IAM Role** — KB execution role with S3, AOSS, and Bedrock permissions

## Usage

```bash
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform plan
terraform apply
```

After deployment, upload documents to the S3 bucket and trigger a data source sync via the AWS Console or CLI:

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <kb_id> \
  --data-source-id <ds_id>
```

## Variables

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `project_name` | string | — | Project name prefix |
| `aws_region` | string | — | AWS region |
| `environment` | string | `dev` | Environment name |
| `embedding_model_id` | string | `amazon.titan-embed-text-v2:0` | Embedding model |
| `chunking_strategy` | string | `FIXED_SIZE` | FIXED_SIZE, SEMANTIC, HIERARCHICAL, or NONE |
| `chunk_max_tokens` | number | `512` | Max tokens per chunk |
| `chunk_overlap_percentage` | number | `20` | Chunk overlap percentage |
| `tags` | map(string) | `{}` | Resource tags |

## Outputs

| Name | Description |
|------|-------------|
| `knowledge_base_id` | Bedrock Knowledge Base ID |
| `knowledge_base_arn` | Bedrock Knowledge Base ARN |
| `data_source_id` | Data Source ID |
| `collection_arn` | OpenSearch Serverless collection ARN |
| `collection_endpoint` | OpenSearch Serverless collection endpoint |
| `s3_bucket_name` | Document source bucket name |
| `kb_role_arn` | Knowledge Base execution role ARN |
