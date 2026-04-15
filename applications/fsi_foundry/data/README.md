# Data Directory

Centralized data for FSI Foundry including the application registry and sample data for all use cases.

---

## Registry

The `registry/offerings.json` file is the single source of truth for:

- Available use cases — IDs, names, descriptions, paths, agents, and supported frameworks
- Deployment patterns — EC2, Step Functions, and AgentCore with their infrastructure paths
- Framework definitions — LangGraph/LangChain, Strands, and planned frameworks

The deployment scripts (`scripts/main/deploy.sh`) read this registry to present available options.

---

## Sample Data

Each use case has a corresponding directory under `samples/` containing JSON files used for testing and demonstration. Sample data is automatically uploaded to S3 during infrastructure deployment via Terraform.

To upload manually:

```bash
S3_BUCKET=$(cd foundations/iac/shared && terraform output -raw s3_bucket_name)
aws s3 sync data/samples/ s3://$S3_BUCKET/samples/ --exclude "*.md"
```

---

## Adding Data for a New Use Case

1. Create a directory under `samples/` matching your use case ID
2. Add sample JSON files following your application's schema
3. Update `registry/offerings.json` with the data path
4. Reference the data path in your application configuration
