# Assessment — Can Basic Mode fire real APIs without losing the narrative?

**Scope:** analysis only, nothing built. Sources reviewed: `src/data/basicModeContent.ts`,
`src/components/BasicMode/BasicModeView.tsx`, `src/api/*.ts`, `public/runtime-config.json`.

## TL;DR

**Yes — and it already does, partially.** Basic Mode is not a pure animation today: it already
fires **two real, deterministic calls** (Cedar `is-authorized` for the verdict, and the HITL
escalate/decision) with graceful fallback to scripted values. The right move is to **extend the
existing hybrid (Option C)**, firing only the *deterministic* governance calls live and keeping all
*LLM-generated text and risk scores scripted*. Recommendation: **C (hybrid), optionally layered
with D (background "Live Response" drawer) for technical audiences.** Do **not** wire the Bedrock
agent invoke into Basic Mode — that is the one call that would break the narrative.

> Correction to the brief's endpoint table: those were the old orphan endpoints. Current live
> values (from `runtime-config.json`): Cedar `xgkacmjesb`, HITL `tovdy9yzy9`, Grounding
> `mindupjlp8`, Registry `y2qtgiaujj`, Metrics `dfa5nbg508`, LLM-Judge `fpcxl7lf7l`.

## What is already live in Basic Mode (verified in code)

`BasicModeView.tsx` already does this:

- **Cedar verdict (Step 5+):** `useEffect` on `currentStep >= 4` calls
  `evaluateAuthorization(buildCedarPayload(scenario))` → `cedar-proxy /evaluate` → AVP
  `is-authorized`. Drives the **"✓ Verified live by Cedar — ALLOW / ⛔ DENY"** badge. On
  null (offline/CORS/timeout) the badge simply doesn't render and the scripted values stand.
- **HITL (Step 6, block path):** fires `POST /api/v1/hitl/escalate` when reaching the escalation
  step, and `POST /api/v1/hitl/decision` when the presenter clicks APPROVE/REJECT. Fire-and-forget;
  shows a "● Offline" note on failure.

So the pattern the brief asks about — *deterministic calls real, badge shows Live, scripted text
untouched, demo never breaks* — is already proven in the codebase. This de-risks extending it.

> ⚠️ **Gap found:** Basic Mode's HITL calls read `import.meta.env.VITE_HITL_API_URL` (build-time
> env), whereas the rest of the app reads the endpoint from `runtime-config.json` via `cfgEnv(...)`.
> On the deployed sites (which are configured through `runtime-config.json`, not baked VITE vars),
> the Basic-mode HITL call likely resolves to `undefined` → shows "Offline". The Cedar call is
> correct (uses `cfgEnv`). Fixing HITL to use `cfgEnv('hitl_api_url', ...)` is a one-line change
> that would make Step 6 genuinely live too.

## Per-step analysis

| Step | Controls lit | Candidate live call | Deterministic? | If it fails |
|------|--------------|---------------------|----------------|-------------|
| 1 Customer Profile Ingestion | guardrails-in, policy-engine | Bedrock agent invoke (profile fetch) | ❌ text/score vary | — do NOT wire |
| 2 Additional Data / UBO identity | deterministic, guardrails-in | (no real registry endpoint; Companies House is illustrative) | n/a | keep scripted |
| 3 Transaction / Risk score | deterministic | Lambda validator (recompute ratios) if exposed | ✅ pure math | fallback |
| 4 Specialist Assessment | llm-judge, grounding, guardrails-out | Grounding `/check-grounding` (mindupjlp8, now live); LLM-Judge `/llm-judge` | Grounding ✅ / Judge ⚠️ score-stable, text varies | fallback to scripted score |
| 5 Overall Assessment | policy-engine, deterministic, llm-judge, guardrails-out, grounding, automated-reasoning | **Cedar `/evaluate` (LIVE today)** + AR `/ar-check` | ✅ Cedar & AR deterministic | badge hidden, scripted stands |
| 6 Automated & Human Oversight | hitl, guardrails-out | **HITL escalate/decision (wired, needs cfgEnv fix)** | ✅ DB write | "Offline" note |
| 7 Decision & Audit | policy-engine, deterministic, guardrails-out, registry | Registry `/agents` (live) for tier/owner | ✅ static fetch | fallback |

## Determinism: which calls are safe

**Deterministic — identical inputs give identical outputs, safe to fire live:**
- **Cedar `is-authorized`** — pure policy evaluation. Acme (risk 22, sanctions 0, PEP 0, £100k) →
  ALLOW; Omega (risk 81, sanctions 92, PEP 3, £2.5M) → DENY via ORG-003/ORG-004. Every time. This
  is why it's already the wired one, and it's the single most important "this is real" moment.
