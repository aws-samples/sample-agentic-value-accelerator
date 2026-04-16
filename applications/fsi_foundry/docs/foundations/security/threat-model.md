# Threat Model

This document identifies potential security threats to FSI Foundry and documents the mitigations implemented.

## Threat Modeling Methodology

This threat model uses the STRIDE framework to categorize threats:

- **S**poofing - Identity impersonation
- **T**ampering - Data modification
- **R**epudiation - Denying actions
- **I**nformation Disclosure - Data exposure
- **D**enial of Service - Availability attacks
- **E**levation of Privilege - Unauthorized access escalation

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trust Boundaries                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Internet] ──── TB1 ──── [AWS Account] ──── TB2 ──── [Data]   │
│                                                                 │
│  TB1: Network perimeter (ALB/API Gateway)                       │
│  TB2: Data access boundary (IAM policies)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Identified Threats and Mitigations

### T1: Path Traversal Attack

| Attribute | Value |
|-----------|-------|
| **Category** | Information Disclosure |
| **Component** | S3 Retriever Tool |
| **Attack Vector** | Malicious customer_id input (e.g., `../../../etc/passwd`) |
| **Impact** | Unauthorized access to S3 objects outside intended scope |
| **Likelihood** | Medium |
| **Severity** | High |

**Mitigation:**
- Input validation with regex whitelist: `^[a-zA-Z0-9_-]+$`
- Explicit rejection of path traversal sequences (`..`, `/`, `\`)
- Validation applied before any S3 operations

**Validation:**
- Property-based test: `test_s3_path_traversal.py`

---

### T2: Credential Exposure

| Attribute | Value |
|-----------|-------|
| **Category** | Information Disclosure |
| **Component** | Configuration Management |
| **Attack Vector** | Hardcoded credentials in source code or config files |
| **Impact** | AWS account compromise |
| **Likelihood** | Low (after remediation) |
| **Severity** | Critical |

**Mitigation:**
- Removed all hardcoded credential fields from settings
- Use AWS default credential chain exclusively
- IAM roles for all compute resources

**Validation:**
- Code review: No credential fields in `settings.py`

---

### T3: Overly Permissive IAM Policies

| Attribute | Value |
|-----------|-------|
| **Category** | Elevation of Privilege |
| **Component** | IAM Policies |
| **Attack Vector** | Wildcard resources allowing unintended access |
| **Impact** | Access to resources beyond intended scope |
| **Likelihood** | Medium |
| **Severity** | High |

**Mitigation:**
- Scoped CloudWatch Logs to `/aws/ava/*`
- Scoped Bedrock to specific region
- Added condition blocks for X-Ray
- Documented required wildcards (ECR GetAuthorizationToken)

**Validation:**
- Property-based test: `test_iam_policy_scoping.py`
- Terraform validation

---

### T4: Data Exfiltration via S3

| Attribute | Value |
|-----------|-------|
| **Category** | Information Disclosure |
| **Component** | S3 Data Bucket |
| **Attack Vector** | Unencrypted data transfer or unauthorized access |
| **Impact** | Customer data exposure |
| **Likelihood** | Low |
| **Severity** | High |

**Mitigation:**
- TLS enforcement via bucket policy (`aws:SecureTransport`)
- Server-side encryption (SSE-S3)
- S3 access logging enabled
- IAM policies scoped to specific bucket

**Validation:**
- Terraform configuration review

---

### T5: Prompt Injection

| Attribute | Value |
|-----------|-------|
| **Category** | Tampering |
| **Component** | LLM Agents |
| **Attack Vector** | Malicious input designed to manipulate agent behavior |
| **Impact** | Unintended agent actions, data disclosure |
| **Likelihood** | Medium |
| **Severity** | Medium |

**Mitigation:**
- Input validation at API layer
- Structured prompts with clear boundaries
- Human review recommended for high-risk decisions
- Documentation of prompt injection risks

**Validation:**
- Documentation in `ai-security.md`

---

### T6: Denial of Service

| Attribute | Value |
|-----------|-------|
| **Category** | Denial of Service |
| **Component** | API Endpoints |
| **Attack Vector** | High-volume requests or resource exhaustion |
| **Impact** | Service unavailability |
| **Likelihood** | Medium |
| **Severity** | Medium |

**Mitigation:**
- AgentCore built-in rate limiting
- API Gateway throttling
- Request throttling at application level

**Validation:**
- Infrastructure configuration review

---

### T7: Unauthorized API Access

| Attribute | Value |
|-----------|-------|
| **Category** | Spoofing |
| **Component** | API Endpoints |
| **Attack Vector** | Unauthenticated access to API endpoints |
| **Impact** | Unauthorized use of KYC assessment service |
| **Likelihood** | High (if not configured) |
| **Severity** | High |

**Mitigation:**
- Documentation requiring deployers to implement authentication
- AgentCore supports IAM authentication
- API Gateway supports IAM, Cognito, or custom authorizers

**Validation:**
- Documentation in deployment guides

---

### T8: Log Injection

| Attribute | Value |
|-----------|-------|
| **Category** | Tampering / Repudiation |
| **Component** | Logging System |
| **Attack Vector** | Malicious input containing log format characters |
| **Impact** | Log tampering, false audit trails |
| **Likelihood** | Low |
| **Severity** | Medium |

**Mitigation:**
- Structured logging with structlog
- Input sanitization before logging
- CloudWatch Logs immutability

**Validation:**
- Code review of logging implementation

---

## Threat Summary Matrix

| ID | Threat | Category | Severity | Status |
|----|--------|----------|----------|--------|
| T1 | Path Traversal | Info Disclosure | High | Mitigated |
| T2 | Credential Exposure | Info Disclosure | Critical | Mitigated |
| T3 | Overly Permissive IAM | Privilege Escalation | High | Mitigated |
| T4 | S3 Data Exfiltration | Info Disclosure | High | Mitigated |
| T5 | Prompt Injection | Tampering | Medium | Documented |
| T6 | Denial of Service | DoS | Medium | Mitigated |
| T7 | Unauthorized API Access | Spoofing | High | Documented |
| T8 | Log Injection | Tampering | Medium | Mitigated |

## Residual Risks

The following risks require deployer action:

1. **API Authentication** - Deployers must configure authentication for their environment
2. **Network Security** - VPC configuration should be reviewed for production deployments
3. **Data Classification** - Customer data handling policies must be defined by deployers

## Related Documentation

- [Security Architecture](architecture_security.md) - Security architecture overview
- [AWS Service Security](aws-service-security.md) - Service-specific guidance
- [AI Security](ai-security.md) - GenAI security considerations
