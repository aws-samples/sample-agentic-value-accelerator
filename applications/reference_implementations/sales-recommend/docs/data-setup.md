# Data Setup — Knowledge Base

The AWS Solutions Advisor agent recommends from a **Bedrock Knowledge Base**.
Both the Knowledge Base and its content are now **managed by this stack** — you
no longer create a KB by hand or pass in a KB ID.

## What Terraform creates

The `knowledge-base` module provisions, on `terraform apply`:

- A **Bedrock Knowledge Base** using `amazon.titan-embed-text-v2:0` embeddings
- An **Amazon OpenSearch Serverless** collection (`VECTORSEARCH`) + vector index
  as the vector store, with encryption/network/data-access policies
- An **S3 data source** bucket (random name) with **chunking = NONE**, so each
  ingested file becomes exactly one vector

The KB ID is wired automatically into the agent runtime (`KNOWLEDGE_BASE_ID`
env var) and the IAM `bedrock:Retrieve` permission — no manual copy step.

## How the catalog is populated (automated)

Content is produced by the **wiki generator** data-production pipeline. You do
not upload catalog documents by hand; you provide a **list of repository URLs**
and the pipeline generates one profile per repo.

```
infrastructure/repos.txt  ──(terraform apply uploads to S3 config/repos.txt)──▶
  EventBridge Scheduler (fires ~15 min after the list changes, held on the cloud)
    └─ Dispatch Lambda ─▶ CodeBuild (one build per URL)
       └─ clone repo ─▶ Claude synthesis (wiki-agent/vetting_prompt.md)
          └─ write repos/<host>/<owner>/<repo>.md + .metadata.json to KB bucket
             └─ StartIngestionJob ─▶ KB embeds ─▶ OpenSearch Serverless vectors
```

The initial trigger is a **cloud-side delayed timer**, not the S3 upload event:
Terraform uploads `config/repos.txt` and creates an EventBridge Scheduler
schedule that fires the dispatch Lambda `trigger_delay_minutes` (default 15)
later. This keeps the deploy fast (no waiting) and avoids the S3
notification-propagation race. The schedule only re-arms when the list content
actually changes, so unrelated deploys don't rebuild the catalog.

### Adding / changing repositories

1. Edit `infrastructure/repos.txt` — one repository URL per line
   (blank lines and `#` comments ignored).
2. Deploy (AVA deploy click, or `infrastructure/scripts/deploy-local.sh`).
   Terraform re-uploads the list and re-arms the scheduler; ~15 min later the
   fan-out reprocesses the list (each profile is overwritten in place).

No manual S3 copy is required. The ordering is race-free because the scheduler
fires well after every resource (Lambda, CodeBuild, KB, code zip) exists.

### Triggering immediately (optional)

If you don't want to wait for the timer:

- Drop a repo-list file under the `manual/` prefix of the source bucket —
  `aws s3 cp mylist.txt s3://<wiki-src-bucket>/manual/mylist.txt` — the S3
  notification fans it out at once; or
- Invoke the dispatch Lambda directly (it reads the managed `config/repos.txt`):
  `aws lambda invoke --function-name <project>-wiki-dispatch /dev/stdout`

### One-off single repo (optional, dev convenience)

`infrastructure/scripts/generate-wiki.sh <REPO_URL> [branch]` packages the agent
and starts a single build for one URL without editing `repos.txt`.

## What a generated profile contains

Each profile is a structured vetting/capability report (see
`wiki-agent/vetting_prompt.md`) answering the questions a technical/business
decision-maker asks before adopting external code: architecture & AWS services,
dependencies & runtime, security, licensing, cost, testing, deployment,
scalability/resilience, integration, documentation, and lifecycle. It is a
factual description (not an adopt/reject verdict) so the downstream agent can
match it to a user need and recommend a repository.

The profile is embedded as a single vector (chunking = NONE), so a query
retrieves whole repos and recommendations do not mix functionality across
repositories.

## Monitoring ingestion

Right after deploy, the KB exists but the CodeBuild jobs run asynchronously.
Track them with:

```bash
cd infrastructure
aws codebuild list-builds-for-project \
  --project-name "$(terraform output -raw wiki_generator_project)" \
  --region us-east-1
```

Until the builds finish and ingestion completes, the agent's `retrieve` returns
no matches.
