# Agent API Gateway

API Gateway for agent backends. Two variants:

- **HTTP** (`iac/terraform/http/`) — Request/response and SSE streaming. Supports JWT auth (Cognito), custom domain, throttling, and access logging. Best for most agents.
- **WebSocket** (`iac/terraform/websocket/`) — Bidirectional streaming with no timeout limit. Supports custom domain, throttling, and access logging. Best for long-running streaming agents.

## Quick Start

### HTTP Variant

```bash
cd iac/terraform/http
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region, backend_endpoint
terraform init
terraform plan
terraform apply
```

### WebSocket Variant

```bash
cd iac/terraform/websocket
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region, backend_endpoint
terraform init
terraform plan
terraform apply
```

## Examples

- [examples/http-minimal.tfvars](examples/http-minimal.tfvars) — HTTP API, no auth
- [examples/http-production.tfvars](examples/http-production.tfvars) — HTTP API with Cognito JWT, custom domain
- [examples/websocket-minimal.tfvars](examples/websocket-minimal.tfvars) — WebSocket API, basic
- [examples/websocket-production.tfvars](examples/websocket-production.tfvars) — WebSocket API with custom domain

## Cleanup

```bash
terraform destroy
```
