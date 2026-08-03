# Meridian — AgentCore Demo Guide for Solutions Architects

> **Who this is for:** AWS Global Financial Services SAs who want to show a customer what
> **Amazon Bedrock AgentCore** does — the primitives, the governance story, and the
> "watch it happen" multi-agent visuals — without spinning up a whiteboard.
>
> **What it is:** *Meridian Asset Management* (fictional fixed-income firm). A team of **11
> specialist agents** helps a portfolio manager build, analyze, ESG-screen and trade real
> bond portfolios — every action running through an AgentCore primitive, all of it visible
> on screen and traceable in CloudWatch.
>
> **The one-liner for the customer:** *"This is what a governed, auditable agentic system
> looks like on AWS — the agents are autonomous, but the controls are real."*

<!-- VISUAL SLOT 1 — HERO
     File: docs/sa/hero.png
     Capture: the full app mid-run — left sidebar (topology toggle + model selector +
     quick prompts), center chat with an answer streaming, and the swarm/graph flow lit up.
     This is the "what your customer sees in the first 5 seconds" shot. -->
![Meridian AgentCore demo — hero](sa/hero.png)

---

## Why a financial-services customer cares

Three things FS buyers ask about agents — and what this demo shows for each:

| The question they're really asking | What Meridian demonstrates |
|---|---|
| **"Can I let an agent act autonomously without losing control?"** | A **Cedar policy** the agent physically cannot bypass — flip a toggle and the agent *genuinely cannot* retrieve a restricted value. The block is real, not a prompt instruction. |
| **"Can it act *on behalf of* a specific user, with scoped permission?"** | **AgentCore Identity** — per-user data keyed by Cognito `sub` (Alice ≠ Bob), plus **3-legged OAuth** where *view positions* and *execute trades* are **separate consents**. Read can't escalate to trade. |
| **"When the regulator asks what happened, can I answer?"** | Every hop, tool call, model invocation and Cedar decision emits a **CloudWatch / X-Ray span**. The in-app **Execution Trace** is built from those same real spans — nothing is mocked. |

---

## The 60-second story

A portfolio manager asks Meridian to *"run a full desk review."* A **Lead Coordinator** routes
the work to specialists: **Macro & Rates** reads the live Treasury curve and Fed data,
**Universe & Data** screens a ~3,000-bond universe, **Risk & Quant** runs an *evolutionary
search* to construct a portfolio, then **Attribution**, **ESG** and **Liquidity** analyze it in
parallel, and an **Investment Committee** reconciles the conflicts and issues a
**go / adjust / no-go** verdict. You watch the agents hand off (Swarm) or fan out through a
fixed DAG (Graph) in real time — and every tool they touch is a governed AgentCore primitive.

---

## AgentCore primitives → the on-screen moment → the FS talking point

This is the core map. Each row is a thing the customer can *see happen* in the UI.

| AgentCore primitive | The on-screen moment | Say this to the customer |
|---|---|---|
| **Runtime** | The whole agent runs as a managed container; the chat just streams events. | *"You don't run servers. AgentCore hosts the agent, streams responses, and scales it."* |
| **Gateway (MCP)** | The bond/vault tools light up as tool calls — they're Lambdas exposed as **governed MCP tools** over a SigV4 Gateway. | *"Your existing Lambdas and APIs become agent tools through one governed MCP endpoint — no rewrite."* |
| **Policy (Cedar)** | The **Secure Vault toggle**: ON → agent returns the restricted list; OFF → agent says it's blocked and *cannot* retrieve or invent it. | *"Authorization is enforced by Cedar at the platform, not by asking the model nicely. This is the control plane a regulator will accept."* |
| **Identity — per-user** | Log in as **Alice** vs **Bob** → different funds, keyed by Cognito `sub`. | *"The agent sees only the caller's data. Identity is first-class, not bolted on."* |
| **Identity — 3LO (on-behalf-of)** | **View positions** then **Execute trade**: a one-time consent card, with *read* and *trade* as **separate** grants. | *"The agent acts as the user, with the user's own scoped OAuth consent — and viewing can never silently become trading."* |
| **Identity — M2M** | **Licensed Market Feed**: the agent pulls a vendor feed as the *firm's application* (machine-to-machine), no user consent. | *"For entitled firm data, the agent authenticates as your application — the right pattern for licensed vendor feeds."* |
| **Browser** | **Treasury Yields / Live CPI**: a live web fetch via the AgentCore Browser (Playwright/CDP). | *"The agent reads the live web in a managed, sandboxed browser — real market data in the loop."* |
| **Code Interpreter** | **Stress My Portfolio / Attribute Returns**: Python runs in the AgentCore sandbox on real data. | *"Bespoke analytics run in an isolated sandbox — no code touches your environment."* |
| **Memory** | **Store** the PM's mandate, start a **New Session**, **Recall** it. | *"Long-term memory across sessions, managed for you."* |
| **Observability** | The in-app **Execution Trace** (per-agent / per-tool / model-call timings) — and the same spans in **CloudWatch GenAI Observability**. | *"Every decision is traced end-to-end. This is your audit trail."* |