- **Bedrock Guardrails contextual grounding** — for fixed source+response text the grounding/
  relevance scores are effectively stable (verified: grounded ≈ 1.0, contradictory → INTERVENED).
- **Lambda validators / Automated Reasoning `/ar-check`** — deterministic recomputation / proof.
- **HITL, Registry, Metrics** — data-store reads/writes, no model in the path.

**Non-deterministic — would break the scripted narrative, keep scripted:**
- **Bedrock agent invoke** (`agentcore.ts`) — the composite risk score, the agent conversation
  wording, and the summary all vary run-to-run. Also adds 30s poll + cold-start latency. This is
  Advanced Mode's job (`SimulationTab`), not Basic Mode's.
- **LLM-as-Judge free text** — the numeric score is fairly stable (~0.9x) but not pinned to the
  scripted "0.95", and the rationale text varies. Fire it for the *score/badge* only, never to
  replace the crafted one-liners.

## Recommendation: Option C (hybrid), optionally + D

Extend the hybrid that already exists. Concretely, in priority order:

1. **Fix Step 6 HITL to use runtime config** (one-liner) so it's genuinely live on deployed sites.
2. **Step 5 — add AR `/ar-check`** next to the existing Cedar call; badge "✓ Automated Reasoning: N rules checked".
3. **Step 4 — add Grounding `/check-grounding`** (endpoint now healthy at `mindupjlp8`); show the
   real grounding % with a Live badge, fall back to the scripted 94%.
4. **Step 7 — Registry `/agents`** to show the real agent tier/owner.
5. Keep **all agent conversation text, narratives, and the composite risk dials scripted.**
6. Show `DataSourceBadge` **● Live only on panels backed by a real deterministic call**; leave
   scripted text unbadged (honest signalling).

All of these already have the safe shape: 5–10s `AbortSignal.timeout`, `try/catch → return null`,
caller falls back to the scripted value. The presenter sees scripted content instantly; the Live
badge lights up asynchronously when the call returns. The demo cannot break mid-flow.

### Sketch — extending Step 5 (illustrative, NOT implemented)

```tsx
// alongside the existing evaluateAuthorization useEffect
const [liveAR, setLiveAR] = useState<ARResult | null>(null);
useEffect(() => {
  let cancelled = false;
  if (currentStep >= 4) {
    checkAutomatedReasoning(step.narrativeApprove /* or the claim text */)
      .then(r => { if (!cancelled) setLiveAR(r); });
  } else setLiveAR(null);
  return () => { cancelled = true; };
}, [currentStep, scenario]);
// render: {liveAR && <DataSourceBadge isLive /> } ✓ AR: {liveAR.checkedRules} rules, {liveAR.verdict}
```

### Sketch — the HITL cfgEnv fix (the one real bug)

```tsx
// today (build-time env — undefined on deployed site):
const hitlUrl = import.meta.env.VITE_HITL_API_URL;
// should be (runtime config, same as api/hitl.ts + api/cedar.ts):
import { cfgEnv } from '../../runtimeConfig';
const hitlUrl = cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
```

### Option D as a complement (optional)
Keep the scripted walkthrough exactly as-is for the audience, and add a collapsible **"Live API
Response"** drawer under each step that fires the deterministic call in the background and shows the
raw JSON for technical viewers. Pros: narrative stays pixel-perfect, DevTools shows real traffic,
zero risk to the story. Cons: extra UI; background failures must stay silent. This layers cleanly on
top of C and is the strongest answer to "prove it's real" for engineering audiences.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation (mostly already in place) |
|------|-----------|--------|--------------------------------------|
| Bedrock timeout during demo | Low* | High | *Only if agent-invoke were wired — recommendation is NOT to. Deterministic calls don't hit Bedrock inference. |
| Cedar returns unexpected result | Very low | High | Inputs are fixed per scenario; policy set is stable (19 policies). Already live and verified ALLOW/DENY. |
| LLM generates off-message text | N/A | High | Avoided — LLM text stays scripted; only scores/badges come from live judge. |
| Cold start adds 5–10s at Step 1 | Low | Low | Deterministic calls fire at Steps 4–7, not Step 1; scripted content renders instantly; badge is async. |
| CORS / auth failure mid-flow | Low | Low | All clients `try/catch → null → scripted fallback`. (Grounding CORS for `x-api-key` already fixed.) |

## Bottom line
Basic Mode can be "real" where it matters **without any narrative risk**, because the only calls we
make live are deterministic and every one degrades gracefully to the scripted value. This is already
true for Cedar; extend the same pattern to AR, Grounding, Registry, and fix the HITL env lookup.
Leave the Bedrock agent invoke and all crafted text scripted. Estimated blast radius for the full
Option C extension: ~1 file (`BasicModeView.tsx`) plus optional small badge tweaks — low regression
risk, no changes to `basicModeContent.ts` narrative text required.
