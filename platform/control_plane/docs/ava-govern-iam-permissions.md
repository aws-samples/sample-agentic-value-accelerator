# AVA Govern IAM Permissions

This document details the AWS IAM permissions required for AVA Govern to access live data from your AWS account.

## Overview

AVA Govern uses boto3's default credential chain. In production, attach an IAM role to your compute resource (ECS task, Lambda, EC2 instance). Locally, credentials come from your AWS CLI profile.

## Credential Resolution Order

1. Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
2. Shared credentials file: `~/.aws/credentials`
3. AWS config file: `~/.aws/config`
4. ECS container credentials (via `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`)
5. EC2 instance metadata (IAM role attached to instance)

## Canonical Source

The authoritative, deployable definition of this role is:

    platform/control_plane/infrastructure/iam/ava-govern-role.yaml

That CloudFormation template is the single source of truth. The tables below
describe it; if the two ever disagree, the template wins and this document is
the bug. Every action listed here was traced to a real boto3 call in
`backend/src/services/govern_*.py` or `backend/src/api/routes/govern_*.py`.

Deploy it with:

```bash
aws cloudformation deploy \
  --template-file platform/control_plane/infrastructure/iam/ava-govern-role.yaml \
  --stack-name ava-govern-role \
  --capabilities CAPABILITY_NAMED_IAM
```

## Required Permissions

The role carries twelve inline policies. Each is gated by a stack parameter, so
you can decline a capability and AVA Govern will degrade honestly rather than
error (see "Behavior When a Permission Is Missing" below).

**With default parameters everything in this role is read, list, get, or
describe.** Eleven of the twelve policies contain no create, update, delete, or
put action, and AVA Govern does not write to a governed account.

The twelfth, `AVAGovernWriteActions`, is the sole exception and is **off by
default** (`EnableWriteActions=false`, so the policy is not created at all). See
"`EnableWriteActions`" below for exactly what it grants and which features
need it.

### Size budget

IAM caps the aggregate size of all inline policies on one role at **10,240
characters**, whitespace excluded. Measured from the rendered policy documents:

| Configuration | Size | Headroom |
|---|---|---|
| All capabilities, `EnableWriteActions=false` (default) | ~9,100 | ~1,140 |
| All capabilities, `EnableWriteActions=true` | ~9,860 | ~380 |

The write policy costs ~760 characters, so enabling it consumes about two thirds
of the remaining headroom. Check that headroom before adding actions. If a new capability does
not fit, add it as a separate customer managed policy (6,144 characters each, 20
attachable per identity) rather than trimming an existing statement.

