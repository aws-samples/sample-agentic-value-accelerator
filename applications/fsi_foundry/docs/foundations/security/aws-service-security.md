# AWS Service Security Guidelines

This document provides security best practices for each AWS service used by FSI Foundry.

## Amazon Bedrock

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Model Access | Region-scoped | Limit model access to deployment region |
| IAM Policy | Specific model ARNs | Avoid wildcard model access |
| VPC Endpoints | Optional | Use for private network access |

### IAM Policy Example

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"
}
```

### Security Considerations

- **Data Privacy**: Bedrock does not store or log prompts/completions by default
- **Model Selection**: Use models appropriate for your data classification
- **Rate Limiting**: Configure appropriate throughput limits
- **Monitoring**: Enable CloudWatch metrics for usage tracking

---

## Amazon S3

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Encryption | SSE-S3 (AES-256) | Encryption at rest |
| TLS Enforcement | Bucket policy with `aws:SecureTransport` | Encryption in transit |
| Access Logging | Enabled to separate bucket | Audit trail |
| Public Access | Block all public access | Prevent data exposure |
| Versioning | Enabled | Data recovery |

### Bucket Policy for TLS Enforcement

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::bucket-name",
        "arn:aws:s3:::bucket-name/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

### Security Considerations

- **Least Privilege**: Grant only `s3:GetObject` for read-only access
- **Path Validation**: Validate all user-provided paths before S3 operations
- **Cross-Account**: Use bucket policies for cross-account access control
- **Lifecycle Policies**: Configure data retention policies

---

## AWS Lambda

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Execution Role | Least privilege | Minimize blast radius |
| VPC | Private subnets | Network isolation |
| Environment Variables | No secrets | Use Secrets Manager |
| Reserved Concurrency | Set limits | Prevent runaway costs |
| Timeout | Appropriate for workload | Prevent hanging functions |

### IAM Policy Scoping

```json
{
  "Effect": "Allow",
  "Action": "logs:*",
  "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/ava-*"
}
```

### Security Considerations

- **Cold Starts**: Consider security implications of initialization code
- **Dependencies**: Regularly update Lambda layers and dependencies
- **Secrets**: Use AWS Secrets Manager or Parameter Store
- **Monitoring**: Enable X-Ray tracing for debugging

---

## Amazon ECR

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Image Scanning | Enabled | Vulnerability detection |
| Encryption | AES-256 | Encryption at rest |
| Lifecycle Policies | Configured | Image cleanup |
| Repository Policies | Least privilege | Access control |

### IAM Policy Notes

```json
{
  "Effect": "Allow",
  "Action": "ecr:GetAuthorizationToken",
  "Resource": "*"
}
```

**Note**: `ecr:GetAuthorizationToken` requires `Resource: "*"` per AWS documentation. This is a known requirement and cannot be scoped further.

### Security Considerations

- **Base Images**: Use minimal, trusted base images
- **Image Signing**: Consider image signing for production
- **Vulnerability Scanning**: Review scan results before deployment

---

## Amazon CloudWatch

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Log Groups | Scoped naming pattern | Access control |
| Encryption | AWS managed keys | Encryption at rest |
| Retention | Appropriate for compliance | Cost and compliance |
| Metric Filters | Security-relevant patterns | Alerting |

### Log Group Naming Convention

```
/aws/ava/{use_case}/{component}
```

### Security Considerations

- **Sensitive Data**: Avoid logging sensitive data (PII, credentials)
- **Log Access**: Restrict log access via IAM policies
- **Alerting**: Configure alarms for security-relevant events

---

## AWS X-Ray

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Sampling | Appropriate rate | Balance visibility and cost |
| Encryption | Enabled | Trace data protection |
| IAM Condition | Region-scoped | Limit scope |

### IAM Policy with Condition

```json
{
  "Effect": "Allow",
  "Action": [
    "xray:PutTraceSegments",
    "xray:PutTelemetryRecords"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "us-east-1"
    }
  }
}
```

### Security Considerations

- **Trace Data**: Review what data is captured in traces
- **Retention**: X-Ray retains traces for 30 days by default
- **Sampling**: Adjust sampling to capture security-relevant requests

---

## API Gateway

### Security Configuration

| Setting | Recommended Value | Rationale |
|---------|------------------|-----------|
| Authentication | IAM, Cognito, or Custom | Access control |
| Throttling | Configured | DoS protection |
| WAF | Optional | Additional protection |
| Logging | Enabled | Audit trail |

### Security Considerations

- **Authentication**: Always configure authentication for production
- **CORS**: Configure appropriate CORS policies
- **Request Validation**: Enable request validation
- **SSL/TLS**: Use TLS 1.2 or higher

---

## Security Checklist

Before deploying to production, verify:

- [ ] All IAM policies follow least privilege
- [ ] S3 buckets have TLS enforcement and access logging
- [ ] Lambda functions have appropriate timeouts and concurrency limits
- [ ] CloudWatch log groups use scoped naming patterns
- [ ] ECR image scanning is enabled
- [ ] API endpoints have authentication configured
- [ ] X-Ray tracing is enabled for debugging
- [ ] All secrets use AWS Secrets Manager (not environment variables)

## Related Documentation

- [Security Architecture](architecture_security.md) - Security architecture overview
- [Threat Model](threat-model.md) - Threat analysis and mitigations
- [AI Security](ai-security.md) - GenAI security considerations
