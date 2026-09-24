# WAR Remediation Plan
## KYC Controlled Quality Output — Actionable Fix Sequence for Kiro

**Generated:** 2026-07-16  
**Source:** `full_well_architected_review.md` (Full Well-Architected Review)  
**Target:** Public AWS Samples publication readiness  
**Executor:** Kiro (AI coding agent in IDE)

---

## Executive Summary

### What's Already Fixed (Phase 2 Completed)

| ID | Finding | Resolution |
|----|---------|-----------|
| SEC-HRI-1 | API key exposed to browser via runtime-config.json | ✅ Lambda authorizer on 5 backends; no API key in browser |
| SEC-HRI-3 | No authentication on API endpoints | ✅ Lambda authorizer via CloudFront-only validation |
| COST-HRI-1 | 8 separate API Gateways | ✅ Consolidated to single gateway (46md2r9izf) with path-based routing |

### Current Risk Posture

- **Before Phase 2:** 10 HRIs, 25 MRIs — 🔴 Critical
- **After Phase 2:** 7 HRIs, 25 MRIs — 🟡 Needs Remediation
- **After this plan:** 0 HRIs, 0 MRIs — 🟢 Publication Ready

### Remaining Work Summary

| Priority | Count | Effort | Blocking? |
|----------|:-----:|--------|-----------|
| P0 (blocks publication) | 7 findings | ~4 hours | Yes — cannot publish until complete |
| P1 (before customer demos) | 10 findings | ~6 hours | Yes — before any external demo |
| P2 (production hardening) | 15 findings | ~8 hours | No — can publish without these |

---

## P0 — Blocks Publication

These items MUST be fixed before the repo can go public on `aws-samples`.

---

### SEC-HRI-2 — CORS wildcard allows any origin to call APIs
**Severity:** HIGH  
**Pillar:** Security  
**File(s):** `deploy/lambdas/llm_judge/lambda_function.py:65`, `deploy/lambdas/deterministic_check/lambda_function.py:80`  
**What's wrong:** All Lambda response headers include `Access-Control-Allow-Origin: *`, allowing any website to make cross-origin requests to the governance APIs.  
**Fix:**  
Replace the hardcoded `*` with the CloudFront distribution domain. Since API calls now go through the consolidated gateway behind CloudFront, CORS should reference the CF domain:
```python
# In each Lambda response builder, replace:
'Access-Control-Allow-Origin': '*'
# With:
'Access-Control-Allow-Origin': os.environ.get('ALLOWED_ORIGIN', 'https://d1234example.cloudfront.net')
```
Then add the environment variable in the CFN template:
```yaml
Environment:
  Variables:
    ALLOWED_ORIGIN: !Sub 'https://${CloudFrontDistribution.DomainName}'
```
For the public sample, use a CFN parameter so deployers provide their own domain:
```yaml
Parameters:
  AllowedOrigin:
    Type: String
    Description: CloudFront distribution URL for CORS
```
**Validation:** Deploy, open browser DevTools Network tab, confirm `Access-Control-Allow-Origin` header shows the CF domain (not `*`). Attempt fetch from a different origin — should get CORS error.  
**Effort:** Low

---

### AI-HRI-1 — Cedar policy cascade is in shadow mode (not enforcing)
**Severity:** HIGH  
**Pillar:** Agentic AI Lens  
**File(s):** `deploy/own-backend/runtime-template.yaml` (environment variables section)  
**What's wrong:** `POLICY_CASCADE_ENABLED: 'false'` and `POLICY_CASCADE_MODE: shadow` means the 18 Cedar policies evaluate but never block requests. The governance story is incomplete for publication.  
**Fix:**  
In `deploy/own-backend/runtime-template.yaml`, update the environment variables:
```yaml
Environment:
  Variables:
    POLICY_CASCADE_ENABLED: 'true'
    POLICY_CASCADE_MODE: 'enforce'
```
**Validation:** Invoke agent with a request that should be denied by Cedar (e.g., amount exceeding tier ceiling, sanctioned jurisdiction). Confirm the response includes a policy denial rather than proceeding.  
**Effort:** Low

---

### OPS-MRI-1 — Hardcoded account ID in templates
**Severity:** MEDIUM (but P0 because it blocks portability for public repo)  
**Pillar:** Operational Excellence  
**File(s):** `deploy/pipeline/template-cfn.yaml:47`, `deploy/own-backend/runtime-template.yaml`  
**What's wrong:** Account ID `548509140218` is hardcoded, making templates non-portable and leaking internal information.  
**Fix:**  
Search all YAML/JSON files for `548509140218` and replace with `!Ref AWS::AccountId` (in CFN) or `${AWS::AccountId}` (in !Sub strings):
```yaml
# Before:
Resource: 'arn:aws:s3:::kyc-demo-548509140218-*'
# After:
Resource: !Sub 'arn:aws:s3:::kyc-demo-${AWS::AccountId}-*'
```
For non-CFN files (scripts, configs), use environment variables or SSM parameters.  
**Validation:** `grep -r "548509140218" deploy/` returns zero matches. Deploy successfully to a different account.  
**Effort:** Low