### `EnableCostExplorer` - FinOps

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernCostExplorer` | `CostExplorerRead` | `ce:GetCostAndUsage`, `ce:GetCostAndUsageWithResources`, `ce:GetCostForecast`, `ce:GetDimensionValues`, `ce:GetReservationCoverage`, `ce:GetReservationPurchaseRecommendation`, `ce:GetReservationUtilization`, `ce:GetSavingsPlansCoverage`, `ce:GetSavingsPlansUtilization`, `ce:GetTags`, `ce:GetUsageForecast`, `ce:ListCostAllocationTags`, `ce:ListCostCategoryDefinitions` | `*` |
| `AVAGovernFinOpsExtended` | `BudgetsRead` | `budgets:ViewBudget` | `*` |
| `AVAGovernFinOpsExtended` | `ComputeOptimizerRead` | `compute-optimizer:GetEnrollmentStatus`, `compute-optimizer:GetRecommendationSummaries` | `*` |

> `budgets:DescribeBudgets` is **not** a real IAM action. The `DescribeBudgets`
> API call is authorized by `budgets:ViewBudget`. Earlier revisions of this
> document listed the non-existent action.

### `EnableBedrock` - Bedrock and AgentCore

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernBedrock` | `BedrockAgentsRead` | `bedrock:ListAgents`, `bedrock:GetAgent`, `bedrock:ListAgentVersions`, `bedrock:GetAgentVersion`, `bedrock:ListAgentAliases`, `bedrock:GetAgentAlias`, `bedrock:ListAgentActionGroups`, `bedrock:GetAgentActionGroup`, `bedrock:ListAgentKnowledgeBases`, `bedrock:GetAgentKnowledgeBase` | `*` |
| `AVAGovernBedrock` | `BedrockModelsRead` | `bedrock:ListFoundationModels`, `bedrock:GetFoundationModel`, `bedrock:ListCustomModels`, `bedrock:GetCustomModel`, `bedrock:ListModelCustomizationJobs`, `bedrock:GetModelCustomizationJob`, `bedrock:ListProvisionedModelThroughputs`, `bedrock:GetProvisionedModelThroughput`, `bedrock:ListInferenceProfiles`, `bedrock:GetInferenceProfile` | `*` |
| `AVAGovernBedrock` | `BedrockGuardrailsRead` | `bedrock:ListGuardrails`, `bedrock:GetGuardrail`, `bedrock:GetGuardrailPolicy` | `*` |
| `AVAGovernBedrock` | `BedrockKnowledgeBasesRead` | `bedrock:ListKnowledgeBases`, `bedrock:GetKnowledgeBase`, `bedrock:ListDataSources`, `bedrock:GetDataSource` | `*` |
| `AVAGovernBedrock` | `BedrockFlowsRead` | `bedrock:ListFlows`, `bedrock:GetFlow`, `bedrock:ListFlowVersions`, `bedrock:GetFlowVersion`, `bedrock:ListFlowAliases`, `bedrock:GetFlowAlias` | `*` |
| `AVAGovernBedrock` | `BedrockLoggingRead` | `bedrock:GetModelInvocationLoggingConfiguration` | `*` |
| `AVAGovernAgentCore` | `AgentCoreRead` | `bedrock-agentcore:ListAgentRuntimes`, `bedrock-agentcore:ListGateways`, `bedrock-agentcore:ListGatewayTargets`, `bedrock-agentcore:ListMemories`, `bedrock-agentcore:ListPolicyEngines`, `bedrock-agentcore:ListWorkloadIdentities`, `bedrock-agentcore:GetWorkloadIdentity` | `*` |

Three prefix corrections against earlier revisions of this document:

- **There is no `bedrock-agent:` IAM prefix.** The Bedrock Agents control-plane
  API (`boto3.client("bedrock-agent")`) is authorized under `bedrock:`.
- **The IAM prefix is `bedrock-agentcore:`, not `bedrock-agentcore-control:`.**
  The boto3 client is named `bedrock-agentcore-control`, but the single
  `bedrock-agentcore` prefix authorizes both the control and data planes.
- `bedrock:ListModelInvocationLoggingConfiguration` does not exist. Model
  invocation logging is a single account-level configuration, read with
  `bedrock:GetModelInvocationLoggingConfiguration`.

### `EnableCloudWatch` - Observability

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernCloudWatch` | `CloudWatchMetricsRead` | `cloudwatch:GetMetricData`, `cloudwatch:GetMetricStatistics`, `cloudwatch:ListMetrics`, `cloudwatch:DescribeAlarms`, `cloudwatch:DescribeAlarmHistory`, `cloudwatch:DescribeAlarmsForMetric`, `cloudwatch:GetDashboard`, `cloudwatch:ListDashboards` | `*` |
| `AVAGovernCloudWatch` | `CloudWatchLogsRead` | `logs:DescribeLogGroups`, `logs:DescribeLogStreams`, `logs:FilterLogEvents`, `logs:GetLogEvents`, `logs:GetLogGroupFields`, `logs:GetQueryResults`, `logs:StartQuery`, `logs:StopQuery` | `*` |
| `AVAGovernCloudWatch` | `XRayRead` | `xray:GetTraceSummaries`, `xray:BatchGetTraces`, `xray:GetServiceGraph`, `xray:GetTraceGraph` | `*` |

`cloudwatch:DescribeAlarmHistory` backs mean-time-to-detect, which is derived
from alarm state transitions rather than from current alarm state.

`logs:StartQuery` and `logs:StopQuery` read like write actions but are the
CloudWatch Logs Insights query API. They create no durable resource and mutate
no log data, and they are the only way to run an Insights query.

### `EnableCloudTrail` - Audit trail

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernCloudTrail` | `CloudTrailRead` | `cloudtrail:LookupEvents`, `cloudtrail:DescribeTrails`, `cloudtrail:GetTrail`, `cloudtrail:GetTrailStatus`, `cloudtrail:ListTrails`, `cloudtrail:GetEventSelectors` | `*` |

