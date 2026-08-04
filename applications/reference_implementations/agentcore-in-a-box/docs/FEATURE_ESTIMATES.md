# Feature Estimates — Session Tabs & On-the-fly Model Switching

Two enhancements were scoped for the demo. Both are smaller than they sound
because the backend already supports the underlying behavior.

---

## 1. Session tabs (multiple concurrent sessions)

**Goal:** open several chat sessions at once for the *same* user to demonstrate
that **short-term (in-session) memory is isolated per session, while long-term
memory is shared across them**.

### Why this is mostly free on the backend
The agent already separates the two memory scopes by key:
- **Short-term**: `agent/main.py` keeps `_sessions[session_id]` — a per-session
  list of conversation turns. Different `session_id`s never see each other's turns.
- **Long-term**: `MemoryClient` stores/retrieves under `actor_id = user_id` (the
  Cognito `sub`), independent of session.

So two concurrent sessions for Alice already get **separate short-term context and
shared long-term memory** — exactly the demo — with **no agent or infrastructure
changes**.

### What the work actually is (frontend only)
- Maintain a tabs array: `[{ sessionId, title, messages[] }]` plus an active-tab index.
- Render only the active tab's messages; "New tab" starts a new session (`session_id` null → runtime assigns one).
- Route inbound WebSocket messages to the correct tab by `session_id`, so a reply
  for a background tab still updates that tab's stored messages (today the code
  assumes a single active session — this is the main change).
- Tab-bar UI (add/close/switch) + minimal CSS.

### Effort & risk
- **LOE: ~half a day** (~150–250 lines of JS + small CSS/HTML).
- **Risk: low** — pure static frontend, deploys via S3/CloudFront, no runtime redeploy.
- **Demo caveat:** long-term memory **extraction is async (~30–60s)** after a
  session's `create_event`. The "store a fact in tab A → recall in tab B" beat needs
  that window to elapse, so script it: store early, demonstrate recall a bit later.

---

## 2. On-the-fly model switching (e.g. Amazon Nova)

**Question:** does changing the model require rebuilding the container image, or can
we just call a different model from the agent?

**Answer: no image rebuild is needed to *switch* models.** The model is not baked
into the container in any structural way — the agent picks a model **per request**
when it calls the Bedrock Converse API. Today `agent/main.py` simply hardcodes
`MODEL_ID = 'us.anthropic.claude-haiku-4-5-...'`, which is the only reason switching
currently needs a code edit.

### Three ways to make it dynamic (increasing slickness)
1. **Env var** — read `MODEL_ID` from the environment; change it with
   `update-agent-runtime --environment`. No image rebuild, but it's a ~1–2 min
   runtime update and applies to all sessions at once.
2. **Per-request payload (recommended for the demo)** — the websocket Lambda forwards
   a `model_id` field; the agent reads it per message and passes it to `converse`.
   Make this change **once**, rebuild the image **once**, and thereafter switch
   models from a UI dropdown with **zero further rebuilds**. This is true
   "change on the fly."
3. **Both** — per-request override with an env-var default.

### Amazon Nova specifics
- Nova models work with the **Converse API** and support **tool use**, so they are
  drop-in compatible with the agent's existing tool loop.
- Caveats:
  - **Model access** for Nova must be enabled in Bedrock for the target region (us-west-2).
  - **Tool-calling behavior varies by model** — the demo prompts may behave a little
    differently (e.g. willingness to call tools, phrasing). Worth a quick rehearsal.
  - **"Nova 2"**: confirm the exact model ID when it is GA; the switching mechanism is
    identical regardless of which model ID is supplied.

### Effort & risk
- **LOE: ~1–2 hours** for option 2 (selectable model + frontend dropdown + one rebuild).
- **Risk: low–medium** — mechanically simple; the only variability is per-model
  tool-use quality, which is a demo-rehearsal concern, not an engineering blocker.

---

## Summary

| Feature | Backend change? | Image rebuild? | LOE | Risk |
|---|---|---|---|---|
| Session tabs (shared long-term, isolated short-term) | None | No | ~half day | Low |
| Model switch via env var | None (env only) | No | ~1 hr | Low |
| Model switch via per-request dropdown | Small (1 field) | Once | ~1–2 hr | Low–Med |

Both are good "wow" additions for the demo: session tabs makes the
short-vs-long-term memory distinction *visible side by side*, and live model
switching lets you show the same agent + tools running on Claude vs Nova without
touching infrastructure.
