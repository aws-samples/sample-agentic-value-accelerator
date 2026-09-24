# AWS Context — Note for Raphael

**Re: AWS Summit NYC (June 2026) announcement — relevance to KYC Controlled Quality Output demo**

---

## What It Is

AWS Context is a new service (coming soon) that automatically maps relationships across an organization's data into a knowledge graph and exposes agentic search so AI agents can access governed data relationships, business rules, and domain knowledge at runtime. It extends the knowledge graph that powers Amazon Q into an organizational-level shared context layer. Alongside it, AWS announced Glue Catalog Business Context + Semantic Search (preview), Skill Assets in Glue Catalog, and S3 Annotations (GA) — all oriented around the thesis: *"Context is the data lake for AI agents."*

---

## Why This Validates Our Architecture

Our demo is a **vertical FSI governance instance** of what AWS is now building **horizontally as a platform primitive**. Specifically:

- **Identity-aware governance by default** — AWS Context makes every query inherit IAM/Lake Formation permissions. Our Cedar + AVP policy cascade does the same thing at the *decision* layer. Same principle, different altitude.
- **"Config, not code"** — Their data stewards curate the graph through console experiences and promote inferred relationships to production. Our governance operators configure Cedar policies at runtime without code releases. AWS is validating the operational model we already present on slide 13.
- **Agents learning from agents** — AWS Context ranks sources by actual agent usage and propagates correct paths across the org. Our evaluation pipelines + fleet health monitoring serve the same feedback loop for *governance decisions* rather than data joins.
- **Open and portable (Iceberg)** — They publish to Iceberg so customers aren't locked in. Our architecture is Cedar-native (open spec, deterministic, auditable). Both reject black-box approaches.

The headline quote from Mai-Lan's post — *"Agents are only as intelligent as the context they can reason over"* — is one word away from our slide 1 thesis: *"Agents are only as intelligent as the governance they operate under."* That's not a coincidence; it's the same insight applied to two complementary planes.

---

## What It Does NOT Replace in Our Demo

AWS Context is a **data-layer context graph**. Our demo is a **governance-layer decision graph**. They are complementary, not overlapping:

| AWS Context | Our Demo |
|---|---|
| Maps data relationships | Maps policy relationships |
| Answers: "what data can this agent reach?" | Answers: "what should this agent be *allowed to decide*?" |
| Curates business definitions + usage rules | Curates Cedar policies + escalation thresholds |
| Identity-aware data access | Identity-aware decision authority |
| Knowledge graph for data discovery | Decision graph for governance enforcement |

AWS Context doesn't provide: progressive governance layers, LLM-as-Judge evaluation, deterministic check orchestration, APPROVE/ESCALATE/BLOCK decision cascades, or fleet-level agent health monitoring. That's all still us.

---

## How to Reference in Customer Conversations

Position it as:

> "AWS is building context intelligence as a platform primitive — the data foundation that agents reason over. What we're showing you is what governance looks like *on top of* that foundation, specifically for FSI. Our per-agent policy pattern is the governance complement to the context layer AWS is investing in. When they GA this, our agents will consume context FROM it and apply Cedar policies TO it."

Short version for the whiteboard: **AWS Context = what agents know. Our governance layer = what agents are allowed to do with what they know.**

---

## Future Integration Opportunity

When AWS Context GA's:

1. **Agent registry consumes context** — Our agent registry could pull business rules and domain definitions from the AWS Context graph, so Cedar policies reference *governed business context* rather than hardcoded attribute values.
2. **Skill Assets for governance** — We could publish our Cedar policy documentation, escalation runbooks, and evaluation criteria as Skill Assets in Glue Catalog, making them discoverable by any MCP-compatible agent in the customer's estate.
3. **S3 Annotations for audit** — Decision audit trails (currently in our governance dashboard) could be attached as S3 Annotations to the data objects the agent acted on, creating a closed loop between "what was decided" and "what data was touched."
4. **Identity chain** — AWS Context's IAM-inherited identity model aligns directly with AVP's principal-based Cedar evaluation. One identity, two enforcement planes (data access + decision authority).

---

**Bottom line:** This announcement is pure tailwind. It validates our architectural direction, gives us a "platform roadmap" answer for skeptical customers, and opens concrete integration paths for post-demo follow-up. We should reference it explicitly in every customer conversation going forward.