### `EnableSecurityServices` - Security posture

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernSecurityServices` | `SecurityHubRead` | `securityhub:GetFindings` | `*` |
| `AVAGovernSecurityServices` | `GuardDutyListDetectors` | `guardduty:ListDetectors` | `*` |
| `AVAGovernSecurityServices` | `GuardDutyFindingsRead` | `guardduty:ListFindings`, `guardduty:GetFindings` | `detector/*` in this account and Region |
| `AVAGovernSecurityServices` | `Inspector2Read` | `inspector2:ListFindings`, `inspector2:ListCoverage` | `*` |
| `AVAGovernSecurityServices` | `DetectiveRead` | `detective:ListGraphs`, `detective:ListInvestigations` | `*` |
| `AVAGovernSecurityServices` | `Macie2Read` | `macie2:GetMacieSession`, `macie2:DescribeBuckets`, `macie2:GetFindingStatistics`, `macie2:ListFindings`, `macie2:GetFindings` | `*` |
| `AVAGovernSecurityServices` | `AccessAnalyzerListAnalyzers` | `access-analyzer:ListAnalyzers` | `*` |
| `AVAGovernSecurityServices` | `AccessAnalyzerFindingsRead` | `access-analyzer:ListFindings` | `analyzer/*` in this account and Region |
| `AVAGovernSecurityServices` | `SecurityLakeRead` | `securitylake:ListDataLakes`, `securitylake:ListSubscribers`, `securitylake:ListLogSources` | `*` |

Notes:

- The boto3 client is `accessanalyzer`; the IAM prefix is `access-analyzer`.
  Both `list_findings` and `list_findings_v2` are authorized by the single
  action `access-analyzer:ListFindings`.
- AVA Govern reads Security Hub findings only. It does not call `DescribeHub`,
  `BatchGetSecurityControls`, or the security control definition APIs, so those
  are not granted.

### `EnableComplianceAudit` - Compliance and audit

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernComplianceAudit` | `ConfigComplianceRead` | `config:DescribeConfigRules`, `config:DescribeComplianceByConfigRule`, `config:GetComplianceDetailsByConfigRule` | `*` |
| `AVAGovernComplianceAudit` | `AuditManagerListAssessments` | `auditmanager:ListAssessments` | `*` |
| `AVAGovernComplianceAudit` | `AuditManagerEvidenceRead` | `auditmanager:GetAssessment`, `auditmanager:GetEvidenceFoldersByAssessment`, `auditmanager:GetEvidenceByEvidenceFolder` | `assessment/*` in this account and Region |
| `AVAGovernComplianceAudit` | `OrganizationsPolicyRead` | `organizations:ListPolicies`, `organizations:ListTargetsForPolicy` | `*` |
| `AVAGovernComplianceAudit` | `VerifiedPermissionsRead` | `verifiedpermissions:ListPolicyStores`, `verifiedpermissions:GetPolicyStore`, `verifiedpermissions:ListPolicies`, `verifiedpermissions:ListIdentitySources`, `verifiedpermissions:GetSchema` | `*` |

`organizations:*` calls only succeed from the organization management account or
a delegated administrator. Elsewhere they return `AccessDeniedException` and the
service control policy view degrades to `live: false`.

### `EnableDataGovernance` - Data and model governance

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernDataGovernance` | `GlueCatalogRead` | `glue:GetDatabases`, `glue:GetTables` | `catalog`, `database/*`, `table/*/*` |
| `AVAGovernDataGovernance` | `GlueDataQualityRead` | `glue:ListDataQualityRulesets`, `glue:ListDataQualityRulesetEvaluationRuns`, `glue:GetDataQualityRulesetEvaluationRun` | `*` |
| `AVAGovernDataGovernance` | `SageMakerInventoryRead` | `sagemaker:ListModels`, `sagemaker:ListEndpoints`, `sagemaker:ListModelPackages`, `sagemaker:ListModelCards`, `sagemaker:ListProcessingJobs`, `sagemaker:ListArtifacts`, `sagemaker:ListContexts`, `sagemaker:ListAssociations` | `*` |
| `AVAGovernDataGovernance` | `SageMakerProcessingJobRead` | `sagemaker:DescribeProcessingJob` | `processing-job/*` in this account and Region |
| `AVAGovernDataGovernance` | `S3SageMakerMonitorRead` | `s3:ListBucket`, `s3:GetObject` | the `sagemaker-<region>-<account>` bucket and its objects |
| `AVAGovernDataGovernance` | `S3EvaluationOutputRead` | `s3:ListBucket`, `s3:GetObject` | `*` (see note) |
| `AVAGovernDataGovernance` | `KMSListKeys` | `kms:ListKeys`, `kms:ListAliases` | `*` |
| `AVAGovernDataGovernance` | `KMSKeyMetadataRead` | `kms:DescribeKey`, `kms:GetKeyRotationStatus` | `key/*` in this account and Region |
| `AVAGovernDataGovernance` | `ResourceTagsRead` | `tag:GetResources` | `*` |

Notes:

- **`S3EvaluationOutputRead` is the widest grant in this role, and it is now
  bounded two ways.** Bedrock evaluation jobs name their own output bucket at
  runtime, so the bucket is genuinely not knowable when the template is written —
  but the old `Resource: '*'` with no condition was wider than that constraint
  requires:
  - It now carries `Condition: StringEquals { aws:ResourceAccount: <this account> }`,
    so it can never read another account's bucket even if that bucket's policy
    would permit this principal. No functional cost.
  - The new **`EvaluationOutputBucketArns`** parameter scopes it to exactly the
    ARNs you supply (pass both `arn:…:::bucket` and `arn:…:::bucket/*` per bucket,
    so `ListBucket` and `GetObject` both resolve). Left empty it falls back to all
    buckets **in this account only**. Setting it is the single largest permission
    reduction available in this template.

  Within the account-scoped fallback it still reads every object in every bucket,
  so scope it if you can. It grants object read only, never write.

  Measured for context: 38 of the 47 statements in this role use
  `Resource: '*'`, but for every other one it is an API limitation — Cost
  Explorer, Security Hub, AWS Config, Organizations and similar services do not
  support resource-level permissions, so there is no tighter form to write.
  **S3 does support it**, which is what singles this statement out.

  **Both bounds described above are implemented** - this is no longer a
  recommendation. `aws:ResourceAccount` is unconditional, and
  `EvaluationOutputBucketArns` narrows the resource list when supplied. A
  `Condition` key on `aws:ResourceTag` remains a workable alternative if your
  evaluation buckets are consistently tagged.
- The Resource Groups Tagging API client is named `resourcegroupstaggingapi`,
  but the IAM prefix is `tag`, so `get_resources()` is authorized by
  `tag:GetResources`.
- AVA Govern reads SageMaker **inventory and lineage only**. It does not call
  `DescribeEndpoint`, `DescribeModel`, `ListTrainingJobs`,
  `DescribeTrainingJob`, `ListNotebookInstances`, or `DescribeNotebookInstance`,
  so those are not granted despite appearing in earlier revisions of this
  document.
- Glue reads are catalog-level. `GetDatabase`, `GetTable`, and `SearchTables`
  are not called and are not granted.

### `EnableOperations` - Operations and inventory

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernOperations` | `ServiceQuotasRead` | `servicequotas:ListServiceQuotas`, `servicequotas:GetServiceQuota` | `*` |
| `AVAGovernOperations` | `SSMInventoryRead` | `ssm:DescribeInstanceInformation`, `ssm:ListDocuments`, `ssm:ListCommands` | `*` |
| `AVAGovernOperations` | `HealthEventsRead` | `health:DescribeEvents`, `health:DescribeEventAggregates` | `*` |
| `AVAGovernOperations` | `TrustedAdvisorRead` | `support:DescribeTrustedAdvisorChecks`, `support:DescribeTrustedAdvisorCheckSummaries` | `*` |
| `AVAGovernOperations` | `EC2RegionDiscovery` | `ec2:DescribeRegions` | `*` |
| `AVAGovernOperations` | `ApiGatewayRead` | `apigateway:GET` | `/restapis` and `/restapis/*` |
| `AVAGovernOperations` | `SecretsManagerListOnly` | `secretsmanager:ListSecrets` | `*` |
| `AVAGovernOperations` | `CodeCommitListRepositories` | `codecommit:ListRepositories` | `*` |
| `AVAGovernOperations` | `CodeCommitRepositoryRead` | `codecommit:GetRepository`, `codecommit:GetBranch`, `codecommit:GetCommit`, `codecommit:GetFolder`, `codecommit:GetFile` | repositories in this account and Region |

Notes:

- **The IAM prefix is `servicequotas`, not `service-quotas`.** The boto3 client
  name uses a hyphen; the IAM prefix does not.
- **Secrets Manager access is metadata only.** AVA Govern counts secrets to
  attest a control. `secretsmanager:GetSecretValue` and
  `secretsmanager:BatchGetSecretValue` are deliberately **not** granted, and no
  Govern code path calls them.
- API Gateway authorizes reads with the HTTP verb `GET` rather than an
  operation name, so `get_rest_apis()` requires `apigateway:GET`.
- **Trusted Advisor is read through the Support API.** The `trustedadvisor`
  prefix governs the Trusted Advisor console and cannot authorize
  `DescribeTrustedAdvisorChecks`; the `support` prefix is required. Both the
  Support and Health APIs require a Business, Enterprise On-Ramp, or Enterprise
  Support plan and return `SubscriptionRequiredException` otherwise, which AVA
  Govern reports as a plan limitation rather than a permissions gap.
- `ec2:DescribeRegions` supports Region discovery only. No instance, volume, or
  network read is granted.

### Always on

| Policy | Sid | Actions | Resource |
|---|---|---|---|
| `AVAGovernIAMRead` | `IAMReadOnly` | `iam:GetPolicy`, `iam:GetPolicyVersion`, `iam:GetRole`, `iam:GetRolePolicy`, `iam:ListAttachedRolePolicies`, `iam:ListRolePolicies`, `iam:ListRoles`, `iam:ListPolicies`, `iam:SimulatePrincipalPolicy` | `*` |

`sts:GetCallerIdentity` is called in several services but is **not** granted and
does not need to be: it requires no permissions and cannot be denied by an
identity policy.

## `EnableWriteActions` - Off By Default

Default `false`. When false the `AVAGovernWriteActions` policy is **not created**,
and the role is read-only in the strict sense: no create, update, delete, or put
action anywhere on it. Leave it false unless you need one of the features below.

The write actions are isolated in a single conditional policy rather than mixed
into the capability policies, so `aws iam list-role-policies` tells you in one
call whether this role can write anything at all.

| Sid | Action | Resource | Bound |
|---|---|---|---|
| `GuardrailInvocation` | `bedrock:ApplyGuardrail` | `arn:<partition>:bedrock:*:<account>:guardrail/*` | Guardrails in this account. Applying a guardrail is billable and is classified write, but it mutates nothing. |
| `CloudWatchCustomMetrics` | `cloudwatch:PutMetricData` | `*` (the API takes no resource) | `Condition: StringEquals { cloudwatch:namespace: AVA/LLMQuality }` - cannot write into any other namespace. |
| `CloudWatchDashboardsAndAlarms` | `cloudwatch:PutDashboard`, `cloudwatch:PutMetricAlarm` | `*` | **Unbounded on create.** Both overwrite by name, so this can replace an existing dashboard or alarm. The widest grant in the policy. |
| `CloudWatchDeleteOwnAlarms` | `cloudwatch:DeleteAlarms` | `arn:<partition>:cloudwatch:<region>:<account>:alarm:AVA-*` | Name-prefixed: can only delete alarms it created. |
| `ServiceQuotaRequests` | `servicequotas:RequestServiceQuotaIncrease` | `*` | Quota increases are reviewed by AWS Support; no resource is modified. |

Features that stay unavailable while it is false:

| Feature | Blocked call | Consequence |
|---|---|---|
| Service Quotas increase requests | `servicequotas:RequestServiceQuotaIncrease` (`services/govern_capacity_service.py`) | The quota increase endpoint fails. Request increases through the AWS console instead. |
| Guardrail enforcement testing | `bedrock:ApplyGuardrail` | The guardrail test path cannot invoke a guardrail. Guardrail inventory, telemetry, and drift reporting are read-only and unaffected. |
| Alarm and dashboard provisioning | `cloudwatch:PutMetricAlarm`, `cloudwatch:PutDashboard` | AVA Govern reads alarms but cannot create them. |
| Harness audit artifact sink | `s3:PutObject` (`services/govern_harness_audit_service.py`) | Audit artifacts fall back to local filesystem storage. **`s3:PutObject` is not granted even with `EnableWriteActions=true`** - a governance role that can write into a data bucket is a different risk class. This path is unreachable today regardless, because `HARNESS_AUDIT_BUCKET` is not defined in `core/config.py`, so the S3 client is never constructed. |

The `EnabledCapabilities` stack output reports the setting as
`Write actions (opt-in): <true|false>`, so a deployed stack can be audited
without reading the template.

**If you need a write action that is not listed above, do not add it here.** Put
it in a separate policy on a separate role. A dashboard role that can write
broadly is a dashboard role that can break production.

## Behavior When a Permission Is Missing

AVA Govern is built to degrade honestly. Every backend response carries a
`live` / `source` / `note` triple, and a failed AWS call produces:

```json
{ "live": false, "source": "unavailable-fallback", "note": "<why>" }
```

A missing permission must never render as a zero. The Security Hub reader in
`services/govern_risk_posture_service.py` is the reference implementation: it
distinguishes a denial from a disabled service from an unreachable endpoint,
and all three stay distinct from a genuine empty result.

| Situation | Response |
|---|---|
| `securityhub:GetFindings` not granted | `live: false`; the note names the missing action and states this is a permissions gap, not zero findings |
| Security Hub not enabled in the Region | `live: false`; the note states this is not a permissions problem |
| Endpoint unreachable or throttled | `live: false`; the note states findings are unknown, not zero |
| Security Hub enabled with no findings | `live: true`, total 0, note "Security Hub has no active findings." |

Two known gaps in this contract, tracked separately from this role:

- `api/routes/knowledge.py` calls `glue:GetDatabases` and `glue:GetTables` under
  a bare `except Exception` and returns HTTP 500 on denial rather than
  degrading. The Govern data catalog service reading the same APIs degrades
  correctly.
- `api/routes/govern_audit_manager.py` re-raises unrecognized `ClientError`
  codes, so an unexpected Audit Manager error code surfaces as a 500.

## Permissions by Feature

| Feature | AWS services | Gating parameter |
|---|---|---|
| Agent registry and fleet | Bedrock, Bedrock AgentCore | `EnableBedrock` |
| Guardrails | Bedrock | `EnableBedrock` |
| Model and knowledge base inventory | Bedrock, SageMaker | `EnableBedrock`, `EnableDataGovernance` |
| Cost and FinOps | Cost Explorer, Budgets, Compute Optimizer | `EnableCostExplorer` |
| Compliance controls | AWS Config, Audit Manager | `EnableComplianceAudit` |
| Service control policies | Organizations | `EnableComplianceAudit` |
| Authorization policy stores | Verified Permissions | `EnableComplianceAudit` |
| Risk posture and findings | Security Hub, GuardDuty, Inspector, Detective, Macie, IAM Access Analyzer | `EnableSecurityServices` |
| Security data lake | Security Lake | `EnableSecurityServices` |
| Data sensitivity | Macie | `EnableSecurityServices` |
| Audit trail | CloudTrail | `EnableCloudTrail` |
| Runtime metrics, alarms, traces | CloudWatch, CloudWatch Logs, X-Ray | `EnableCloudWatch` |
| Mean time to detect | CloudWatch alarm history | `EnableCloudWatch` |
| Data catalog and data quality | Glue | `EnableDataGovernance` |
| Model monitoring and lineage | SageMaker, S3 | `EnableDataGovernance` |
| Encryption posture | KMS | `EnableDataGovernance` |
| Resource tag coverage | Resource Groups Tagging API | `EnableDataGovernance` |
| Capacity and quotas | Service Quotas | `EnableOperations` |
| Fleet and node inventory | Systems Manager | `EnableOperations` |
| Service health | AWS Health | `EnableOperations` |
| Trusted Advisor checks | AWS Support | `EnableOperations` |
| Multi-Region discovery | EC2 | `EnableOperations` |
| API surface inventory | API Gateway | `EnableOperations` |
| Secret sprawl control | Secrets Manager (list only) | `EnableOperations` |
| AI-DLC repository signals | CodeCommit | `EnableOperations` |
| IAM policy analysis | IAM | always on |

## Other IAM Artifacts in This Repo

**There are no longer any.** `infrastructure/iam/ava-govern-role.yaml` is the
only role definition in this repo.

Two duplicates were deleted rather than reconciled:

| Deleted artifact | What it was |
|---|---|
| `platform/control_plane/infra/cloudformation/ava-govern-iam.yaml` | An independent role definition with one large `ReadOnlyPolicy` plus a conditional `WritePolicy`. |
| `platform/control_plane/infra/terraform/modules/ava-govern-iam/` | A Terraform port of the file above: identical statement Sids in the same order, plus a cross-account `AssumeGovernRole` policy and a spoke role. |

They were **strict subsets**, not alternatives: 88 actions each against 167 in
the canonical template, missing 116 including `bedrock:ListAgents` (referenced by
23 backend services), `bedrock-agentcore:ListAgentRuntimes`,
`bedrock:ListInferenceProfiles`, `bedrock:ListKnowledgeBases`, and every
`auditmanager` action. Deploying either would have rendered the agent registry,
AgentCore posture, model catalog, and compliance surfaces `live: false`.

They also carried stale action names (`bedrock-agent:*`,
`bedrock-agentcore-control:*`, `budgets:DescribeBudgets`), granted SageMaker
actions AVA Govern never calls, and granted write actions unconditionally, which
is now handled by the opt-in `EnableWriteActions` parameter instead.

If you maintain a Terraform deployment, port from the canonical CloudFormation
template rather than restoring the deleted module.

## Environment Configuration

### Required Environment Variables

```bash
# Region (defaults to us-east-1)
AWS_REGION=us-east-1

# Optional: explicit profile (local dev only)
AWS_PROFILE=your-profile-name
```

### Backend Configuration

In `backend/src/core/config.py`:
```python
AWS_REGION: str = Field(default="us-east-1")
```

Override via environment: `export AWS_REGION=us-west-2`

## Deployment Patterns

### Local Development

Use your AWS CLI profile:
```bash
# Configure credentials
aws configure --profile ava-dev

# Set profile for the session
export AWS_PROFILE=ava-dev

# Start backend
cd platform/control_plane/backend
source venv312/Scripts/activate
python -m uvicorn src.main:app --reload --port 8000
```

### ECS Fargate

Attach an IAM role to the ECS task definition:
```json
{
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/AVAGovernTaskRole",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole"
}
```

### Lambda

Attach the policy to the Lambda execution role:
```yaml
# SAM template
Resources:
  AVAGovernFunction:
    Type: AWS::Serverless::Function
    Properties:
      Role: !GetAtt AVAGovernRole.Arn
```

### EC2

Attach an instance profile with the IAM role:
```bash
aws ec2 associate-iam-instance-profile \
  --instance-id i-1234567890abcdef0 \
  --iam-instance-profile Name=AVAGovernInstanceProfile
```

## Cross-Account Access

For multi-account governance, use IAM role assumption. The account IDs below are
**synthetic placeholders** — substitute your own member account IDs. Never commit real
account IDs to this repository.

```json
{
  "Sid": "AssumeGovernRole",
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::111111111111:role/AVAGovernReadOnly",
    "arn:aws:iam::222222222222:role/AVAGovernReadOnly"
  ]
}
```

Then in the spoke accounts, create a trust policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::HUB_ACCOUNT:role/AVAGovernHubRole"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

## Least-Privilege Recommendations

1. **Stay read-only**: This role is read-only and should remain so. Put any
   write action on a separate role, never in this one.
2. **Turn off what you do not use**: Set the matching `Enable*` parameter to
   `false`. AVA Govern degrades honestly rather than erroring, and the surface
   renders as `live: false` instead of showing a fabricated zero.
3. **Narrow `S3EvaluationOutputRead`**: It is the widest statement in the role.
   Pass your evaluation output bucket ARNs in the `EvaluationOutputBucketArns`
   parameter — both the bucket and the `/*` form for each. It is already confined
   to this account via `aws:ResourceAccount`, so the remaining exposure is
   in-account buckets unrelated to AI governance.
4. **Use conditions**: Add conditions for IP ranges, MFA, or time-based access.
5. **Audit regularly**: Enable CloudTrail and review AVA's API calls. Because
   the role is read-only, the audit question is what it read, not what it changed.
6. **Verify before assuming**: `iam:SimulatePrincipalPolicy` is granted, so you
   can test whether the role can make a call without making it.

## Troubleshooting

### "Access Denied" Errors

Check which permission is missing:
```bash
# See what identity boto3 is using
aws sts get-caller-identity

# Test specific permission
aws bedrock list-guardrails --region us-east-1
```

### "No credentials" Errors

```bash
# Verify credentials exist
aws configure list

# Check environment
echo $AWS_PROFILE
echo $AWS_ACCESS_KEY_ID
```

### Region Mismatch

Ensure `AWS_REGION` matches where your resources are deployed:
```bash
export AWS_REGION=us-east-1
```

## Service-Specific Notes

### Cost Explorer

- Must be enabled in the AWS Billing console first
- Takes 24-48 hours to populate after enabling
- Requires account-level permissions (not resource-specific)

### Security Hub

- Must be enabled in the region
- Enable AWS Foundational Security Best Practices standard for AI-relevant controls

### Service Quotas

- Some quotas are not adjustable via API
- Quota increase requests require an AWS Support response
- This role reads quotas but cannot request increases; see
  "No Write Permissions, By Design" above

### AWS Support and AWS Health

- Both APIs require a Business, Enterprise On-Ramp, or Enterprise Support plan
- On lower plans they return `SubscriptionRequiredException`, which AVA Govern
  reports as a support-plan limitation, not a permissions gap

### Organizations

- `organizations:ListPolicies` and `ListTargetsForPolicy` only succeed from the
  organization management account or a delegated administrator
- Elsewhere the service control policy view degrades to `live: false`

### Bedrock

- Model access must be requested in the Bedrock console
- Guardrails must be created before they appear in the API

---

## Quick Start

1. Deploy `platform/control_plane/infrastructure/iam/ava-govern-role.yaml`
   (see "Canonical Source" above). Do not hand-build the policies.
2. Attach the resulting role to your compute: ECS task role, Lambda execution
   role, EC2 instance profile, App Runner instance role, or EKS IRSA.
3. Set the `AWS_REGION` environment variable.
4. Deploy and verify with the `/health` endpoint.

For local development:
```bash
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
cd platform/control_plane/backend
source venv312/Scripts/activate
python -m uvicorn src.main:app --reload --port 8000
```

Verify live data:
```bash
curl http://localhost:8000/api/v1/govern/agentcore/agents | jq '.live'
# Should return: true
```
