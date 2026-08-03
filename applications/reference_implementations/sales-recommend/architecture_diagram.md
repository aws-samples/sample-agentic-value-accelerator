# Architecture — AWS Solutions Advisor (Sales Recommend)

> This document is a structured, machine-readable description of the system
> architecture, intended as input for a GenAI agent that produces a diagram
> (e.g. Mermaid, draw.io, Graphviz). It enumerates the **components (nodes)**,
> the **connections (edges)** between them, and the logical **groupings
> (subgraphs)**. There are two distinct flows — a runtime **Query Flow** and a
> **Data Production Flow** — that share the same Knowledge Base.

---

## 1. System summary

A conversational agent helps business leaders find the right pre-built AWS
solution from a curated catalog. The catalog is a Bedrock Knowledge Base backed
by OpenSearch Serverless. The catalog content is produced automatically: a list
of repository URLs drives a fan-out of CodeBuild jobs, each of which uses an LLM
to generate a repository "capability/vetting profile" and ingests it into the
Knowledge Base.

Two flows:
- **Query Flow** (user-facing, synchronous): user → CloudFront → ALB → ECS
  (Next.js) → AgentCore agent → Bedrock Claude + Knowledge Base retrieval.
- **Data Production Flow** (build-time / event-driven, asynchronous): repo list
  in S3 → Lambda fan-out → CodeBuild per repo → LLM profile → S3 → Knowledge
  Base ingestion → OpenSearch Serverless vectors.

---

## 2. Components (nodes)

Each node has an `id` (stable identifier for edges), a `label`, a `type`
(hint for the icon/shape), and the `group` it belongs to.

| id | label | type | group |
|----|-------|------|-------|
| user | End User (business leader) | actor | external |
| cloudfront | CloudFront Distribution | aws-cloudfront | edge |
| cf_auth | CloudFront Function (Basic Auth) | aws-cloudfront-function | edge |
| ssm | SSM Parameter Store (auth creds) | aws-ssm | edge |
| alb | Application Load Balancer | aws-elb | networking |
| vpc | VPC (public + private subnets) | aws-vpc | networking |
| ecs | ECS Fargate Service — Next.js UI | aws-ecs-fargate | compute |
| ecr_ui | ECR Repository (UI image) | aws-ecr | compute |
| agentcore | Bedrock AgentCore Runtime (Strands agent) | aws-bedrock-agentcore | agent |
| agentcore_ep | AgentCore Runtime Endpoint | aws-bedrock-agentcore | agent |
| claude | Amazon Bedrock — Claude Sonnet (model) | aws-bedrock | agent |
| kb | Bedrock Knowledge Base | aws-bedrock-kb | knowledge-base |
| titan | Bedrock Titan Text Embeddings V2 | aws-bedrock | knowledge-base |
| aoss | OpenSearch Serverless Collection (vector index) | aws-opensearch-serverless | knowledge-base |
| kb_bucket | S3 — KB Data Source (repo profiles + metadata) | aws-s3 | knowledge-base |
| kb_ds | KB S3 Data Source (chunking = NONE) | aws-bedrock-kb-datasource | knowledge-base |
| src_bucket | S3 — Wiki Source Bucket (code zip + config/repos.txt) | aws-s3 | data-production |
| repos_file | config/repos.txt (repo URL list) | file | data-production |
| scheduler | EventBridge Scheduler (fires ~15m after list changes) | aws-eventbridge-scheduler | data-production |
| dispatch_lambda | Dispatch Lambda (fan-out) | aws-lambda | data-production |
| codebuild | CodeBuild — Wiki Generator (Strands agent) | aws-codebuild | data-production |
| git_repos | External Git Repositories (GitHub) | external-service | external |
| cw_logs | CloudWatch Logs | aws-cloudwatch | observability |
| iam | IAM Roles (agentcore / ecs / kb / codebuild / lambda) | aws-iam | security |

---

## 3. Groupings (subgraphs)

- **external**: `user`, `git_repos`
- **edge**: `cloudfront`, `cf_auth`, `ssm`
- **networking**: `vpc`, `alb`
- **compute**: `ecs`, `ecr_ui`
- **agent**: `agentcore`, `agentcore_ep`, `claude`
- **knowledge-base**: `kb`, `titan`, `aoss`, `kb_bucket`, `kb_ds`
- **data-production**: `src_bucket`, `repos_file`, `scheduler`, `dispatch_lambda`, `codebuild`
- **observability**: `cw_logs`
- **security**: `iam`

`ecs`, `alb` live inside the `vpc`. `edge`, `agent`, `knowledge-base`,
`data-production` are AWS-managed/serverless and sit outside the VPC.

---

## 4. Connections (edges)

### 4a. Query Flow (synchronous, solid lines)

