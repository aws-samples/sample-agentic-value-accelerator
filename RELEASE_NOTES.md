# Release Notes

## v5.0 — Govern goes AWS-native and multi-cloud; Marketplace, Evaluation, and enterprise-grade hardening

Release date: September 2026

Feature release building on v4.0. Rebuilds **Govern** on top of ~40 AWS-native governance modules (Audit Manager, CloudTrail Lake, Trusted Advisor, Service Quotas, Compute Optimizer, Security Lake, Macie, GuardDuty AI, Verified Permissions, IAM Access Analyzer, X-Ray, and more), adds a first-class **Marketplace** under Build with matching admin surface under Govern, adds an **Evaluation** surface to Operate, extends Govern into **Multi-Cloud** (Azure, GCP, ServiceNow, Salesforce, Copilot Studio), ships a new FSI Foundry use case (**Govern Compliance Agent**, R07 — 35th POC) and a new reference implementation (**KYC Governance Insights**), and hardens the Control Plane for production (SSRF defense, response sanitization, WAF Bot Control at the edge, self-service signup with corporate-email policy, login-history audit, ~35 new backend tests).

### 🏛️ Govern — AWS-native and multi-cloud

- **~40 AWS-native governance modules** — new backend routes/services/models that read a customer's own AWS estate live: Audit Manager, Compliance Evidence, Policy Drift, Posture Score, Command Center, CloudTrail Lake, X-Ray, Trusted Advisor, Service Quotas, Compute Optimizer, Security Lake, Macie, GuardDuty AI, Verified Permissions, IAM Access Analyzer, Resource Tags, Bedrock Assets, Knowledge Bases, Regions, Capacity, Marketplace, Operations, Health, LLM Quality, Harness Audit, Harness Policy, Path Jail, Invocations, AIDLC, Governance, Validation. Every payload passes through `core/security_utils.py` before serialization so account ids, ARNs, IPv4s, CVEs, and STS session suffixes are masked. — _Bikash Behera_
- **Compliance Center — 11 → 14 frameworks, 281 controls** — adds CRI FS AI RMF and FINOS AIR alongside the existing SR 26-2, NIST AI RMF, EU AI Act, ISO 42001, NYDFS Part 500, and SOC 2. Compliance-evidence route surfaces per-control evidence from Audit Manager. — _Bikash Behera_
- **Model Management adds differential-privacy signals** — DP-SGD, PATE, and federated-DP tracked in the Model SBOM. — _Bikash Behera_
- **Marketplace Admin, Operations, Reports & Assessments** — three new Govern surfaces. Marketplace Admin publishes/manages listings that consumers browse in Build → Marketplace. Operations landing gives runbooks, on-call, SLA, and alerts. Reports & Assessments runs a governance self-assessment and exports evidence bundles. — _Bikash Behera_
- **Multi-Cloud Governance** — governance connectors across **Azure** (Cost Management + AI Foundry), **GCP** (BigQuery Billing + Vertex AI), **ServiceNow** (Now Assist), **Salesforce** (Einstein / Agentforce), and **Copilot Studio**. Credentials in Secrets Manager; Test Connection UX measures round-trip latency; per-connector paging honors the target's native page tokens. — _Bikash Behera_
- **AI Estate Inventory, Fleet Identity, Agent Topology Map, Agent Lifecycle Policies, Agent Onboarding Workflow, Harness Audit Viewer, Policy Drift Dashboard, Path Jail Editor, AgentCore Observability, Investigation Queue, Candidate Incidents, Live CloudTrail Lake Activity** — new frontend components sitting on the AWS-native backend. — _Bikash Behera_

### 🛒 Marketplace — internal AI-resource marketplace

- **Build → Marketplace** — governed catalog of agents, MCP servers, knowledge bases, skills, and models. Subscription requests, multi-step approval chains, budgets, attestations, entitlement checks, and full audit log. Wired into the Approval Policy Engine, so requests land in the same Operate → Approval Queue as v4.0 registrations. — _Bikash Behera_

### 📊 Operate — Evaluation surface

- **Evaluation** — LLM-as-judge suites with promotion gates, pairwise A/B compare, calibration, and background auto-enrollment that scaffolds a draft suite for every new deployment. Suite detail, run detail, run compare, and a Playground are exposed as first-class routes under `/evaluation/*`. Backed by `evaluation_runner`, `evaluation_pairwise`, `evaluation_calibration`, `evaluation_enrollment`, `evaluation_report` services and a new `evaluations` route + model. — _Bikash Behera_

### 🔐 Secure & Platform hardening