---

## Architecture at a glance

How it all wires together — the same primitives from the map above, shown end to end. **Grey =
request / data flow; purple = the identity & policy control plane; dashed = auth / consent.**

![Meridian AgentCore architecture](architecture.svg)

The story to tell over this diagram: the browser talks only to **CloudFront / API Gateway /
Cognito** — never to the agent directly. A Lambda bridges into **AgentCore Runtime**, which
drives the **11-agent Strands desk**. Every tool the agents call is a **governed AgentCore
primitive** — Gateway-fronted Lambdas (with **Cedar** deciding each call), the managed
**Browser / Code Interpreter / Memory**, and **Identity** vending the tokens that let the agent
act **on behalf of the PM (3LO)** or **as the firm (M2M)**. It all emits **OpenTelemetry spans
to CloudWatch**. *(Diagram is generated from `docs/gen_diagram.py` — the single source of truth.)*

---

## The two "aha" beats (lead with these)

### 1. The Cedar block that is *genuinely real*

<!-- VISUAL SLOT 2 — POLICY BLOCK
     File: docs/sa/policy-block.png (or a 2-up before/after)
     Capture: the Secure Vault toggle OFF, and the agent's reply stating it is blocked by
     policy and cannot retrieve the restricted list. Ideally a side-by-side with the ON case. -->
![Cedar policy block](sa/policy-block.png)

Flip the **Secure Vault** toggle OFF (Cedar → `forbid`) and ask for the restricted trading
list again. The agent doesn't refuse politely — it **has no way to get the value**. The tool
call is denied at the Gateway by the policy engine, so the model literally cannot know or
fabricate it. *This is the moment that lands with risk and compliance teams.*

### 2. Multi-agent orchestration you can *watch*

<!-- VISUAL SLOT 3 — SWARM FLOW
     File: docs/sa/swarm-flow.png
     Capture: the Swarm topology mid-run — agent nodes lit, hand-off edges drawn between
     specialists (e.g. Coordinator → Universe & Data → Risk & Quant). -->
![Swarm hand-offs](sa/swarm-flow.png)

<!-- VISUAL SLOT 4 — GRAPH DAG
     File: docs/sa/graph-dag.png
     Capture: the Graph topology on a "full desk review" — the DAG fanning out
     (macro ∥ universe → analytics → attribution ∥ esg ∥ liquidity) and fanning IN to the
     Investment Committee sink. This is the most impressive single visual. -->
![Deterministic graph DAG](sa/graph-dag.png)

Same 11 agents, same tools, **two orchestration architectures** — switch them in the sidebar:

- **Swarm** — *emergent.* Each agent decides the next hand-off. Great for open-ended asks;
  the path is the model's choice.
- **Graph** — *deterministic DAG.* The topology is declared up front: independent branches
  run **concurrently** and **fan in** to the Investment Committee. Reproducible and auditable —
  *"the orchestration is a fixed, reviewable graph, not the model's improvisation."*

Both are built on the real **Strands Agents SDK** running inside AgentCore Runtime.

### Bonus: swap the model live

The sidebar **Model** selector runs the same desk on **Auto** (tiered — Opus 4.8 for the
reasoning agents, Sonnet 5 for the structured ones) or forces one model across all agents
(Sonnet 5, Nova Pro, GPT-OSS 120B, Haiku 4.5). *"AgentCore isn't locked to one model — pick
the right tier per task."*

