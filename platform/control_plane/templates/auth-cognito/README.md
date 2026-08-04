# Auth — Cognito

Cognito User Pool with two app clients, a resource server with custom scopes, hosted UI domain, and user groups.

## What It Creates

| Resource | Purpose |
|----------|---------|
| User Pool | User directory with email sign-in, password policy, optional MFA |
| Web App Client | Browser/SPA auth via OAuth 2.0 authorization code flow (no secret) |
| Service App Client | Machine-to-machine auth via OAuth 2.0 client_credentials flow (with secret) |
| Resource Server | Custom OAuth scopes (e.g., `api/invoke`, `api/manage`, `api/read`) |
| Domain | Cognito hosted UI (prefix or custom domain) |
| User Groups | `admin` and `user` groups |

## Two App Clients

AWS requires separate clients for browser auth and machine-to-machine auth:

- **Web client** — `authorization_code` flow, no secret, OIDC scopes (`openid`, `email`, `profile`). For React/SPA frontends.
- **Service client** — `client_credentials` flow, with secret, custom scopes from the resource server. For backend services calling agent APIs.

## Quick Start

```bash
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region
terraform init
terraform plan
terraform apply
```

### Get the Service Client Credentials

```bash
# Client ID
terraform output service_client_id

# Client secret (sensitive)
terraform output -raw service_client_secret
```

### Get a Machine-to-Machine Token

```bash
TOKEN_ENDPOINT=$(terraform output -raw token_endpoint)
CLIENT_ID=$(terraform output -raw service_client_id)
CLIENT_SECRET=$(terraform output -raw service_client_secret)

curl -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=api/invoke"
```

## Examples

- [examples/minimal.tfvars](examples/minimal.tfvars) — Defaults, no MFA
- [examples/production.tfvars](examples/production.tfvars) — MFA required, strong password, custom scopes

## Cleanup

```bash
terraform destroy
```
