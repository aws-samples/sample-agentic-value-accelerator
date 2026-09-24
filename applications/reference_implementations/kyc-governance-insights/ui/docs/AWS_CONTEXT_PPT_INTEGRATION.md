# AWS Context — PPT Integration Notes

**For: Deck v8 iteration ("Scaling Agentic AI Safely")**
**Source: AWS Summit NYC June 2026 — "Context Intelligence for your data and AI agents at scale"**

---

## Slide Mapping

### Slide 10: Policy Engine + Agent Registry + Deterministic Checks

**Why this maps:** Slide 10 presents our layered governance architecture — the policy engine (Cedar/AVP), agent registry, and deterministic checks that produce APPROVE/ESCALATE/BLOCK decisions. AWS Context introduces a *complementary* layer beneath this: the organizational knowledge graph that agents reason over *before* governance decisions are applied.

**Suggested modification:**

Add a visual element (left side or bottom layer of the existing architecture diagram) showing "Enterprise Context Layer" feeding INTO the policy engine. Label it: *"AWS Context (platform direction)"* with a dotted-line border to indicate future/platform-level capability vs. our solid-line governance stack.

This positions our governance stack as the **decision authority** that sits on top of the **context foundation** AWS is building. The visual should communicate: context flows up → governance decisions flow down.

**Speaker note addition:**

> "You'll notice we show an enterprise context layer feeding into our policy engine. At AWS Summit NYC in June, AWS announced AWS Context — a service that automatically maps data relationships into a knowledge graph that agents query at runtime. This is the platform investing in exactly the layer our governance stack consumes. Our Cedar policies don't operate in a vacuum — they need business context to make intelligent APPROVE/ESCALATE/BLOCK decisions. AWS Context is where that context will live at scale. We built the governance layer; AWS is building the context layer beneath it."

---

### Slide 13: Governance Dashboard + "Config Not Code" Takeaway

**Why this maps:** Slide 13 drives home the "config, not code" principle — governance operators configure policies at runtime without code releases. AWS Context validates this same operational model: data stewards curate the knowledge graph through a console experience, reviewing AI-inferred relationships and promoting them to production. Neither requires engineering releases to evolve.

**Suggested modification:**

Add a callout box or footnote-style reference:

> *"AWS Context (June 2026): Same operational model at platform level — curators manage context through console, not code. Validates our 'config, not code' principle for governance."*

This should be subtle — a credibility anchor, not a new section. The point is to signal that our architectural principle isn't just a demo opinion; it's the direction the platform is moving.

**Speaker note addition:**

> "When we say 'config, not code,' we're describing an operational model that AWS itself is now adopting for their context layer. In AWS Context, data stewards promote inferred relationships to production through a console — no deployment pipeline required. We apply the same model to governance policies. Cedar policies are runtime configuration. Escalation thresholds are runtime configuration. The governance posture of your entire agent fleet can change in minutes, not sprints. This isn't an opinionated demo choice — it's where the industry is heading."

---

## New Talking Points (General — Use Across Deck)

### The Two-Layer Framing

Use this framing whenever a customer asks "how does this connect to broader AWS direction":

> "Think of it as two complementary layers. AWS Context answers: *what can agents know?* Our governance layer answers: *what should agents be allowed to decide?* AWS is building the context data lake. We're building the governance control plane that sits on top. You need both. Context without governance is a liability in regulated industries. Governance without context produces brittle, over-restrictive policies."

### The Platform Validation Point

For technical audiences (SAs, engineering leads):

> "AWS Context makes every graph query identity-aware — it inherits IAM and Lake Formation permissions. Our Cedar policies in AVP do the same thing at the decision layer — every policy evaluation inherits the agent's principal identity. Same design pattern, two enforcement planes. One identity, governed at both the data access layer and the decision authority layer. This is how you get auditability end-to-end."

### The "Agents Learning from Agents" Parallel

> "AWS Context gets smarter as agents use it — it observes which sources produce correct results and propagates those paths across the organization. Our evaluation pipelines do the same thing for governance decisions. When one agent's escalation pattern proves effective, our fleet health monitoring surfaces that signal so governance operators can update policies across the fleet. Both systems create a virtuous feedback loop — one for data quality, one for decision quality."

---

## Positioning Strategy

### Core Position

**"AWS is building this at platform level → here's what it looks like applied to FSI governance specifically."**

Expanded version for the narrative arc:

1. **Platform direction** (AWS Context): Organizational knowledge graph + identity-aware agentic search + curated business rules
2. **Vertical application** (our demo): FSI governance control plane + Cedar policy cascade + progressive evaluation layers + fleet monitoring
3. **Integration thesis**: When AWS Context GA's, our governance stack becomes a *consumer* of platform context and an *enforcer* of domain-specific policy on top of it

This positions our demo as **forward-compatible** with AWS's platform investment, not as a standalone point solution that might get obviated.

---

## Customer Objection Pre-emption

### Objection: "Is this just a demo, or is AWS actually building in this direction?"

**Response framework:**

> "Let me point you to what AWS announced at Summit NYC three weeks ago. AWS Context is a new service that builds an organizational knowledge graph for AI agents — identity-aware, governed by default, publishing to open formats. The blog post opens with: 'Agents are only as intelligent as the context they can reason over.' Our thesis is the governance complement: 'Agents are only as intelligent as the governance they operate under.' These are two sides of the same coin, and AWS is investing in both.
>
> What we're showing you today is the governance vertical — Cedar policies, progressive evaluation layers, fleet health monitoring — purpose-built for FSI regulatory requirements. The platform direction beneath it is exactly what AWS Context provides. We're not building against the grain of the platform; we're building *with* it, one layer up."

**Key proof points to cite:**
- AWS Context's identity-aware governance (IAM/Lake Formation inheritance) parallels our AVP principal-based Cedar evaluation
- Skill Assets in Glue Catalog = same pattern as our policy documentation and escalation runbooks (context attached to assets, discoverable by agents)
- S3 Annotations GA = infrastructure for attaching rich business context to data objects (our governance audit trails could publish here)
- Mai-Lan Tomsen Bukovec (VP-level) authoring the post signals strategic investment, not a side project

---

## The "Context as Data Lake for AI Agents" Connection

The blog closes with: *"Context is the data lake for AI agents."*

Connect this to our message:

> "If context is the data lake for AI agents, then governance is the *control plane* for that data lake. You wouldn't run a data lake without access controls, audit trails, and data quality rules. You shouldn't run an agent context layer without governance policies, decision audit trails, and evaluation quality gates. That's what our demo shows — the governance control plane for the era of agentic AI."

This framing works because it:
1. Borrows credibility from the AWS platform narrative
2. Makes governance feel *essential* rather than *restrictive*
3. Positions our demo as the natural next layer, not an alternative approach
4. Resonates with FSI audiences who already think in terms of control planes and data governance

---

## Summary of Deck Changes

| Location | Change Type | Content |
|---|---|---|
| Slide 10 diagram | Visual addition | "Enterprise Context Layer" feeding into policy engine (dotted border, labeled AWS Context) |
| Slide 10 speaker notes | Addition | Platform context layer paragraph (see above) |
| Slide 13 body | Callout/footnote | AWS Context validates "config, not code" principle |
| Slide 13 speaker notes | Addition | Industry direction paragraph (see above) |
| General speaker prep | Talking points | Two-layer framing, platform validation, agents-learning-from-agents parallel |
| Q&A prep | Objection handling | "Is this just a demo?" response framework with proof points |

---

*Last updated: July 2026 | Based on AWS blog post dated 17 June 2026*