---

### SEC-MRI-3 — Email address hardcoded in billing alarm
**Severity:** MEDIUM (but P0 because it's PII in a public repo)  
**Pillar:** Security  
**File(s):** `deploy/billing-alarm.yaml:15`  
**What's wrong:** `rosharao@amazon.co.uk` is hardcoded — PII that cannot appear in a public repository.  
**Fix:**  
Replace with a CFN parameter:
```yaml
Parameters:
  NotificationEmail:
    Type: String
    Description: Email address for billing alarm notifications
    NoEcho: true

# In the SNS subscription:
Subscription:
  - Endpoint: !Ref NotificationEmail
    Protocol: email
```
**Validation:** `grep -ri "rosharao\|@amazon" deploy/` returns zero matches. Deploy with a test email, confirm subscription confirmation arrives.  
**Effort:** Low

---

### SEC-HRI-4 — CodeBuild IAM role has overly broad permissions
**Severity:** HIGH  
**Pillar:** Security  
**File(s):** `deploy/pipeline/template-cfn.yaml:30-37`  
**What's wrong:** CodeBuild role uses `s3:*` on `Resource: '*'` and `cloudfront:CreateInvalidation` on `Resource: '*'` — violates least-privilege principle and is a security anti-pattern for a public sample.  
**Fix:**  
Scope permissions to specific resources:
```yaml
- Effect: Allow
  Action:
    - s3:PutObject
    - s3:GetObject
    - s3:ListBucket
    - s3:DeleteObject
  Resource:
    - !Sub 'arn:aws:s3:::${UIBucketName}'
    - !Sub 'arn:aws:s3:::${UIBucketName}/*'
- Effect: Allow
  Action:
    - cloudfront:CreateInvalidation
  Resource:
    - !Sub 'arn:aws:cloudfront::${AWS::AccountId}:distribution/${DistributionId}'
```
Add parameters for `UIBucketName` and `DistributionId` to the template.  
**Validation:** Deploy pipeline template. Run CodeBuild — confirm it still succeeds. Manually verify IAM policy in console shows scoped resources.  
**Effort:** Low

---

### CROSS-1 — Repository hygiene: test artifacts and backup directories
**Severity:** MEDIUM (P0 for public repo cleanliness)  
**Pillar:** Operational Excellence (Cross-cutting)  
**File(s):** Root directory: `Associated`, `Credit`, `curl`, `aws` files; `kyc_banking_backup_working/`; `test-dist-config.json`, `test-dist-config-updated.json`, `update-result.json`  
**What's wrong:** Dead artifacts, backup directories, and test output committed to repo. Unprofessional for AWS Samples.  
**Fix:**  
1. Delete the following files/directories:
   - `Associated` (accidental file in root)
   - `Credit` (accidental file in root)
   - `curl` (accidental file in root)
   - `aws` (accidental file in root)
   - `kyc_banking_backup_working/` (entire directory)
   - `test-dist-config.json`
   - `test-dist-config-updated.json`
   - `update-result.json`
2. Add to `.gitignore`:
   ```
   # Test artifacts
   test-dist-config*.json
   update-result.json
   
   # Backup directories
   *_backup_*/
   ```
**Validation:** `git status` shows clean working tree after commit. No stray files in root. `.gitignore` prevents re-adding.  
**Effort:** Low

---

### CROSS-2 — No README with deployment instructions
**Severity:** MEDIUM (P0 — unusable by others without it)  
**Pillar:** Operational Excellence (Cross-cutting)  
**File(s):** Root `README.md` (create new)  
**What's wrong:** AWS Samples requires a standardized README with architecture diagram, prerequisites, deployment steps, and cleanup instructions.  
**Fix:**  
Create `README.md` following the [aws-samples template](https://github.com/aws-samples/.github/blob/main/PULL_REQUEST_TEMPLATE.md):
```markdown
# KYC Controlled Quality Output

AI-powered Know Your Customer governance with multi-layer policy enforcement.

## Architecture
[Include architecture diagram]

## Prerequisites
- AWS Account with Bedrock model access (Claude Sonnet 4.5, Haiku)
- Node.js 18+
- AWS CLI configured
- AWS SAM CLI

## Deployment
1. Deploy infrastructure: `sam deploy --template deploy/template.yaml --guided`
2. Deploy backend services: [ordered steps]
3. Deploy frontend: `npm run build && aws s3 sync dist/ s3://<bucket>`

## Cleanup
`sam delete --stack-name <stack-name>`

## Security
See [CONTRIBUTING](CONTRIBUTING.md) for reporting security issues.

## License
MIT-0
```
**Validation:** README renders correctly on GitHub. A new developer can follow steps from scratch.  
**Effort:** Medium

---

## P1 — Before Customer Demos

These should be fixed before showing to external audiences but don't block publication.

---

### REL-HRI-1 — Infinite poll loop with no timeout in invokeAgent()
**Severity:** HIGH  
**Pillar:** Reliability  
**File(s):** `src/api/client.ts:52-66`  
**What's wrong:** `invokeAgent()` uses `while(true)` to poll agent status with no timeout. If the agent hangs, the browser tab runs forever, consuming memory and battery.  
**Fix:**  
Add a timeout matching the `invokeLive()` pattern (60s) and exponential backoff:
```typescript
export async function invokeAgent(payload: InvokePayload): Promise<AgentResponse> {
  const startTime = Date.now();
  const TIMEOUT_MS = 90_000; // 90 seconds max
  let pollInterval = 1000; // Start at 1s
  const MAX_POLL_INTERVAL = 10_000; // Cap at 10s
  
  const invocationId = await startInvocation(payload);
  
  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(pollInterval);
    const status = await checkStatus(invocationId);
    
    if (status.state === 'COMPLETED') return status.result;
    if (status.state === 'FAILED') throw new AgentError(status.error);
    
    pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
  }
  
  throw new AgentTimeoutError(`Agent did not respond within ${TIMEOUT_MS / 1000}s`);
}
```
**Validation:** Mock a never-completing agent invocation. Confirm the UI shows a timeout error after 90s rather than spinning forever.  
**Effort:** Low

---

### REL-MRI-1 — Fixed 2-second poll interval wastes resources
**Severity:** MEDIUM  
**Pillar:** Reliability  
**File(s):** `src/api/client.ts:52`, `src/api/agentcore.ts:88`  
**What's wrong:** Fixed 2-second polling creates unnecessary load and wastes bandwidth. Early polls are too slow, late polls too frequent.  
**Fix:**  
(Included in REL-HRI-1 fix above — exponential backoff starting at 1s, capped at 10s, factor 1.5x)  
**Validation:** Monitor Network tab — confirm increasing intervals between status polls.  
**Effort:** Low (bundled with REL-HRI-1)

---

### REL-HRI-2 — No DLQ on async Lambda invocation
**Severity:** HIGH  
**Pillar:** Reliability  
**File(s):** `deploy/own-backend/api-proxy-template.yaml:128-135`  
**What's wrong:** Async Lambda invocations (agent processing) that fail are silently lost. No way to detect or retry failed invocations.  
**Fix:**  
Add a DLQ (SQS) and configure the Lambda's event invoke config:
```yaml
AgentInvokeDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub '${AWS::StackName}-agent-invoke-dlq'
    MessageRetentionPeriod: 1209600  # 14 days
    Tags:
      - Key: Project
        Value: kyc-governance-insights

AgentProxyFunctionEventInvokeConfig:
  Type: AWS::Lambda::EventInvokeConfig
  Properties:
    FunctionName: !Ref AgentProxyFunction
    Qualifier: $LATEST
    MaximumRetryAttempts: 2
    DestinationConfig:
      OnFailure:
        Destination: !GetAtt AgentInvokeDLQ.Arn

# Add SQS permissions to the Lambda role:
- Effect: Allow
  Action:
    - sqs:SendMessage
  Resource: !GetAtt AgentInvokeDLQ.Arn
```
**Validation:** Force a Lambda failure (e.g., invalid payload). Check SQS console — message should appear in DLQ within 3 retries. Add a CloudWatch alarm on `ApproximateNumberOfMessagesVisible > 0`.  
**Effort:** Low

---

### OPS-HRI-2 — Proxy alarms fire into void (no SNS actions)
**Severity:** HIGH  
**Pillar:** Operational Excellence  
**File(s):** `deploy/proxy-alarms/template-cfn.yaml`  
**What's wrong:** All 8 CloudWatch alarms (error + p99 latency) have no `AlarmActions` — they trigger but nobody is notified.  
**Fix:**  
Add an SNS topic and wire all alarms to it:
```yaml
Parameters:
  OperatorEmail:
    Type: String
    Description: Email for alarm notifications
    NoEcho: true

AlarmNotificationTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: !Sub '${AWS::StackName}-alarm-notifications'

AlarmNotificationSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref AlarmNotificationTopic
    Protocol: email
    Endpoint: !Ref OperatorEmail

# On EACH alarm resource, add:
AlarmActions:
  - !Ref AlarmNotificationTopic
OKActions:
  - !Ref AlarmNotificationTopic
```
**Validation:** Deploy. Manually set an alarm to ALARM state via CloudWatch console. Confirm email notification arrives.  
**Effort:** Low

---

### OPS-HRI-1 — 14+ independent CFN stacks with no orchestration
**Severity:** HIGH  
**Pillar:** Operational Excellence  
**File(s):** All templates in `deploy/`, 35+ `.bat` scripts  
**What's wrong:** Deploy ordering is manual and error-prone. No dependency management between stacks.  
**Fix:**  
Create a `deploy/Makefile` (or `deploy.sh`) that orchestrates stacks in dependency order:
```makefile
# deploy/Makefile
.PHONY: all infrastructure backend frontend

all: infrastructure backend frontend

infrastructure:
	@echo "Deploying infrastructure layer..."
	aws cloudformation deploy --template-file template.yaml --stack-name kyc-infra --capabilities CAPABILITY_IAM
	aws cloudformation deploy --template-file security/waf-template.yaml --stack-name kyc-waf

backend: infrastructure
	@echo "Deploying backend services..."
	aws cloudformation deploy --template-file lambdas/template-cfn.yaml --stack-name kyc-lambdas --capabilities CAPABILITY_IAM
	aws cloudformation deploy --template-file cedar-gateway/template-cfn.yaml --stack-name kyc-cedar --capabilities CAPABILITY_IAM
	aws cloudformation deploy --template-file hitl/template-cfn.yaml --stack-name kyc-hitl --capabilities CAPABILITY_IAM
	aws cloudformation deploy --template-file grounding-proxy/template-cfn.yaml --stack-name kyc-grounding --capabilities CAPABILITY_IAM
	aws cloudformation deploy --template-file own-backend/api-proxy-template.yaml --stack-name kyc-agent --capabilities CAPABILITY_IAM

frontend: backend
	@echo "Building and deploying frontend..."
	cd .. && npm run build
	aws s3 sync ../dist/ s3://$$(aws cloudformation describe-stacks --stack-name kyc-infra --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
	aws cloudfront create-invalidation --distribution-id $$(aws cloudformation describe-stacks --stack-name kyc-infra --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' --output text) --paths '/*'

clean:
	@echo "Deleting all stacks in reverse order..."
	# [reverse order deletion]
```
**Validation:** Run `make all` from clean state. All stacks deploy without manual intervention. Run `make clean` — all stacks delete cleanly.  
**Effort:** Medium

---

### SEC-MRI-2 — HITL audit table allows DeleteItem
**Severity:** MEDIUM  
**Pillar:** Security  
**File(s):** `deploy/hitl/template-cfn.yaml:47`  
**What's wrong:** The HITL Lambda role includes `dynamodb:DeleteItem` permission on the audit log table. Audit records should be immutable — no process should delete audit entries.  
**Fix:**  
Remove `DeleteItem` from the IAM policy for the audit table:
```yaml
# In the IAM policy statement for hitl-audit-log table:
- Effect: Allow
  Action:
    - dynamodb:PutItem
    - dynamodb:GetItem
    - dynamodb:Query
    # REMOVED: dynamodb:DeleteItem
  Resource: !GetAtt AuditLogTable.Arn
```
**Validation:** Attempt to call `DeleteItem` on the audit table using the Lambda's role — should get AccessDenied.  
**Effort:** Low

---

### SEC-MRI-4 — No dependency scanning in CI/CD
**Severity:** MEDIUM  
**Pillar:** Security  
**File(s):** `buildspec.yml` (pre_build phase)  
**What's wrong:** No `npm audit` step means vulnerable dependencies could ship without detection.  
**Fix:**  
Add to `buildspec.yml` in the `pre_build` phase:
```yaml
pre_build:
  commands:
    - echo "Running dependency audit..."
    - npm audit --audit-level=high
    - echo "Installing dependencies..."
    - npm ci
```
**Validation:** Introduce a known-vulnerable package temporarily. Confirm build fails at the audit step.  
**Effort:** Low

---

### COST-MRI-1 — No resource tagging for cost allocation
**Severity:** MEDIUM  
**Pillar:** Cost Optimization  
**File(s):** All templates except `deploy/cedar-gateway/template-cfn.yaml` (which already has tags)  
**What's wrong:** Most resources lack tags, making cost attribution impossible.  
**Fix:**  
Add a consistent tagging block to ALL resources in ALL templates:
```yaml
# Add as Parameters in each template:
Parameters:
  ProjectTag:
    Type: String
    Default: kyc-governance-insights
  EnvironmentTag:
    Type: String
    Default: demo
    AllowedValues: [demo, test, prod]

# Add to each resource:
Tags:
  - Key: Project
    Value: !Ref ProjectTag
  - Key: Environment
    Value: !Ref EnvironmentTag
  - Key: Component
    Value: <component-name>  # e.g., hitl, cedar, grounding, agent
  - Key: ManagedBy
    Value: cloudformation
```
**Validation:** Deploy all stacks. In AWS Cost Explorer, filter by `Project` tag — all resources should appear.  
**Effort:** Medium

---

### REL-MRI-3 — No S3 versioning on UI bucket
**Severity:** MEDIUM  
**Pillar:** Reliability  
**File(s):** `deploy/template.yaml` (UIBucket resource)  
**What's wrong:** Accidental overwrites or bad deployments are unrecoverable — no previous version to roll back to.  
**Fix:**  
Add versioning to the UI bucket:
```yaml
UIBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub '${AWS::StackName}-ui-${AWS::AccountId}'
    VersioningConfiguration:
      Status: Enabled
    LifecycleConfiguration:
      Rules:
        - Id: DeleteOldVersions
          Status: Enabled
          NoncurrentVersionExpiration:
            NoncurrentDays: 30
```
**Validation:** Deploy twice. Check S3 console — previous version visible. Delete current version — previous accessible.  
**Effort:** Low

---

## P2 — Production Hardening

These improve quality but don't block publication or demos.

---

### OPS-MRI-5 — No CloudWatch Dashboard in IaC
**Severity:** MEDIUM  
**Pillar:** Operational Excellence  
**File(s):** Create new: `deploy/monitoring/dashboard-template.yaml`  
**What's wrong:** No single-pane-of-glass for system health. Operators must hunt through individual metrics.  
**Fix:**  
Create a CloudWatch Dashboard template:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  KYCDashboard:
    Type: AWS::CloudWatch::Dashboard
    Properties:
      DashboardName: KYC-Governance-Overview
      DashboardBody: !Sub |
        {
          "widgets": [
            {
              "type": "metric",
              "properties": {
                "title": "Lambda Errors",
                "metrics": [
                  ["AWS/Lambda", "Errors", "FunctionName", "kyc-llm-judge"],
                  ["AWS/Lambda", "Errors", "FunctionName", "kyc-deterministic-check"],
                  ["AWS/Lambda", "Errors", "FunctionName", "kyc-cedar-proxy"],
                  ["AWS/Lambda", "Errors", "FunctionName", "kyc-grounding-proxy"],
                  ["AWS/Lambda", "Errors", "FunctionName", "kyc-hitl-proxy"]
                ],
                "period": 300,
                "stat": "Sum"
              }
            },
            {
              "type": "metric",
              "properties": {
                "title": "API Gateway Latency (p99)",
                "metrics": [
                  ["AWS/ApiGateway", "Latency", "ApiId", "${ConsolidatedApiId}"]
                ],
                "period": 300,
                "stat": "p99"
              }
            }
          ]
        }
```
**Validation:** Deploy template. Open CloudWatch Dashboards — `KYC-Governance-Overview` appears with live metrics.  
**Effort:** Medium

---

### SUS-MRI-1 — CloudWatch Logs have no retention policy
**Severity:** MEDIUM  
**Pillar:** Sustainability  
**File(s):** All Lambda templates (add `AWS::Logs::LogGroup` resources)  
**What's wrong:** Logs grow indefinitely, increasing storage costs and making search slower.  
**Fix:**  
Add explicit log groups with retention in each Lambda template:
```yaml
LLMJudgeLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/lambda/${LLMJudgeFunction}'
    RetentionInDays: 30

# Repeat for each Lambda function
```
**Validation:** Check CloudWatch Logs console — each log group shows "30 days" retention.  
**Effort:** Low

---

### PERF-MRI-1/2 — No code-splitting; large initial bundle
**Severity:** MEDIUM  
**Pillar:** Performance Efficiency  
**File(s):** `vite.config.ts`, all tab components in `src/`  
**What's wrong:** 61 data files and all tab components bundled into a single JS file. Large initial payload delays first paint.  
**Fix:**  
Add route-level code splitting with React.lazy:
```typescript
// src/App.tsx or router file
const GovernanceTab = React.lazy(() => import('./tabs/GovernanceTab'));
const MetricsTab = React.lazy(() => import('./tabs/MetricsTab'));
const CedarTab = React.lazy(() => import('./tabs/CedarTab'));
const HITLTab = React.lazy(() => import('./tabs/HITLTab'));

// Wrap in Suspense:
<Suspense fallback={<TabSkeleton />}>
  <GovernanceTab />
</Suspense>
```
And configure Vite manual chunks:
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'data-governance': ['./src/data/governanceData.ts'],
          'data-metrics': ['./src/data/metricsData.ts'],
        }
      }
    }
  }
});
```
**Validation:** Run `npm run build` — confirm multiple chunk files. Open Network tab — only active tab's chunk loads initially.  
**Effort:** Medium

---

### SEC-MRI-1 — DynamoDB tables have no KMS encryption
**Severity:** MEDIUM  
**Pillar:** Security  
**File(s):** `deploy/own-backend/api-proxy-template.yaml:18-27`, `deploy/hitl/template-cfn.yaml`  
**What's wrong:** Tables use default AWS-owned encryption — cannot audit key usage or set rotation policy.  
**Fix:**  
Add SSE specification to all DynamoDB tables:
```yaml
SessionTable:
  Type: AWS::DynamoDB::Table
  Properties:
    SSESpecification:
      SSEEnabled: true
      SSEType: KMS
    # ... existing properties
```
Note: For the public sample, using AWS-managed key (not CMK) is acceptable. The `SSEEnabled: true` with `SSEType: KMS` uses the AWS-managed `aws/dynamodb` key.  
**Validation:** In DynamoDB console, check each table's "Additional settings" — encryption should show "KMS - AWS managed key".  
**Effort:** Low

---

### REL-MRI-2 — No reserved concurrency on critical Lambdas
**Severity:** MEDIUM  
**Pillar:** Reliability  
**File(s):** All Lambda templates  
**What's wrong:** Critical governance Lambdas share the default 1000 concurrent execution pool. A runaway function could starve others.  
**Fix:**  
Add reserved concurrency to critical functions:
```yaml
LLMJudgeFunction:
  Type: AWS::Serverless::Function
  Properties:
    ReservedConcurrentExecutions: 10

CedarProxyFunction:
  Type: AWS::Serverless::Function
  Properties:
    ReservedConcurrentExecutions: 10

HITLProxyFunction:
  Type: AWS::Serverless::Function
  Properties:
    ReservedConcurrentExecutions: 5
```
**Validation:** Set a very low reserved concurrency (1) temporarily, send 3 concurrent requests — confirm throttling error on excess requests. Then set to production values.  
**Effort:** Low

---

### OPS-MRI-2 — No rollback mechanism
**Severity:** MEDIUM  
**Pillar:** Operational Excellence  
**File(s):** `buildspec.yml`, deployment scripts  
**What's wrong:** Failed deployments have no automated recovery. Manual re-deploy of previous build is the only option.  
**Fix:**  
With S3 versioning enabled (REL-MRI-3), add a rollback script:
```bash
#!/bin/bash
# deploy/rollback.sh
BUCKET=$(aws cloudformation describe-stacks --stack-name kyc-infra --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name kyc-infra --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' --output text)

echo "Restoring previous S3 versions..."
aws s3api list-object-versions --bucket "$BUCKET" --query 'Versions[?IsLatest==`true`].[Key,VersionId]' --output text | while read key vid; do
  aws s3api delete-object --bucket "$BUCKET" --key "$key" --version-id "$vid"
done

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*'
echo "Rollback complete."
```
**Validation:** Deploy a broken version (e.g., empty index.html). Run rollback script. Confirm previous working version is restored.  
**Effort:** Low

---

### OPS-MRI-3 — No manual approval gate between test and prod
**Severity:** MEDIUM  
**Pillar:** Operational Excellence  
**File(s):** `deploy/pipeline/template-cfn.yaml`, `buildspec.yml`  
**What's wrong:** CodeBuild deploys to prod immediately after test passes. No human verification step.  
**Fix:**  
For the public sample, document the two-stage pattern in the README. For the pipeline, add a manual approval action:
```yaml
# In buildspec.yml, split into two buildspecs:
# buildspec-test.yml (runs tests)
# buildspec-prod.yml (deploys to prod)

# In pipeline template, use CodePipeline instead of bare CodeBuild:
# Stage 1: Source (CodeCommit/GitHub)
# Stage 2: Build + Test (CodeBuild with buildspec-test.yml)
# Stage 3: Manual Approval
# Stage 4: Deploy Prod (CodeBuild with buildspec-prod.yml)
```
Since this is a demo, alternatively add a confirmation prompt in the Makefile:
```makefile
deploy-prod: test
	@read -p "Tests passed. Deploy to production? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	$(MAKE) frontend
```
**Validation:** Run deployment pipeline — confirm it pauses for approval before prod deploy.  
**Effort:** Medium

---

### OPS-MRI-4 — 35+ .bat scripts create cognitive overhead
**Severity:** MEDIUM  
**Pillar:** Operational Excellence  
**File(s):** All `.bat` files in `deploy/`  
**What's wrong:** Large number of individual batch scripts makes it unclear what to run and in what order.  
**Fix:**  
This is addressed by OPS-HRI-1 (Makefile creation). Additionally, move all `.bat` files to a `deploy/scripts/legacy/` directory with a README explaining they're superseded by the Makefile:
```
deploy/scripts/legacy/README.md:
"These scripts are superseded by the top-level Makefile. Kept for reference only."
```
**Validation:** `ls deploy/*.bat` returns no results. All deploy operations work via `make` targets.  
**Effort:** Low (bundled with OPS-HRI-1)

---

### COST-MRI-3 — Bedrock costs not tracked per invocation
**Severity:** MEDIUM  
**Pillar:** Cost Optimization  
**File(s):** `deploy/lambdas/llm_judge/lambda_function.py`, `deploy/grounding-proxy/` Lambda  
**What's wrong:** No visibility into per-invocation Bedrock token costs.  
**Fix:**  
Add a CloudWatch custom metric after each Bedrock call:
```python
import boto3
cloudwatch = boto3.client('cloudwatch')

# After Bedrock invocation:
response = bedrock.invoke_model(...)
input_tokens = response['usage']['inputTokens']
output_tokens = response['usage']['outputTokens']

cloudwatch.put_metric_data(
    Namespace='KYC/Governance',
    MetricData=[
        {
            'MetricName': 'BedrockInputTokens',
            'Value': input_tokens,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'Function', 'Value': 'LLMJudge'},
            ]
        },
        {
            'MetricName': 'BedrockOutputTokens',
            'Value': output_tokens,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'Function', 'Value': 'LLMJudge'},
            ]
        }
    ]
)
```
Add `cloudwatch:PutMetricData` permission to the Lambda role.  
**Validation:** Invoke the LLM Judge. Check CloudWatch Metrics → Custom Namespace `KYC/Governance` — token metrics appear.  
**Effort:** Low

---

### AI-MRI-1 — No prompt injection detection
**Severity:** MEDIUM  
**Pillar:** Agentic AI Lens  
**File(s):** `deploy/grounding-proxy/` Lambda, guardrail configuration  
**What's wrong:** No explicit detection for common prompt injection patterns. Relying solely on Bedrock Guardrails' general content filters.  
**Fix:**  
Add a custom word filter to the Bedrock Guardrail configuration for common injection patterns:
```json
{
  "wordPolicyConfig": {
    "managedWordListsConfig": [
      { "type": "PROFANITY" }
    ],
    "wordsConfig": [
      { "text": "ignore previous instructions" },
      { "text": "disregard your instructions" },
      { "text": "you are now" },
      { "text": "system prompt" },
      { "text": "act as if" }
    ]
  }
}
```
Additionally, enable Bedrock's prompt attack detection if available in the guardrail:
```json
{
  "contentPolicyConfig": {
    "filtersConfig": [
      { "type": "PROMPT_ATTACK", "inputStrength": "HIGH" }
    ]
  }
}
```
**Validation:** Send a request containing "ignore previous instructions and..." — confirm it's blocked by the guardrail.  
**Effort:** Low

---

### AI-MRI-2 — Evaluation not gated into deployment pipeline
**Severity:** MEDIUM  
**Pillar:** Agentic AI Lens  
**File(s):** `buildspec.yml`, `evaluations/golden-test-cases.json`  
**What's wrong:** Model evaluation runs ad-hoc, not as a deployment gate. A degraded model could ship without detection.  
**Fix:**  
Add an eval step to `buildspec.yml`:
```yaml
post_build:
  commands:
    - echo "Running golden test case evaluation..."
    - node scripts/run-golden-tests.js
    - |
      if [ $? -ne 0 ]; then
        echo "EVALUATION FAILED - deployment blocked"
        exit 1
      fi
```
Create `scripts/run-golden-tests.js` that:
1. Loads `evaluations/golden-test-cases.json`
2. Invokes the agent for each test case
3. Compares against expected scores (threshold: avg > 0.8)
4. Exits non-zero if any critical test fails  
**Validation:** Modify a golden test case to have unreachable thresholds — confirm build fails.  
**Effort:** Medium

---

### AI-MRI-3 — No escalation SLA for HITL pending reviews
**Severity:** MEDIUM  
**Pillar:** Agentic AI Lens  
**File(s):** `deploy/hitl/template-cfn.yaml`  
**What's wrong:** If a human reviewer doesn't act on a pending review, it waits indefinitely.  
**Fix:**  
Add a Step Functions Wait state with timeout for auto-escalation:
```yaml
# In the Step Functions state machine definition:
WaitForReview:
  Type: Task
  Resource: arn:aws:states:::lambda:invoke.waitForTaskToken
  TimeoutSeconds: 14400  # 4 hours
  Catch:
    - ErrorEquals: ["States.Timeout"]
      Next: AutoEscalate

AutoEscalate:
  Type: Task
  Resource: !GetAtt EscalationFunction.Arn
  Parameters:
    action: escalate_to_tier3
    reason: "Review timeout exceeded 4-hour SLA"
  End: true
```
**Validation:** Submit a HITL review, wait (or mock time) beyond 4 hours — confirm it auto-escalates.  
**Effort:** Medium

---

### COST-MRI-2 — WAF deployed even for minimal-traffic demo
**Severity:** MEDIUM  
**Pillar:** Cost Optimization  
**File(s):** `deploy/security/waf-template.yaml`  
**What's wrong:** WAF has a base monthly cost (~$10/month) regardless of traffic. For a demo environment, this may be unnecessary.  
**Fix:**  
Make WAF deployment conditional:
```yaml
Parameters:
  EnableWAF:
    Type: String
    Default: 'false'
    AllowedValues: ['true', 'false']
    Description: Enable WAF protection (adds monthly cost)

Conditions:
  WAFEnabled: !Equals [!Ref EnableWAF, 'true']

Resources:
  WebACL:
    Type: AWS::WAFv2::WebACL
    Condition: WAFEnabled
    # ... existing configuration
```
Document in README: "For production deployments, set `EnableWAF=true` to enable WAF protection."  
**Validation:** Deploy with `EnableWAF=false` — no WebACL created. Deploy with `EnableWAF=true` — WebACL created and associated.  
**Effort:** Low

---

### REL-MRI-4 — Single-region deployment with no DR documentation
**Severity:** MEDIUM  
**Pillar:** Reliability  
**File(s):** `README.md` (add section)  
**What's wrong:** No documented RTO/RPO or disaster recovery strategy.  
**Fix:**  
Add to README:
```markdown
## Disaster Recovery

This demo deploys to a single AWS region. For production use:

- **RTO:** ~30 minutes (redeploy from IaC)
- **RPO:** Session data: 0 (DynamoDB TTL makes sessions ephemeral)
- **RPO:** Audit data: ~24 hours (daily DynamoDB backup recommended)
- **Strategy:** Backup & Restore (redeploy from source control)

For multi-region active-active, consider DynamoDB Global Tables and CloudFront multi-origin failover.
```
**Validation:** README section exists and accurately describes the recovery posture.  
**Effort:** Low

---

### SUS-MRI-2 — Region not parameterized
**Severity:** MEDIUM  
**Pillar:** Sustainability  
**File(s):** All templates  
**What's wrong:** Region is implicit (deployer's default region) but not documented. For a UK FSI narrative, eu-west-2 would be more appropriate.  
**Fix:**  
Document in README that the sample supports any region with Bedrock access:
```markdown
## Supported Regions
Deploy to any region with Amazon Bedrock Claude model access. 
Recommended: `us-east-1` (broadest model availability) or `eu-west-2` (UK data residency).
```
Ensure no template hardcodes `us-east-1`. Use `!Ref AWS::Region` where region is needed.  
**Validation:** `grep -r "us-east-1" deploy/` returns zero matches (except documentation).  
**Effort:** Low

---

## Kiro Session Sequence

Optimal execution order to minimize context switches and batch related changes.

### Session 1: Security & Compliance Sweep (Files: CFN templates)
**Time estimate:** 1.5 hours

1. **OPS-MRI-1** — Find/replace `548509140218` → `${AWS::AccountId}` across all templates
2. **SEC-MRI-3** — Replace email in `billing-alarm.yaml` with CFN parameter
3. **SEC-HRI-4** — Scope CodeBuild IAM in `pipeline/template-cfn.yaml`
4. **SEC-MRI-2** — Remove `DeleteItem` from HITL audit table policy in `hitl/template-cfn.yaml`
5. **SEC-MRI-1** — Add DynamoDB SSE to all table definitions
6. **COST-MRI-1** — Add consistent tags to ALL resources in ALL templates

*Context: You're already in every CFN template — do all template edits in one pass.*

### Session 2: CORS Fix (Files: Lambda functions)
**Time estimate:** 30 minutes

7. **SEC-HRI-2** — Fix CORS in `llm_judge/lambda_function.py` and `deterministic_check/lambda_function.py`; add `ALLOWED_ORIGIN` env var to Lambda templates

*Context: Touching Python Lambda code + their CFN environment config.*

### Session 3: Reliability & Frontend (Files: TypeScript)
**Time estimate:** 45 minutes

8. **REL-HRI-1 + REL-MRI-1** — Add timeout + exponential backoff to `src/api/client.ts` and `src/api/agentcore.ts`

*Context: Frontend API client code.*

### Session 4: Agent Configuration (Files: runtime-template, guardrails)
**Time estimate:** 30 minutes

9. **AI-HRI-1** — Set policy cascade to enforce in `runtime-template.yaml`
10. **AI-MRI-1** — Add prompt injection patterns to guardrail config

*Context: Agent runtime and guardrail configuration.*

### Session 5: Infrastructure Additions (Files: new CFN templates)
**Time estimate:** 1.5 hours

11. **REL-HRI-2** — Add DLQ to `api-proxy-template.yaml`
12. **OPS-HRI-2** — Add SNS topic + alarm actions to `proxy-alarms/template-cfn.yaml`
13. **REL-MRI-2** — Add reserved concurrency to all Lambda templates
14. **REL-MRI-3** — Add S3 versioning to `template.yaml`
15. **SUS-MRI-1** — Add log group retention to all Lambda templates
16. **COST-MRI-2** — Make WAF conditional

*Context: CFN infrastructure additions — all new resources.*

### Session 6: Operational Tooling (Files: scripts, pipeline)
**Time estimate:** 1 hour

17. **OPS-HRI-1 + OPS-MRI-4** — Create `Makefile` with ordered deploy targets; archive `.bat` files
18. **SEC-MRI-4** — Add `npm audit` to `buildspec.yml`
19. **OPS-MRI-2** — Create `deploy/rollback.sh`
20. **OPS-MRI-3** — Add approval gate documentation

*Context: Build/deploy tooling.*

### Session 7: Documentation & Cleanup (Files: root directory)
**Time estimate:** 1 hour

21. **CROSS-1** — Delete dead files, update `.gitignore`
22. **CROSS-2** — Write comprehensive `README.md`
23. **REL-MRI-4** — Add DR section to README
24. **SUS-MRI-2** — Add region guidance to README
25. **COST-MRI-3** — Add token tracking metrics to Lambda functions

*Context: Documentation and repo cleanup.*

### Session 8: Advanced (Optional, can defer)
**Time estimate:** 2 hours

26. **PERF-MRI-1/2** — Code-split React app
27. **AI-MRI-2** — Create golden test evaluation script
28. **AI-MRI-3** — Add HITL escalation timeout
29. **OPS-MRI-5** — Create CloudWatch Dashboard template

*Context: Larger feature additions that can be deferred post-publication.*

---

## Completion Checklist

```
[ ] Session 1: Security & Compliance Sweep
[ ] Session 2: CORS Fix
[ ] Session 3: Reliability & Frontend
[ ] Session 4: Agent Configuration
[ ] Session 5: Infrastructure Additions
[ ] Session 6: Operational Tooling
[ ] Session 7: Documentation & Cleanup
[ ] Session 8: Advanced (Optional)
[ ] Final: Run full E2E test suite (Playwright)
[ ] Final: grep for account IDs, emails, API keys
[ ] Final: Verify CORS headers in browser
[ ] Final: Test Cedar enforcement mode with deny scenario
[ ] Final: Confirm all alarms fire notifications
```

---

*Generated from Full Well-Architected Review | 2026-07-16*
