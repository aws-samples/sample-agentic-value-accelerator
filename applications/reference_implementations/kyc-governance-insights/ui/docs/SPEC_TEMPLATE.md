# Kiro Spec Template
# Use this template for ALL future build tasks. Copy and fill in.

---

# BUILD TASK: [Title]

**Priority:** [CRITICAL / HIGH / MEDIUM]
**Constraint:** Must satisfy ALL invariants in `.kiro/steering/architecture-invariants.md`
**Rule:** DO NOT break the demo. Acme -> APPROVE, Omega -> BLOCK must still work.

---

## Phase 0: Discovery (MANDATORY — do this BEFORE writing any code)

### Existing Infrastructure Relevant to This Task:
<!-- List what already exists. Search the codebase, check stacks, check routes. -->

| Component | Location | Status | Reuse? |
|-----------|----------|--------|--------|
| | | | |

### What Must NOT Be Rebuilt:
<!-- Explicit list from discovery. Reference architecture-invariants.md -->

### Dependencies:
<!-- What does this task depend on? What depends on this task? -->

---

## Intent

**WHAT:** [What are we building/changing]

**WHY:** [Why this matters — architectural principle or user need]

**LONG-TERM STRATEGY:** [Where this fits in the bigger picture]

---

## Tasks

### Task N: [Name]

**Current state:** [What exists today — be specific]

**Target state:** [What it should look like after — be specific]

**Invariants satisfied:** [List which invariants from the steering file this task addresses]

---

## Wiring Verification Gate (MANDATORY — task is NOT done until these pass)

Before marking this spec complete, provide evidence for EACH:

- [ ] Component X is CALLED by Y (CloudWatch log showing invocation / HTTP 200)
- [ ] No duplicate implementation exists (grep output proving single source of truth)
- [ ] Config is read from store at runtime (not hardcoded — show the read path)
- [ ] Auth is at the edge (show API Gateway authorizer config, not Lambda code)
- [ ] IaC is durable (show tfvars/params committed — clean deploy would reproduce)

---

## Standing Instructions

1. Read `.kiro/steering/architecture-invariants.md` BEFORE implementing
2. If a shortcut would violate an invariant -> STOP and flag, don't take it
3. Search for existing implementations BEFORE writing new code
4. Wire every connection — no stubs, no "TODO: connect later"
5. Verify end-to-end — "it exists" is not "it's called"
