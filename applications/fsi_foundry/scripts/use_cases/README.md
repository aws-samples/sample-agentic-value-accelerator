# Use Case Scripts

Per-use-case test scripts for validating deployments across all three patterns.

---

## Structure

Each use case has test scripts for each deployment pattern:

```
scripts/use_cases/<use_case_id>/test/
├── test_agentcore.sh (AgentCore is the sole deployment pattern)
├── test_agentcore.sh
└── 
```

## Deploy and Cleanup

Deploy and cleanup scripts are generic and shared across all use cases. Set the required environment variables before running:

```bash
export USE_CASE_ID="kyc_banking"
export FRAMEWORK="langchain_langgraph"
export AWS_REGION="us-east-1"

# Deploy
./scripts/deploy/full/deploy_ec2.sh

# Cleanup
./scripts/cleanup/cleanup_ec2.sh
```

Or use the interactive CLI:

```bash
./scripts/main/deploy.sh
./scripts/main/test.sh
./scripts/main/cleanup.sh
```

---

## Related Documentation

- [Deployment Patterns](../../docs/foundations/deployment/deployment_patterns.md)
- [Adding Applications](../../docs/foundations/development/adding_applications.md)
- [Global Variables](../../docs/foundations/development/global_variables.md)
