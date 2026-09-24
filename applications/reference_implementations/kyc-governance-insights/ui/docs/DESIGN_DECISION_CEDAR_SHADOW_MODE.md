# Design Decision: Cedar Policy Cascade — Shadow Mode (Show-but-Don't-Block)

**Date:** 2026-07-16  
**Status:** DECIDED — do not change without stakeholder sign-off  
**Author:** Roshan Rao  
**Reviewers:** Kiro (code trace), V7 (architecture)

---

## Decision

The Cedar/AVP policy cascade operates in **shadow mode at runtime**: it evaluates policies and returns a deterministic ALLOW/DENY/ESCALATE decision, but it does **not** abort the AgentCore invocation on DENY. The decision is displayed in the UI and logged — never thrown as an exception.

**Do not add a runtime-abort enforce mode. This is deliberate.**

---

## Context

A Well-Architected Review flagged `POLICY_CASCADE_MODE: shadow` as a risk item (AI-HRI-1), suggesting it should be flipped to `enforce`. Investigation revealed:

1. The `POLICY_CASCADE_ENABLED` / `POLICY_CASCADE_MODE` env vars referenced in the WAR **do not exist** in this codebase.
2. The architecture already enforces in the meaningful sense — see below.

---

## Why Shadow Mode Is Correct

### "Enforce" means two different things:

| Sense | What it means | Status |
|-------|--------------|--------|
| **(a) Decision-level enforcement** | The governance layer (not the agent) produces the final APPROVE/ESCALATE/BLOCK. Agents cannot override it. | ✅ **Already true.** `governance.py` cascade → `_map_decision` → `AssessmentResponse.decision` is final. |
| **(b) Runtime abort** | A policy DENY throws/kills the invocation before a response is synthesized. | ❌ **Deliberately not implemented.** |

### Why (b) would be harmful:

1. **Demo resilience.** A false-deny or policy misfire during a live presentation kills the demo in front of a customer. The current design is deliberately resilient — errors fall back gracefully, BLOCK renders as a clean decision card ("⛔ BLOCKED by ORG-001 — sanctions match"), not an error/crash.

2. **The Omega showcase breaks.** The Advanced/Live Decision flow's showpiece is the Omega scenario: governance catches a high-risk entity and returns BLOCK. With runtime-abort, that clean "BLOCKED" decision card becomes an aborted stream that looks like a crash. You turn your best demo moment into what looks like a failure.

3. **Basic Mode is unaffected either way.** Its values come from `basicModeContent.ts`; the Cedar call is fire-and-forget with `null` fallback.

4. **The narrative doesn't require abort.** The slide deck (v8, Slide 11) says: "The Policy Engine prevents wrong answers from causing catastrophic damage — even when accuracy fails upstream." That's satisfied by decision-level enforcement (sense a). The audience sees a BLOCK decision with the policy ID and reason. They don't need the invocation to crash.

### Why (a) is already sufficient:

- `governance.py` evaluates ORG → APP → REQUEST policies in cascade
- Most restrictive wins (same semantics as IAM explicit-deny)
- Result becomes the `Decision` field of `AssessmentResponse`
- Agent response is tagged with the decision — cannot bypass it
- UI renders the decision deterministically (APPROVE / ESCALATE / BLOCK)
- Full audit trail in DynamoDB

---

## Relationship to "Config, not Code" Principle

Cedar policies in AVP are runtime-configurable. A business user adjusts a slider → Lambda calls AVP `CreatePolicy`/`DeletePolicy` → next agent evaluation uses the new policy. Sub-millisecond effect, no app redeployment.

This is the "config, not code" principle from the presentation (Slide 13). Shadow mode enables this to be demonstrated safely — you can show policy changes taking immediate effect without risking a mid-demo abort.

---

## Future Considerations

If a future version requires runtime-abort enforcement (e.g., for production deployment beyond demo):

1. It must be Advanced Mode only (Basic Mode stays resilient)
2. It must have a graceful DENY response template (not an error/exception)
3. It requires sign-off from the demo owner (Roshan) and architecture reviewer
4. The Omega BLOCK scenario must still render as a clean decision, not a crash
5. Consider: enforce for WRITE actions only (approveClaim, transferFunds), shadow for READ actions (fetchProfile, lookupPolicy)

---

## References

- `DESIGN_DECISION_PHASE3_CONTROLS_INLINE.md` — Phase 3 design intent (read-only dashboard, what-if)
- AWS Blog: [Why Policy in AgentCore chose Cedar](https://aws.amazon.com/pt/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/)
- Trend Micro: "respond to changing security requirements by updating policies without modifying agent code"
- WAR item AI-HRI-1: **Closed as N/A** — cascade already enforces at decision level

---

## TL;DR for Future Developers / Agents

**Q: "Why isn't Cedar in enforce mode? Should I fix this?"**

**A: No. It's shadow-evaluate-and-display by design. The cascade already determines the final decision (agents can't override BLOCK). Runtime-abort would break the live demo and add zero governance value. Read this doc before proposing changes.**