| from | to | label |
|------|----|-------|
| user | cloudfront | HTTPS request |
| cf_auth | cloudfront | attached; enforces Basic Auth |
| ssm | cf_auth | auth credentials (deploy-time) |
| cloudfront | alb | forwards (with shared origin secret header) |
| alb | ecs | routes to Next.js container |
| ecr_ui | ecs | container image |
| ecs | agentcore_ep | invoke agent (AGENT_RUNTIME_ARN) |
| agentcore_ep | agentcore | routes to runtime |
| agentcore | claude | generate response |
| agentcore | kb | bedrock:Retrieve (KNOWLEDGE_BASE_ID) |
| kb | aoss | vector similarity search |

### 4b. Data Production Flow (asynchronous, dashed lines)

| from | to | label |
|------|----|-------|
| repos_file | src_bucket | uploaded by Terraform (config/repos.txt) |
| scheduler | dispatch_lambda | invoke, ~15m after the list changes (cloud-side delay) |
| src_bucket | dispatch_lambda | ObjectCreated on manual/ prefix only (ad-hoc, dotted) |
| dispatch_lambda | codebuild | StartBuild — one build per repo URL |
| src_bucket | codebuild | pulls wiki-agent.zip (build source) |
| git_repos | codebuild | shallow clone of the repo |
| codebuild | claude | synthesize vetting/capability profile |
| codebuild | kb_bucket | write `<host>/<owner>/<repo>.md` + `.metadata.json` |
| codebuild | kb | StartIngestionJob |
| kb | kb_ds | reads data source (chunking = NONE) |
| kb_ds | kb_bucket | source objects |
| kb | titan | embed each profile (1 file = 1 vector) |
| kb | aoss | write vectors to index |

### 4c. Cross-cutting (dotted lines)

| from | to | label |
|------|----|-------|
| agentcore | cw_logs | logs |
| codebuild | cw_logs | build logs |
| dispatch_lambda | cw_logs | logs |
| ecs | cw_logs | logs |
| iam | agentcore | execution role |
| iam | ecs | task + execution roles |
| iam | kb | KB service role |
| iam | codebuild | build role |
| iam | dispatch_lambda | lambda role |

---

## 5. Notes for the diagram agent

- Render the two flows visually distinct: **Query Flow** with solid arrows,
  **Data Production Flow** with dashed arrows, cross-cutting (IAM/logs) with
  dotted or faded arrows so they don't dominate.
- The **Knowledge Base group is the shared hub** — it is the target of the Data
  Production Flow (ingest) and a dependency of the Query Flow (retrieve). Place
  it centrally.
- Emphasize the key design decision: **one repo profile = one file = one vector**
  (data source chunking = NONE), which keeps recommendations from mixing
  functionality across repos. A small annotation near `kb_ds`/`aoss` is useful.
- Show `iam` and `cw_logs` as small side/cross-cutting nodes, not inline in the
  main paths.
- Left-to-right layout works well: `user` on the far left, Knowledge Base in the
  center, `git_repos` / `data-production` feeding in from the bottom or right.

---

## 6. Reference Mermaid (starting point — the agent may refine)

```mermaid
flowchart LR
  user([End User])

  subgraph edge[Edge / Auth]
    cloudfront[CloudFront + Basic Auth Fn]
    ssm[(SSM: auth creds)]
  end

  subgraph vpc[VPC]
    alb[Application Load Balancer]
    ecs[ECS Fargate - Next.js UI]
  end
  ecr_ui[(ECR: UI image)]

  subgraph agent[Agent]
    agentcore[AgentCore Runtime - Strands]
    claude[Bedrock Claude Sonnet]
  end

  subgraph kbgrp[Knowledge Base]
    kb[Bedrock Knowledge Base]
    titan[Titan Embeddings V2]
    aoss[(OpenSearch Serverless - vectors)]
    kb_bucket[(S3: repo profiles)]
  end

  subgraph dataprod[Data Production]
    src_bucket[(S3: code zip + repos.txt)]
    scheduler[EventBridge Scheduler]
    dispatch[Dispatch Lambda]
    codebuild[CodeBuild - Wiki Agent]
  end
  git[(External Git Repos)]

  %% Query flow (solid)
  user -->|HTTPS| cloudfront
  ssm -.deploy-time.-> cloudfront
  cloudfront -->|origin secret| alb
  alb --> ecs
  ecr_ui --> ecs
  ecs -->|invoke| agentcore
  agentcore -->|generate| claude
  agentcore -->|Retrieve| kb
  kb --> aoss

  %% Data production flow (dashed)
  scheduler -. invoke after ~15m .-> dispatch
  src_bucket -. ObjectCreated manual/ .-> dispatch
  dispatch -. StartBuild per URL .-> codebuild
  src_bucket -. build source .-> codebuild
  git -. clone .-> codebuild
  codebuild -. synthesize .-> claude
  codebuild -. write .md + metadata .-> kb_bucket
  codebuild -. StartIngestionJob .-> kb
  kb -. read .-> kb_bucket
  kb -. embed .-> titan
  kb -. write vectors .-> aoss
```