<!-- VISUAL SLOT 5 — EXECUTION TRACE
     File: docs/sa/execution-trace.png
     Capture: the in-app Execution Trace panel — the WALL / AGENTS / TOOLS / HAND-OFFS /
     MODEL CALLS / TOKENS chips and the by-agent / by-tool timing bars. -->
![Execution trace from real CloudWatch spans](sa/execution-trace.png)

---

## Demo paths

Pick the length that fits the room. Both drive from the **Quick Prompt** buttons in the left panel.

### ⚡ Lightning (5 min) — "the primitives"
1. **Restricted List** → flip **Secure Vault** OFF → ask again (the Cedar "aha"). Flip back ON.
2. **My Mandate & Funds** as Alice, then as Bob (Identity, per-user).
3. **Treasury Curve** (Browser) → **Stress My Portfolio** (Code Interpreter).
4. Open the **Execution Trace** and point at the spans.

### 🎬 Full desk review (15 min) — "the multi-agent story"
1. Switch topology to **Graph**, run **"Full Desk Review → Committee Verdict."** Narrate the
   fan-out and the Committee sign-off.
2. Switch to **Swarm**, run **"Build a Core Bond Portfolio"** — show emergent hand-offs.
3. Hit the two "aha" beats above (Cedar block, then 3LO **View** vs **Execute** consent).
4. Flip the **Model** to a non-Anthropic model and re-run one prompt (model flexibility).
5. Close in **CloudWatch → GenAI Observability** on a real trace.

> **Deeper scripts:** step-by-step click order and gotchas live in
> [`DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md); the full presenter narrative (cold open → 7 acts →
> close, with timing) is in [`docs/DEMO_NARRATIVE.md`](DEMO_NARRATIVE.md).

<!-- VISUAL SLOT 6 — 3LO CONSENT (optional but strong)
     File: docs/sa/consent-3lo.png
     Capture: the "Authorize → I've approved, continue" consent card that appears on the
     first Positions/Trade 3LO action. -->
![3-legged OAuth consent](sa/consent-3lo.png)

<!-- VISUAL SLOT 7 — OBSERVABILITY (optional)
     File: docs/sa/observability.png
     Capture: CloudWatch → GenAI Observability → Bedrock AgentCore, a session trace with the
     AgentCore.Policy.AuthorizeAction and Gateway.InvokeTool spans visible. -->
![CloudWatch GenAI Observability](sa/observability.png)

---

## The cast (so you can name-drop confidently)

An 11-agent fixed-income desk. In **Auto** mode, reasoning-heavy agents run on **Opus 4.8** and
structured-tool agents on **Sonnet 5**.

| Agent | Does | Key tools (AgentCore surface) |
|---|---|---|
| **Lead Coordinator** | Routes the mandate to specialists | — (routing only) |
| **Macro & Rates** | Top-down rates/Fed view | curve & spread lookup, Browser, FRED macro |
| **Universe & Data** | Screens the ~3,000-bond universe | bond screen, pricing, licensed feed (M2M) |
| **Credit Research** | Live issuer/market context | Browser, per-user data |
| **Risk & Quant** | Builds portfolios via evolutionary search | Code Interpreter, portfolio risk, evolve |
| **Performance Attribution** | Carry / curve / credit / selection | portfolio risk, Code Interpreter |
| **ESG & Sustainability** | Exclusion & controversy screen | Browser, per-user mandate |
| **Liquidity & Microstructure** | Tradability + execution plan | bond screen, Code Interpreter |
| **Compliance & Controls** | Restricted values via **Secure Vault** | vault (Gateway + **Cedar**) |
| **Portfolio & Execution** | View / execute **on behalf of** the PM | positions & trade (**3LO**) |
| **Investment Committee** | Reconciles, challenges, issues the verdict | — (synthesis sink) |

---

## Before you demo

- **Deploy your own instance** — see the [README](../README.md). `deploy.sh` prints the
  CloudFront URL and seeds the PM users (Alice & Bob) and their funds.
- **Pre-flight** (10 min before a live call): Secure Vault toggle **ON**, Runtime **READY**,
  Gateway targets **READY**, a warm-up prompt run once (cold starts + async memory).
- Full pre-demo checklist and failure-recovery notes: [`DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md).

> ⚠️ **Demo, not production.** IAM is intentionally broad, CORS is `*`, and the Cognito
> password policy is relaxed for easy standup. See the README's security notes before reusing
> any of it with a customer's account.
