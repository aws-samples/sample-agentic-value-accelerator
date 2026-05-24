# Compliance Automation — Reference Implementation

End-to-end regulatory compliance automation using Bedrock AgentCore with a Next.js dashboard UI. Two AI agents work together to ensure financial institutions never miss a filing deadline and always submit high-quality regulatory reports.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                          │
│  ┌──────────────────────┐    ┌────────────────────────────┐    │
│  │  Deadline Dashboard   │    │   Report Review Upload      │    │
│  │  (urgency cards,      │    │   (file upload, scores,     │    │
│  │   escalation table)   │    │    revision suggestions)    │    │
│  └──────────┬───────────┘    └──────────────┬─────────────┘    │
│             │ /api/deadlines                  │ /api/review      │
└─────────────┼────────────────────────────────┼──────────────────┘
              │ OAuth (client_credentials)      │ S3 + OAuth
              ▼                                 ▼
┌─────────────────────────┐    ┌─────────────────────────────────┐
│  AgentCore Runtime      │    │  AgentCore Runtime               │
│  Deadline Monitor Agent │    │  Report Reviewer Agent           │
│  (Strands + Nova Pro)   │    │  (Strands + Nova Pro)            │
│                         │    │                                   │
│  Tools:                 │    │  Tools:                           │
│  • get_filing_calendar  │    │  • read_s3_file                  │
│  • get_current_date     │    │                                   │
└─────────────────────────┘    └─────────────────────────────────┘
```

## Agents

### Compliance Deadline Monitor
Tracks regulatory filing deadlines and classifies urgency:
- **OVERDUE** — past due, immediate escalation to CCO
- **CRITICAL** (≤3 days) — escalate to BSA Officer
- **WARNING** (≤7 days) — escalate to team lead
- **ON_TRACK** (>7 days) — no action needed

Supports: SAR, CTR, SEC 10-K/10-Q, Call Reports, FR Y-9C

### Regulatory Report Reviewer
Multi-dimensional review of uploaded regulatory filings:
- **Completeness** — required sections and fields present
- **Language Compliance** — regulatory terminology, no informal language
- **Quality** — clarity, consistency, submission readiness

Returns structured scores (0-100) with specific revision suggestions.

## Project Structure

```
compliance-automation/
├── frontend/                    # Next.js 16 + React 19 + Tailwind 4
│   ├── app/
│   │   ├── page.tsx            # Deadline dashboard
│   │   ├── review/page.tsx     # Report review with file upload
│   │   ├── api/deadlines/      # Proxy to deadline monitor agent
│   │   └── api/review/         # Upload to S3 + invoke reviewer agent
│   └── package.json
├── agent-backend/               # AgentCore agents (Python)
│   ├── deadline_monitor_agent.py
│   ├── report_reviewer_agent.py
│   ├── Dockerfile.deadline
│   ├── Dockerfile.reviewer
│   ├── requirements.txt
│   ├── template-deadline.yaml   # SAM template (Cognito, EventBridge, DLQ)
│   ├── template-reviewer.yaml   # SAM template (S3, Cognito, DLQ)
│   └── sample_sar.txt          # Test file
├── deploy.sh
└── README.md
```

## Prerequisites

- AWS CLI v2 (≥2.27), SAM CLI, Docker
- Bedrock AgentCore–enabled AWS account
- Bedrock model access (Amazon Nova Pro)
- Node.js 20+

## Quick Start

### 1. Deploy agents

```bash
# Deploy deadline monitor
cd agent-backend
sam build --template-file template-deadline.yaml
sam deploy --template-file template-deadline.yaml \
  --stack-name compliance-deadline-monitor \
  --resolve-s3 --capabilities CAPABILITY_IAM

# Deploy report reviewer
sam build --template-file template-reviewer.yaml
sam deploy --template-file template-reviewer.yaml \
  --stack-name reg-report-reviewer \
  --resolve-s3 --capabilities CAPABILITY_IAM
```

### 2. Configure frontend environment

Create `frontend/.env.local`:
```env
# Deadline Monitor Agent
DEADLINE_AGENT_ENDPOINT=https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<encoded-arn>/invocations
DEADLINE_TOKEN_ENDPOINT=https://<stack>-<account>.auth.<region>.amazoncognito.com/oauth2/token
DEADLINE_CLIENT_ID=<from SAM outputs>
DEADLINE_CLIENT_SECRET=<from Cognito>
DEADLINE_SCOPE=compliance_deadline_monitor_agent/invoke

# Report Reviewer Agent
REVIEWER_AGENT_ENDPOINT=https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<encoded-arn>/invocations
REVIEWER_TOKEN_ENDPOINT=https://<stack>-<account>.auth.<region>.amazoncognito.com/oauth2/token
REVIEWER_CLIENT_ID=<from SAM outputs>
REVIEWER_CLIENT_SECRET=<from Cognito>
REVIEWER_SCOPE=regulatory_report_reviewer_agent/invoke
REVIEWER_S3_BUCKET=reg-report-reviewer-uploads-<account>
AWS_REGION=us-east-1
```

### 3. Run frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Testing

**Deadline Monitor**: Click "Run Deadline Check" on the dashboard.

**Report Reviewer**: Upload the included `agent-backend/sample_sar.txt` or any regulatory filing draft.

## Cleanup

```bash
# Delete SAM stacks
sam delete --stack-name compliance-deadline-monitor --region us-east-1
sam delete --stack-name reg-report-reviewer --region us-east-1

# Delete ECR repos
aws ecr delete-repository --repository-name compliance-deadline-monitor-agent --force
aws ecr delete-repository --repository-name reg-report-reviewer-agent --force
```
