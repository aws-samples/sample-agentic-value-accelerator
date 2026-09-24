# Security Policy

## Reporting a Vulnerability

We take security seriously at AVA. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send details to the repository maintainers
2. **GitHub Security Advisories**: Use the "Report a vulnerability" button in the Security tab

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Based on severity (Critical: 7 days, High: 30 days, Medium: 90 days)

## Security Best Practices

### AWS Credentials

This project is designed to use AWS IAM roles and the default credential chain. **Never hardcode AWS credentials** in configuration files or source code.

Recommended credential methods:
- IAM roles for Amazon EC2
- IAM roles for AWS Lambda
- IAM roles for Amazon ECS tasks
- Environment variables (for local development only)
- AWS CLI configuration profiles

### Deployment Security

When deploying this solution:

1. **Network Security**: Deploy in private subnets where possible; use VPC endpoints for AWS services
2. **IAM Policies**: Review and customize IAM policies to follow least privilege principles
3. **Encryption**: Enable encryption at rest and in transit for all data stores
4. **Logging**: Enable CloudTrail and access logging for audit purposes
5. **Authentication**: Amazon Cognito JWT validation ships enabled. Set `ENVIRONMENT` to
   your real environment name (`production`, `staging`, ...). The control plane also
   carries a development bypass that returns a hardcoded admin without reading the
   presented credential; it is gated so that it can only ever activate when `ENVIRONMENT`
   is `development`, `dev`, `local`, or `test`, and the resolution is logged at startup
   under `AUTH-GATE`. Confirm that line says *refusing* before exposing an endpoint.
6. **Outbound requests**: URLs the platform is asked to fetch on a caller's behalf (OIDC
   discovery documents, A2A agent cards, SaaS connector endpoints) are validated against
   server-side request forgery: the host is resolved, non-public addresses are refused, the
   connection is pinned to the validated address to defeat DNS rebinding, and credentials
   are dropped across a cross-host redirect. To reach a genuinely private issuer, add its
   range to `SAFE_FETCH_ALLOWED_PRIVATE_CIDRS` rather than removing the check; no value of
   that setting can expose the instance metadata endpoint.
7. **Error responses**: A 500 from the deployment and agent APIs carries a fixed summary and
   an `error_ref`, not the underlying exception. This is deliberate rather than terse: these
   routes wrap boto3 calls, and botocore copies the service's own message verbatim, so an
   `AccessDenied` reads "User: *&lt;caller arn&gt;* is not authorized to perform: *&lt;action&gt;* on
   resource: *&lt;target arn&gt;*" - the account id, the ECS task role, and the target. To
   diagnose a failure, search the backend logs for the `error_ref` from the response; the
   full traceback is there. Note that a failure recorded against a deployment is readable
   later through `GET /deployments/{id}/status`, so the same rule applies to what gets
   stored, not only to what gets returned.
8. **Response sanitization**: the governance surfaces read a customer's own AWS estate, so
   almost every payload starts life containing account identifiers.
   `backend/src/core/security_utils.py` is the single place that strips them, and 27 backend
   modules import from it: 12-digit account ids become `************`, a full ARN is
   reduced to its resource tail, and CVE ids, IPv4 addresses, S3 bucket URIs, caller
   identities and STS session suffixes are redacted from free text such as security-finding
   titles. **This is an invariant, not a cleanup pass** - a new route that returns an ARN, a
   finding title, a budget name or a boto3 error string must mask it at the point it is
   serialized. The helpers deliberately preserve the governance signal (severity, resource
   type, a correlatable role name) so masking does not cost the surface its meaning.

### Hardening required before production

The repository ships a demo-oriented default posture. These are known gaps rather than
oversights; close them before exposing a deployment.

| Gap | Where | What to do |
|---|---|---|
| Interactive API docs are always served and are not behind auth | `backend/src/main.py` sets `docs_url` / `redoc_url` / `openapi_url` unconditionally | Set them to `None` outside development, or keep the API off the public internet |
| No security response headers | Neither the bundled `frontend/nginx.conf` nor the FastAPI app sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options` | Add them at your edge (CloudFront, ALB, or the reverse proxy you front the app with) |
| The session JWT is held in browser `localStorage` | `frontend/src/api/client.ts` | Any cross-site scripting flaw can exfiltrate a live session. Moving the token to an `HttpOnly`, `Secure`, `SameSite` cookie is the durable fix |
| Wildcard CORS in the bundled API Gateway module | `infrastructure/modules/api_gateway/main.tf` sets `allow_origins = ["*"]` and `allow_headers = ["*"]` | Restrict to your own origins. Note the application-level CORS in `main.py` is already a tight allowlist (`settings.CORS_ORIGINS`); only the IaC module is permissive |
| DynamoDB point-in-time recovery and deletion protection are off on most control-plane tables | `infrastructure/environments/dev/main.tf` | Deliberate, so `terraform destroy` works for dev teardown. Enable both before the stack backs anything audited - see `platform/control_plane/infrastructure/README.md` for which tables hold non-regenerable evidence |

### AI/ML Security Considerations

This project uses Amazon Bedrock for AI/ML capabilities. Important considerations:

1. **Human Review**: AI outputs are advisory and should be reviewed by qualified personnel
2. **Input Validation**: Validate and sanitize inputs before sending to AI models
3. **Output Filtering**: Review AI outputs before using in production workflows
4. **Prompt Injection**: Be aware of prompt injection risks; implement appropriate safeguards
5. **Data Privacy**: Ensure customer data handling complies with applicable regulations

## Risk Assessment Summary

### Architecture Overview

The AVA deploys a multi-agent AI system with the following components:
- Compute layer (Amazon EC2, AWS Lambda, or AgentCore Runtime)
- AI layer (Amazon Bedrock with Claude models)
- Data layer (Amazon S3 for customer data)

### Identified Risks and Mitigations

| Risk Category | Risk | Mitigation |
|--------------|------|------------|
| Authentication | Development auth bypass returns an admin without checking the credential, and defaults to on | Gated on `ENVIRONMENT`; fails closed on any unrecognised value; resolution logged at startup |
| Network | Caller-supplied URLs could reach internal addresses or instance metadata (SSRF) | Resolve-and-validate, connection pinned to the validated address, credentials dropped on cross-host redirect |
| Information disclosure | An AWS error returned to a caller names the account, the task role and the target resource | API responses carry a fixed summary plus an `error_ref`; the exception and its traceback go only to the backend log |
| Information disclosure | Governance payloads read from a customer's AWS estate carry account ids, ARNs, CVEs and caller identities | Centralized masking in `core/security_utils.py`, applied where responses are serialized |
| Session management | The session JWT is readable by any script in the page (`localStorage`) | Known limitation; treat any XSS as session compromise. See *Hardening required before production* |
| Data Security | Customer data in S3 | Encryption at rest, TLS enforcement, access logging |
| IAM | Overly permissive policies | Scoped policies with least privilege |
| AI/ML | Prompt injection | Input validation, output review |
| AI/ML | Biased outputs | Human review required for financial decisions |

### Compliance Considerations

For financial services deployments, consider:
- Fair lending regulations (ECOA, Fair Credit Reporting Act)
- Data privacy regulations (GDPR, CCPA)
- Industry-specific requirements (PCI-DSS if handling payment data)

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Security Updates

Security updates are released as patch versions. We recommend:
- Subscribing to repository notifications
- Regularly updating dependencies
- Reviewing release notes for security-related changes

## Acknowledgments

We appreciate the security research community's efforts in responsibly disclosing vulnerabilities.