- **SSRF defense (`safe_fetch`)** — every URL the platform fetches on a caller's behalf (OIDC discovery, A2A agent cards, SaaS connector endpoints) resolves the host, refuses non-public addresses, pins the connection to the validated address to defeat DNS rebinding, and drops credentials across cross-host redirects. Genuinely private issuers opt in via `SAFE_FETCH_ALLOWED_PRIVATE_CIDRS`; no value can expose the instance metadata endpoint. — _Bikash Behera_
- **Sanitized error responses** — deployment and agent APIs return a fixed summary plus an `error_ref` instead of raw boto3/botocore exception text (which copies the service's own message verbatim, leaking account ids, task role ARNs, and resource ARNs). Full traceback stays in backend logs, indexed by `error_ref`. — _Bikash Behera_
- **Response sanitization invariant** — `core/security_utils.py` is the single point that strips account identifiers before serialization; 27 backend modules import from it. 12-digit account ids become `************`, full ARNs collapse to their resource tail, and CVE ids, IPv4s, S3 bucket URIs, caller identities, and STS session suffixes are redacted from free text. — _Bikash Behera_
- **Path jail** — file-path allowlist matcher for tools that touch the file system; enforced by `core/path_jail.py` and editable from the Govern → Path Jail Editor. — _Bikash Behera_
- **Output caps, cache pre-warm, AWS paging, CloudTrail paging, multi-region scope** — new `core/` helpers underpinning the AWS-native governance surfaces so responses are bounded, warm, paged correctly, and region-aware. A `region_config.log_resolution()` runs first at backend startup and prints the resolved region tiers under `AUTH-GATE` — the one governance misconfiguration that never raises (AWS answers the wrong region with that region's inventory, so the symptom is a zero-agent estate instead of an error). — _Bikash Behera_
- **Auth-gate log line** — startup prints the resolved authentication mode under `AUTH-GATE`; the development bypass is now gated so it can only ever activate when `ENVIRONMENT` is `development`, `dev`, `local`, or `test`. Confirm the line says *refusing* before exposing an endpoint. — _Bikash Behera_

### 🔒 Sign-in, signup, and edge protection

- **Self-service signup with corporate-email policy** — sign-in page adds a "Create account" flow. A Cognito **PreSignUp Lambda** rejects public-mail providers (~40 domains — Gmail, Yahoo, Hotmail, Outlook, iCloud, ProtonMail, GMX, Yandex, QQ/163/Sina, Naver, Zoho, FastMail, DuckDuckGo, Comcast/Verizon, Hey, Tutanota, …); a **PostConfirmation Lambda** places new users in the `viewer` group so admins promote deliberately. Cognito Advanced Security = **ENFORCED**. — _Bikash Behera_
- **WAF Bot Control at the edge** — AWS WAFv2 (CLOUDFRONT scope, us-east-1) with `AWSManagedRulesBotControlRuleSet` (COMMON tier) plus `AWSManagedRulesCommonRuleSet` attached to the frontend CloudFront distribution — challenges suspicious traffic before it reaches the SPA. New `modules/waf/` Terraform module. — _Bikash Behera_
- **Login-history audit** — every successful sign-in is written to a dedicated `ava-cp-<id>-login-events` DynamoDB table by a Cognito **PostAuthentication Lambda**. PITR + SSE on, GSI `by_date` for per-day reports. Query with `aws dynamodb query` or the DynamoDB console — no UI yet. — _Bikash Behera_

### 📦 New applications

- **FSI Foundry R07 — Govern Compliance Agent** (35th POC) — multi-agent compliance-evidence workflow that continuously assesses posture against SR 26-2, NIST AI RMF, EU AI Act, ISO 42001, CRI FS AI RMF, and FINOS AIR, and drafts remediation with Human Oversight gates.
- **KYC Governance Insights** — 9th reference implementation. Governed KYC workflow that surfaces access, cost, and compliance insights against the KYC agent estate.

### 🧪 Testing

- **~35 new backend tests** under `platform/control_plane/backend/tests/`: paging (AWS + CloudTrail), path jail, safe fetch, deployment error disclosure, RBAC/JWKS, region resolution, multicloud URL validation + GCP location, evaluation engine, guardrail reconcile paging, incident-response denominator, LLM quality dashboard absence, model pricing, Cognito group names, auth gate, gateway no-redirect, govern controls CloudTrail, path-jail matcher, and more. — _Bikash Behera_

### 🧭 Frontend

- **Global `ErrorBoundary`** keyed on route pathname so a component crash is contained rather than blanking the app. — _Bikash Behera_
- **UseCasesHub** replaces the standalone `Prioritization` page at `/use-cases`. Prioritization is one tab; Business Cases, Maturity, Operating Model, and Organization Design join it under a single hub with a shared `ExportReportButton` that renders PDFs from the new `src/lib/pdf/` toolkit. — _Bikash Behera_
- **Transformation Value Model** — new Plan surface + backend route/service/model + `data/transformation_value_model/` seed catalog imported on first boot (gated by a persisted `seed_applied` latch so `catalog_meta` state is preserved after users prune the seed rows). — _Bikash Behera_

### 🧰 Reference implementations

- **Sales-Recommend** — adds a leads-capture flow (`EmailCaptureModal`, `UserProvider`, `VisitorsView`, `leadsStore`, `/api/lead[s]` routes, IAM + ECS + Knowledge Base infra updates), retained under Build → Reference Implementations. — _Bikash Behera_

### 📖 Documentation

- **`SECURITY.md`** — expands the "When deploying this solution" checklist with sections on Cognito JWT auth-gate, SSRF via `safe_fetch`, sanitized error responses with `error_ref`, and the response-sanitization invariant. Adds a **"Hardening required before production"** table covering interactive API docs, missing security response headers, JWT-in-`localStorage`, wildcard CORS in the bundled API Gateway module, and DynamoDB point-in-time recovery / deletion protection defaults.
- **README** refreshed for v5.0: 34 → 35 FSI POCs, 8 → 9 reference apps, adds Marketplace, Evaluation, Multi-Cloud Governance, Self-Service Signup, Bot Protection at the Edge, Login-History Audit, and DP-SGD in the Model SBOM. Compliance framework count 11 → 14 (281 controls).
- **`platform/docs/architecture/ai-safety-module-design.md`** and **`platform/docs/architecture/govern-metrics-integration.md`** — new architecture docs describing the AWS-native governance data flow and the safety module.
- **`platform/control_plane/README.md`** and **`platform/control_plane/docs/`** — new Control Plane developer docs (previously spread across module READMEs).

### Upgrade notes

- **New Cognito Lambdas.** The first `terraform apply` on v5.0 creates the PreSignUp, PostConfirmation, and PostAuthentication Lambdas + the `ava-cp-<id>-login-events` DynamoDB table + the WAF Web ACL. If you fork the domain denylist to your own tenancy rules, edit `modules/cognito/lambda_src/pre_signup_domain_check/` — the list is server-side by design so it cannot be bypassed by hitting Cognito with curl.
- **WAF Bot Control is on by default on the frontend CloudFront distribution.** Turn it off via the `enable_waf_bot_control` variable in the frontend module if you know you don't need it — costs are non-zero and the COMMON rule set may challenge some automation.
- **Transformation reference catalog seeds on first boot only.** A persisted `seed_applied` latch (in `catalog_meta`) keeps re-seeding from silently reversing user edits after a restart. Re-seed explicitly via the lifecycle API.
- **SSRF check applies to OIDC discovery and A2A agent cards.** If you were federating with an OIDC issuer inside a private range, add its CIDR to `SAFE_FETCH_ALLOWED_PRIVATE_CIDRS` before the first upgraded boot; otherwise discovery will fail with a `safe_fetch` refusal.
- **`AUTH-GATE` startup log line.** Watch for `AUTH-GATE refusing dev bypass` on first boot in production environments. If it says `AUTH-GATE serving dev admin` outside a development environment, set `ENVIRONMENT` to your real environment name and restart before exposing any endpoint.
- **Response sanitization is a route invariant, not a cleanup pass.** New Govern routes must import from `core/security_utils.py` and mask at the point of serialization. See any of the 27 existing importers for the pattern.
- **Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are unconditional.** Either set the corresponding FastAPI URLs to `None` outside development or keep the API off the public internet. See `SECURITY.md` → Hardening required before production.

### Contributors to v5.0

- **Bikash Behera** — Path Jail, safe_fetch, response sanitization invariant, self-service signup + PreSignUp/PostConfirmation/PostAuthentication Lambdas, WAF Bot Control, Login-History audit, test suite, README + SECURITY refresh
- **Gregg Sorrels** Govern AWS-native modules, Multi-Cloud Governance connectors, Marketplace, Govern Compliance Agent foundry POC
- **Donatas Kuchalskis** Evaluation
- **Raphael Fuchs & Roshan Rao** KYC Governance Insights reference app
- **Chris Taylor** UseCasesHub, Transformation Value Model
---

## v4.0 — Build pillar completes: Harness, Memory, Registry, Catalog, Approvals; Secure adds Identity + Policy; Operate becomes a full surface

Release date: August 2026

Feature release building on v3.1. Completes the **Build** pillar (Harness, Memory, Registry with five typed record kinds, Catalog), adds two new **Secure** surfaces (Identity federation, Approval Policies), turns **Operate** into a five-tile surface with a dedicated Approval Queue, adds one new reference implementation (Investment Research and Risk Accelerator), and hardens the field-demo reference apps with AVA SSO edge auth.

### 🧱 Build — the pillar is now complete

- **Harness** — managed Bedrock AgentCore Harness scaffold. Pick a model, paste a system prompt, attach tools, hit **Test**, and stream the response in the Control Plane. Live SSE console per session; deployed harnesses can publish to Registry → Agents. Backed by a new `harness_execution_role` Terraform module. — _Bikash Behera_
- **Memory** — AgentCore Memory namespaces with configurable extraction strategies (semantic, episodic, summary). Attach a namespace to any agent at deploy time; agent reads/writes across turns without you managing the store. — _Bikash Behera_
- **Registry** — five typed record kinds on AWS Agent Registry under the **AVA** namespace: Agents, MCP Servers, A2A Servers, Skills, and Custom Resources, each with a curated catalog on its subpage. A shared boto3 client handles the async CREATING → DRAFT → PENDING_APPROVAL → APPROVED lifecycle. — _Bikash Behera_
- **Auto-publish on successful deploy** — additive `deployment_success_hook` Terraform module: an EventBridge rule on the deployment Step Function's `SUCCEEDED` events fires a Lambda that publishes the deployment as an `AGENT` record (idempotent; skips if a record with the same `DeploymentId` tag exists). The Step Function itself is untouched. — _Bikash Behera_
- **Catalog** — unified cross-cutting inventory of every Build resource (Applications, Frontier Agents, Custom Agents, Harness, Memory, MCP Servers, A2A Agents, AgentCore Runtimes, Templates) with a single Registry column (Active / Pending / Deprecated / Not in Registry) and filters. — _Bikash Behera_

### 🔐 Secure — federate identity, gate registrations

- **Identity** — register external OIDC providers (Microsoft Entra ID, Okta, Auth0, generic OIDC) with Auth Code + PKCE, discovery-URL testing, and per-provider claim mapping to AVA roles. Enterprise SSO drops in without a Cognito rebuild; provider registration routes through the Approval Queue by policy. — _Bikash Behera_
- **Approval Policies** — human-in-the-loop rules for sensitive actions. Declare which `resource_kind + action` combinations require sign-off, from whom (`ADMIN` / `OPERATOR`), by when (SLA hours), and how many approvers (quorum). Eight `AVA Default` policies seed on backend boot; live enforcement is wired into MCP / A2A / Skills / Agents / Custom Resources / Identity / Deployments flows. — _Bikash Behera_

### 🚦 Operate — a full surface, not just observability

- **Operate landing page** — five tiles: Deployments, AgentCore Observability, Langfuse Observability, Prompt Optimization, Approval Queue. Replaces the v3.1 single-page Observability landing. — _Bikash Behera_
- **Approval Queue** — live inbox of pending HITL sign-offs from the Approval Policy Engine. Each row shows requester, target resource, action, matched policy, and SLA countdown. Approve/deny inline or bulk (up to 200 per call); every decision advances the corresponding AWS Agent Registry record. — _Bikash Behera_

### 📦 New reference implementation

- **Investment Research and Risk Accelerator** — AI research and risk-analysis assistant for capital-markets teams. Bedrock AgentCore + self-provisioned Knowledge Base + RAG, Next.js UI on ECS Fargate behind CloudFront. — _Ronny Rodriguez & Boris Litvin_

### 🔐 AVA SSO — CloudFront edge auth across reference apps

CloudFront-URL protection for the reference-app surfaces so field demos can be shared without exposing raw endpoints:

- **Market Surveillance** — CloudFront Function + client + Lambda authorizer + DB seeder. — _Alseny Diallo & Mark Paguay_
- **Agent Safety** — dashboard authorizer.
- **Case Management** — backend authorizer + frontend client. — _Sudhir Kalidindi_
- **AgentCore-in-a-Box** — CloudFront JWT auth function. — _Charles Meruwoma & Adeleke Coker_
- **Control Plane UI** — SSO integration hardening across landings.

### 📖 Documentation

- README refreshed with the new Build tabs (Harness, Memory, Registry, Catalog), new Secure surfaces (Identity, Approval Policies), and the new Operate five-tile layout, plus new home screenshots.
- Contributor table refreshed to reflect v4.0 authors.

### Upgrade notes

- The v3.1 single-page Observability landing is replaced by the new **Operate** landing at `/operate` with five tiles. Deep links to `/observability` continue to work; new deep links live at `/deployments`, `/observability`, `/prompt-optimization`, `/approvals`.
- Eight `AVA Default` approval policies seed on first backend boot after upgrading. To auto-approve everything during a bring-up, write your own higher-priority policies before the first request.
- Auto-publish is opt-out via Terraform: set `enable_deployment_success_hook = false` on the Control Plane infra module (default enabled).
- The AWS Agent Registry integration expects the AVA namespace to exist; first backend boot creates it via the new `agent_registry` Terraform module — no manual step.
- Registry create flows consult the Approval Policy Engine before writing. A matching `require_approval` policy lands the record as `PENDING_APPROVAL` and opens an Approval Queue row; `deny` returns 403 with the policy's reason.

### Contributors to v4.0

- **Bikash Behera** — Harness, Memory, Registry (Agents / MCP Servers / A2A Servers / Skills / Custom Resources), Catalog, Identity, Approval Policies, Approval Queue, Operate landing, SSO hardening of all apps
- **Ronny Rodriguez & Boris Litvin** — Investment Research and Risk Accelerator reference implementation
- **Adarsh Parakh & Vivian Bui** — release management

## v3.1 — Secure, Govern expansion, and new reference apps

Release date: August 2026

Feature release building on v3.0.1. Adds fine-grained agent access control (Policy + LLM Gateway), a substantially expanded Govern module, four new reference implementations, and refreshed documentation.

### Highlights

#### 🔒 Secure — control what agents can do

- **AgentCore Policy engine (Cedar)** — _Adarsh Parakh_
  Fine-grained tool-access control on AgentCore gateways. Attach/detach a policy engine to any use-case gateway, switch between ENFORCE and LOG_ONLY, and author Cedar allow/deny rules the gateway enforces on every tool call (default-deny). Managed from the Control Plane Policy page, with an "Add Gateway" action to provision a dedicated per-use-case gateway on demand.

- **LLM Gateway (LiteLLM on ECS Fargate)** — _Ashish Kumar_
  OpenAI-compatible chokepoint for every Bedrock model call — virtual keys per agent/team, budgets and rate limits, Bedrock Guardrails attached as a during-call hook, Langfuse trace emission, and full CloudWatch audit. Aurora PostgreSQL + ElastiCache Valkey + ALB.

#### 🏛️ Govern — expanded to twelve workspaces

- **Model Management & Governance, Agentic Coding governance, Govern audit backend** — _Gregg Sorrels_
  Model registry/lineage/evaluations, dev-tools (agentic coding) governance, and a backend for audit and activity data feeding the Command Center.
- Command Center, Agent Registry (agents/tools/MCP/permissions/HITL/A2A), Data Governance, Shadow AI detection, Compliance Center (11 frameworks, 253 controls), and pre-built governance Workflows.

#### 🧩 Capabilities & Agent-as-a-Service

- **Advanced Prompt Optimization (Bedrock AdvPO)** — _Rafael Mosca_ — available under Capabilities → Prompts.
- **Knowledge** (Data Lake: Glue + Athena + S3/Iceberg) available. **Role-based access control (RBAC)** is in progress (coming soon) — _Hemal Gadhiya_.

#### 📦 New reference implementations (5 → 7)

- **Payments Fraud** — _Michael Sidler_ — agent-native fraud scoring, NL investigation, FinCEN-structured SAR drafting (Strands supervisor + 3 specialists).
- **Merchant Onboarding** — _Sudhir Kalidindi_ — document processing, OFAC screening, fraud detection, HITL approvals.
- **AgentCore-in-a-Box** — _Charles Meruwoma & Adeleke Coker_ (integration by _Bikash Behera_) — grab-and-go field demo wiring every AgentCore primitive.

#### 📖 Documentation

- README refreshed with current platform screenshots (home + all pillars), expanded Key Features grid, corrected feature status, and updated contributor credits.

### Upgrade notes

- **Policy/Gateway:** use-case gateways are provisioned on demand via the "Add Gateway" action on a deployment; attach a policy engine and author rules from the Policy page.
- **LLM Gateway:** deploy from Secure → LLM Gateway; point agents at the gateway via `LLM_GATEWAY_BASE_URL` (auto-wired at deploy when the gateway is present).
- **Fresh deployments:** the Control Plane self-provisions its own ECR repositories; deploy scripts derive the account from the caller (no hardcoded registry).

## v3.0.1 — Deployment hardening

Release date: June 2026

Patch release covering bugs surfaced when deploying the v3.0 Control Plane to fresh AWS accounts (the previous test ground was the long-lived golden account, which masked a few cold-start issues).

### Highlights

- **Service Onboarding runner moved from Step Functions + Fargate to Bedrock AgentCore Runtime** — _Bikash Behera_
  Migrates the 5-gate approval workflow runner from a Step-Functions-orchestrated ECS Fargate task to a Bedrock AgentCore Runtime container. Lower cold-start, simpler infra, fewer moving parts. Renames `service_approval_runner/` → `service_approval/` with new `agent/`, `infrastructure/`, and `runtime/` subtrees. Backend, ECS module, and outputs updated accordingly.

- **X-Ray Transaction Search bootstrap fix** — _Vivian Bui_
  Fresh-account `deploy-full.sh` failed with `InvalidParameterException: Log groups starting with AWS/ are reserved for AWS.` Replaces `aws_cloudwatch_log_group.aws_spans` with `AWS::XRay::TransactionSearchConfig` wrapped in `aws_cloudformation_stack` — AWS handles `aws/spans` creation server-side. Drops the per-runtime bootstrap from the FSI Foundry runtime module since Transaction Search is account-wide. `removed { ... lifecycle { destroy = false } }` blocks shed legacy resources from state on existing accounts.

- **CodeBuild Terraform bump 1.5.7 → 1.9.8** — _Vivian Bui_
  Required for `removed { }` blocks (added in TF 1.7) to parse in CI. Without this, foundry CI/CD applies failed at the Terraform parse stage.

- **Cognito multi-role users in `deploy-full.sh`** — _Vivian Bui_
  Step 7 now prompts for one user per role (admin / operator / viewer). Each user is created AND added to the matching Cognito group; without group membership the backend defaulted role to VIEWER and every deploy returned "Requires operator role or higher". Operator and viewer are optional. Deployment summary lists all three roles, marking unconfigured ones explicitly.

- **Telemetry init timeouts** — _Vivian Bui_
  AgentCore container init timed out at 120s on fresh accounts during cold-start. Two surgical fixes in `applications/fsi_foundry/foundations/src/utils/telemetry.py`:
  - boto3 Secrets Manager call now uses 3s connect / 5s read with max_attempts=2 (was 60s/60s defaults)
  - Langfuse v4 client + `auth_check()` now run in a daemon thread with a 5s join timeout; trace export via OTEL env vars stays active
  
  Worst-case synchronous portion of `setup_tracing` now caps at ~22s, leaving ~100s for module imports — well within the 120s budget.

- **`deploy.sh` removed** — _Vivian Bui_
  The script did only the infra-TF portion and printed "next steps" telling users to do Docker/frontend/Cognito manually. `deploy-full.sh` automates all of that. README + Infrastructure README + scripts README updated to drop the references.

### Upgrade notes

- **Existing accounts (already running v3.0):** the X-Ray fix uses Terraform 1.7+ `removed` blocks. If your TF state still has `aws_cloudwatch_log_group.aws_spans` from v3.0, the next apply will drop it from state without destroying the live log group. No manual cleanup needed.
- **Fresh deployments:** `deploy-full.sh` now prompts for three Cognito users. Press Enter to skip operator/viewer; admin is recommended.
- **Library upgrade:** Foundry runtime image must be rebuilt to pick up the telemetry timeout fixes. The Control Plane's CI/CD pipeline rebuilds the image on the next foundry use case deploy automatically.

### Contributors to v3.0.1

- **Bikash Behera** ([behebika@amazon.com](mailto:behebika@amazon.com)) — Service Onboarding runner migration to AgentCore Runtime
- **Vivian Bui** ([vivibui@amazon.com](mailto:vivibui@amazon.com)) — X-Ray Transaction Search fix, Cognito multi-role users, CodeBuild TF bump, telemetry timeouts, deploy.sh removal

---

## v3.0 — Plan, Operate, and Govern

Release date: June 2026

v3.0 takes AVA from "deploy and secure agents" to a full **plan → build →
secure → operate → govern** lifecycle on AWS. Five new pillars land in
the Control Plane: an interactive Plan section, a 5-gate Service
Onboarding workflow, a dual observability stack, an 8-workspace Govern
pillar, and AWS Security Agent in AaaS — alongside 22 starter templates
and federated AWS console launch for every Frontier Agent.

### Highlights

- **App Templates** — _Hemal Gadhiya_
  22 deployable starter templates surfaced through the **App Templates**
  tab in the Control Plane, covering 8 categories: foundation &
  observability, agent scaffolds (Strands + LangGraph), multi-agent
  patterns (orchestration kit, supervisor-specialists, plan-and-execute,
  evaluator-optimizer, sequential pipeline, event-driven, RAG report
  generator), human-in-the-loop, memory & knowledge (AgentCore Runtime,
  AgentCore Memory, Bedrock Knowledge Base), security & auth
  (Bedrock Guardrails, Cognito), and API & tools (API Gateway,
  structured output, test harness). Replaces the v2.5 template set.

- **AgentCore Observability** — _Daniela Vargas_
  AVA now emits to **two complementary observability stacks** at deploy
  time: AgentCore Observability for service-level runtime telemetry
  (CloudWatch GenAI Observability + X-Ray Transaction Search,
  capturing `InvokeAgentRuntime` spans, payload metadata, cold-starts,
  IAM denials) and Langfuse for application-level traces, prompts,
  evals, and cost. Wired into every AgentCore runtime stack via
  APPLICATION_LOGS log delivery and X-Ray trace destinations. Per-account
  prereq enables X-Ray Transaction Search via a one-time `null_resource`.
  `telemetry.py` runs in dual mode and registers Strands + LangChain
  OTEL instrumentors plus the Langfuse v4 OTEL span processor.

- **Service Onboarding** — _Bikash Behera & Aditi Pendharkar_
  A guided 5-gate approval workflow — **Risk → Security → Compliance →
  Architecture → Executive** — for any new AI service. Powered by a
  Claude Code plugin that runs each phase as an autonomous reviewer and
  produces a signed approval report with an evidence bundle (threat
  model, control mapping, risk register, architecture review,
  executive summary) ready for auditors. Step Functions orchestrates
  phase progression with full audit trail in DynamoDB; an S3 bucket
  stores per-phase artifacts. New `service_approval` Terraform module +
  `service_approval_runner` container + REST API at
  `/api/service-approvals` + `ServiceOnboardingLanding` workflow UI.

- **Plan section** — _Bikash Behera & Sushil Pramanick_
  Four interactive frameworks turn ambition into an investable plan
  before you build. Use them in order (Assess → Design → Identify →
  Justify) or jump to the one you need:
  - **Maturity Assessment** — score across 5 dimensions (Data,
    Infrastructure, Org, Governance, Strategy) with 25+ indicators,
    gap analysis, L1–L5 rating
  - **Operating Model** — pick a TOM pattern (Centralized CoE /
    Hub-and-Spoke / Federated) by scoring 7 dimensions across 21
    questions, with investment guidance per pattern
  - **Use Case Prioritization** — rank ideas with the AWS Enterprise AI
    Scoring Model (25 weighted criteria) with Go/Conditional/No-Go
    gates
  - **Business Cases** — CFO-grade DCF with NPV, IRR, payback, ROI;
    8-category risk scorecard, ramp-up curves, Go/Review/Reject
    verdicts

  Backed by per-framework backend routes, services, models, and
  schemas; persisted to DynamoDB. Includes a written Use Case
  Discovery Guide at `plan/UseCaseGuidance.md`.

- **Govern** — _Gregg Sorrels_
  Replaces the v2.5 single-page command center with a full GRC pillar —
  one Command Center plus seven deeper workspaces:
  - **Command Center** — AI Platform Activity grid, Trust Stack
    snapshot, Compliance · Guardrails · Cost summary, Recent Activity,
    Quick Actions
  - **Trust Stack** — 3-layer model (Foundation → Production → Scale)
    with AWS service mapping and 3 Lines of Defense
  - **Fleet Overview** — fleet-wide KPIs, 30-day trust + guardrail
    trend, agent × risk heatmap, top risky use cases
  - **Risk Management** — heatmap, control effectiveness, risk
    register; aligned to NIST AI RMF and SR 26-2
  - **Model Management** — model registry with risk tier, eval score,
    attestation status; 4-framework MRM compliance progress (SR 26-2,
    OSFI E-23, NIST AI RMF, EU AI Act)
  - **Compliance Center** — interactive checklists for SR 26-2,
    OSFI E-23, NIST AI RMF, EU AI Act, ISO 42001
  - **Cost & FinOps** — health score, spend velocity, 12-month
    forecast, unit economics, chargeback statement
  - **Audit & Incidents** — searchable timeline of guardrail events,
    incidents, approvals, deployments; per-event evidence drawer

  Shared infrastructure: `useGovernanceAggregator.ts` merges live data
  from guardrails, deployments, use cases, agents, and frontier agents;
  Heroicon outline set keeps icons emoji-free; ModuleGuide drives the
  collapsible "Getting Started" / "How to Use" panels with a unified
  indigo→violet→pink palette.

- **AWS Security Agent + federated console launch** — _Vivian Bui_
  Amazon's managed Security Agent is now in AaaS — design review,
  code review, and on-demand pentest — deployable in three IaC flavors
  (Terraform, CDK, CloudFormation). After deploy, hit **Launch in
  Console** on any Frontier Agent (DevOps or Security) and the backend
  mints an STS-backed federated sign-in URL that drops you straight
  into the agent's AWS Console with the right operator role — no
  manual role-switching.

### User-facing changes

- New top-level Plan section with 4 framework workspaces.
- New Secure → Service Onboarding workflow page.
- New Operate page surfacing both observability stacks.
- New Govern pillar with 8 workspaces under `/govern/*`.
- Frontier Agents catalog adds Security Agent; **Launch in Console**
  button on every deployed Frontier Agent.
- App Templates tab now lists 22 templates across 8 categories.
- DeploymentList page: clickable status chips for filtering and a
  status-priority default sort.
- Refreshed home screenshots (plan, foundry, aaas, capabilities,
  observability, govern-command-center).

### Infrastructure

- New Terraform modules: `service_approval` (Step Functions + DynamoDB
  + S3 + Lambda runner), `frontier_agents_pipeline`, X-Ray Transaction
  Search prereq via `null_resource`.
- AgentCore runtime stacks now include APPLICATION_LOGS log delivery
  and X-Ray trace destinations.
- Cognito module supports optional demo-user seeding for fresh stamps.
- Docker Hub credentials wiring for the Langfuse Foundation Stack.

### Security

- Real AWS identifiers replaced with placeholders in test scripts,
  runtime configs, and sample-data scripts (case-management
  config.json, load_sample_data.sh, ConfigManager.tsx,
  economic_research test_business_logic.sh, customer_service /
  fraud_detection runtime configs).

### Upgrade notes

- The v2.5 template set (tool-calling-agent,
  multi-agent-orchestration, rag-application, langraph-agentcore,
  strands-agentcore) is replaced by the new 22-template catalog. If
  you forked any of those templates, migrate to the closest v3.0
  equivalent (e.g., `agent-scaffold-langgraph`, `agent-scaffold-strands`,
  `multi-agent-kit`, `research-report-generator`).
- The v2.5 `GovernLanding` (single-page command center) is replaced by
  the new 8-workspace pillar. The same `/govern` route now lands on
  the new pillar; no breaking change for users, but anyone deep-linking
  to the old single-page sections will need updated paths
  (`/govern/command-center`, `/govern/trust-stack`, etc.).
- AgentCore Observability requires a one-time per-account/region X-Ray
  Transaction Search enable. Set `enable_xray_transaction_search=true`
  on your first Control Plane deploy.

### Contributors to v3.0

- **Hemal Gadhiya** ([gadhiy@amazon.com](mailto:gadhiy@amazon.com)) — App Templates
- **Daniela Vargas** ([vargas-dann-0896@amazon.com](mailto:vargas-dann-0896@amazon.com)) — AgentCore Observability
- **Bikash Behera** ([behebika@amazon.com](mailto:behebika@amazon.com)) — Plan section design and implementation, Service Onboarding implementation
- **Aditi Pendharkar** ([aditipen@amazon.com](mailto:aditipen@amazon.com)) — Service Onboarding review workflow, Claude Code plugin design
- **Sushil Pramanick** ([sushipra@amazon.com](mailto:sushipra@amazon.com)) — Plan section design, AI use case discovery methodology
- **Gregg Sorrels** ([gsorrels@amazon.com](mailto:gsorrels@amazon.com)) — Govern pillar design, AI Trust Stack model, MRM framework alignment
- **Vivian Bui** ([vivibui@amazon.com](mailto:vivibui@amazon.com)) — AWS Security Agent IaC, federated AWS console launch, Control Plane integration, README + Architecture refresh

---

## v2.5 — Guardrails, Capabilities, and Governance

Release date: May 2026

v2.5 rounds out the AVA platform with three additions that move the story
from "deploy agents" to "deploy, secure, and govern agents" end-to-end.

### Highlights

- **Guardrails** — _Adarsh Parakh_
  Amazon Bedrock Guardrails are now a first-class concept in the Control
  Plane. Build templates with content filters, PII detection, denied
  topics, word filters, and contextual grounding; attach one or more to
  any agent at deploy time. Post-processing guardrails are wired into the
  `customer_service` use case and the foundation base classes, so any
  Foundry UC can opt in. Ships with three FSI-tuned presets
  (FSI Standard, Market Surveillance, Customer Service).

- **Capabilities** — _Vivian Bui_
  New top-level section under Build for the composable primitives every
  agent depends on. Three children:
  - **Tools** — pre-built MCP Gateway, Code Interpreter, Web Browser,
    API Connector, Notifications; plus a builder for custom tools from
    Lambda functions, REST/OpenAPI endpoints, or MCP servers.
  - **Knowledge** — data sources (S3, RDS, APIs), knowledge bases
    (Bedrock KBs with vector + hybrid retrieval), document stores, and
    streaming feeds with attached-agent counts, refresh cadence, and
    backend stack.
  - **Prompts** — versioned system prompts, response templates,
    evaluation rubrics, and guardrail clauses backed by Amazon Bedrock
    Prompt Management.

  The old "Tools Factory" page moves out of Agent-as-a-Service into
  Capabilities; the legacy `/aaas/tools` URL redirects.

- **Governance Command Center** — _Vivian Bui_
  A new pillar focused on the governance story regulators and
  executives expect. Single-page command center shows AI Trust Stack
  posture across 7 layers (infrastructure, data, model, application,
  agent, access, governance), fleet KPIs, a 30-day trust & guardrail
  trend, agent × risk heatmap, model inventory, compliance coverage
  (NIST AI RMF · ISO 42001 · NYDFS Part 500 + AI circular · EU AI Act
  · SR 11-7 · SOC 2 Type II), Cost & FinOps summary, and recent
  activity. Drill-down drawers open per model, per heatmap cell, and
  per compliance framework.

  Three deep sub-pages for analysts and auditors, each buildable today
  against real AWS APIs:
  - **Model Registry** — filters, attestation board, EU AI Act
    classification, approval pipeline, fleet eval trend.
  - **Cost & FinOps** — FinOps health, 12-month forecast scenarios,
    unit economics, chargeback by BU, commitment / Provisioned
    Throughput planner, optimization opportunities.
  - **Audit & Incidents** — filterable timeline of guardrail events,
    incidents, approvals, deployments, and config changes with a
    per-event evidence drawer (trace, CloudTrail, exportable bundles).

### User-facing changes

- Sidebar: Applications, Agent-as-a-Service, Capabilities,
  Observability, and Govern are now collapsible per section with
  chevron toggles; expanded state persists to localStorage. When the
  sidebar is collapsed, clicking a parent icon opens a flyout menu.
- Home page: new Capabilities banner below the Applications and
  Agent-as-a-Service cards; Govern gets a tile on the Secure/Operate
  row.
- Observability: Langfuse page now probes the advertised URL on load
  and falls back to a "Deploy Langfuse" CTA if the server is
  unreachable (handles the case where a deployment record outlives the
  ECS stack).
- README: refreshed hero image, new Capabilities/Secure/Govern
  sections, updated footer attribution to "FSI PACE".

### Infrastructure

- `aws_s3_bucket_policy.frontend_cloudfront` gains an
  `extra_cloudfront_distribution_arns` input so vanity-domain
  distributions (e.g. Alternate Domain Names routed through a separate
  CloudFront) can be allowed without drifting out of Terraform.
- `cors_origins` gains an `extra_cors_origins` variable for the same
  reason.
- Guardrails DynamoDB table, `ecs_task_bedrock_guardrails` IAM policy,
  and `GUARDRAILS_TABLE_NAME` env var are added to the ECS task.
- Use-case UI buildspec stops importing `aws_lambda_permission.apigw`
  (which couldn't reconcile when API Gateway was recreated) and
  instead removes any existing `AllowAPIGateway*` statements pre-plan
  so Terraform creates a fresh, correct one on every apply.

### Security

- Pre-release scan scrubbed real CloudFront distribution IDs, API
  Gateway IDs, ALB DNS names, and S3 bucket names from source and
  from all historical commits. Every `<api-id>`, `<region>`,
  `<ACCOUNT_ID>`, and `<alb-name>` placeholder must be substituted at
  deploy time.
- No AKIA keys, private keys, or `terraform.tfstate` files are tracked.

### Upgrade notes

- Users upgrading from v2.0 should re-clone the repository rather than
  pulling, because v2.5 ships with a rewritten history that scrubs
  historical secrets. Pre-existing forks and clones from v2.0 or
  earlier may diverge on rebased commit hashes.
- Recharts is a new dependency of the Control Plane frontend. Run
  `npm install` before starting the dev server or building.

### Contributors to v2.5

- Adarsh Parakh (`parakhad@amazon.com`)
- Vivian Bui (`vivibui@amazon.com`)

---

## Earlier releases

See the [Git tag history](https://github.com/aws-samples/sample-agentic-value-accelerator/tags)
for v2.0, v1.2, v1.1, and v1.0 release notes.
