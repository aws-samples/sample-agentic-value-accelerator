"""Strands-driven autonomous multi-agent swarm — the real-SDK port.

This module replaces the hand-rolled `bedrock_runtime.converse()` swarm loop with the
**Strands Agents SDK** (`strands.Agent` + `strands.multiagent.Swarm`). It exposes ONE
public coroutine generator — `run_swarm_events(...)` — that yields the SAME AG-UI
protocol event dicts the previous loop did, so the entrypoint, the WebSocket relay, and
the entire frontend are unchanged. "Built on Strands" is now literally true; the wire
contract is byte-for-byte identical.

WHY a translation layer instead of the off-the-shelf `ag-ui-strands` adapter: that
adapter emits only STANDARD AG-UI events and would drop the custom `__handoff`/`__agent`/
`__tool` keys our swarm-visualization depends on (smuggled through `ToolCallArgs.delta`,
which the frozen `agentClient.ts` forwards verbatim). So we drive Strands ourselves and
translate its typed stream events into our AG-UI frames, preserving those keys.

Strands 1.45.0 event contract this binds to (verified by introspection + live smoke test):
  swarm.stream_async(task) yields plain dicts:
    {"type":"multiagent_node_start","node_id","node_type"}
    {"type":"multiagent_node_stream","node_id","event": <inner agent event dict>}
    {"type":"multiagent_handoff","from_node_ids":[..],"to_node_ids":[..],"message":..}
    {"type":"multiagent_node_stop","node_id","node_result"}
    {"type":"multiagent_result","result"}
  inner agent event dicts (nested under node_stream "event"):
    {"data": <text>, "delta":..}                         -> text delta
    {"type":"tool_use_stream","current_tool_use":{toolUseId,name,input},"delta":..}
    {"message": <Message>} / {"result": <AgentResult>} / {"force_stop":..}
  AfterToolCallEvent hook (reliable per-tool result; the stream's tool_result is NOT in
  the callback path): fields agent, selected_tool, tool_use, result, exception.

3LO CONSENT GOTCHA: Strands catches exceptions raised inside a @tool and converts them to
an error tool-result — so AuthRequiredException can NOT bubble out the way it did in the
converse loop. Instead, the 3LO tools set a shared per-run auth holder and return a
sentinel; this module detects the holder, halts the swarm, and emits the auth_required
CUSTOM event + RUN_FINISHED without committing the session (identical UX).
"""
import asyncio
import json
import os
import threading
import uuid as _uuid

from ag_ui.core import (
    RunFinishedEvent,
    TextMessageStartEvent, TextMessageContentEvent, TextMessageEndEvent,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ToolCallResultEvent,
    CustomEvent, EventType,
)
from strands import Agent, tool as strands_tool
from strands.models import BedrockModel
from strands.multiagent import Swarm
from strands.hooks import (AfterToolCallEvent, BeforeInvocationEvent, BeforeToolCallEvent,
                            HookProvider, HookRegistry)

import personas  # pure-data persona registry + compile helpers (no strands import there)


def _ev(event):
    """Serialize an AG-UI event to its wire-form dict (camelCase via by_alias)."""
    return event.model_dump(mode='json', by_alias=True)


# Friendly names for the per-agent identity line (Auto/tiered mode). Kept local so this
# module stays importable without main.py; covers the ids the tier can resolve to.
_MODEL_DISPLAY = {
    'us.anthropic.claude-opus-4-8': 'Anthropic Claude Opus 4.8',
    'us.anthropic.claude-sonnet-5': 'Anthropic Claude Sonnet 5',
    'us.anthropic.claude-sonnet-4-6': 'Anthropic Claude Sonnet 4.6',
}


# ─────────────────────────────────────────────────────────────────────────────
# Swarm roster — same five specialists as the converse-loop version, mapped to the
# six AgentCore tools. Strands auto-injects a `handoff_to_agent(agent_name, message)`
# tool into every node; we do NOT hand-roll handoff pseudo-tools any more.
# Each entry: display name, the domain tool names it owns, its role text.
# ─────────────────────────────────────────────────────────────────────────────
# Per-agent model TIER (short keys, resolved against main.MODELS). Opus 4.8 is reserved
# for the agents that do genuine multi-step reasoning — Risk & Quant (evolutionary
# portfolio construction + risk analytics + bespoke Python), Credit Research (browse the
# live web and synthesize messy issuer/market context), Macro & Rates (reason about the
# curve/Fed path from live data) and Performance Attribution (decompose returns into
# carry/curve/credit/selection). The routing coordinator and the structured-tool
# specialists (Universe & Data, Compliance, Portfolio & Execution, ESG, Liquidity) run on
# the faster/cheaper Sonnet 5. This 'tier' applies ONLY when the PM leaves the sidebar
# model on "Auto"; picking a specific model overrides every agent (see _build_swarm).
# The per-persona roster, tool-capability table, and graph topology now live in
# personas.py. Both engines derive their per-request state from
# personas.compile_persona(persona_id) (the "pctx"), so nothing about the desk is a
# module global any more — that is what lets one container serve every vertical.


def _agent_key(node_id, key_by_name):
    """Resolve a Strands node_id (the agent .name) back to our short key, using the ACTIVE
    persona's name->key map (was the module-global _KEY_BY_NAME)."""
    return key_by_name.get(node_id, node_id)


# ─────────────────────────────────────────────────────────────────────────────
# HARD BUDGET CEILINGS (finding #3). All env-configurable with documented defaults, shared by
# BOTH engines so the swarm and graph enforce ONE budget notion (no cap drift):
#   MAX_HANDOFFS            max agent hand-offs (swarm)             default 12
#   MAX_ITERS              max swarm iterations                    default 28
#   MAX_GRAPH_NODES        max graph NODE EXECUTIONS (graph)       default 24
#   MAX_TOTAL_OUTPUT_TOKENS max cumulative OUTPUT tokens / invoke  default 120000
#   MAX_OUTPUT_TOKENS      per-generation output cap (per agent)   default 16000
# When any cap is hit the engine stops GRACEFULLY and emits a 'budget_exhausted' event rather
# than continuing. The structural caps (hops/iters/nodes) are deterministic; the token ceiling
# is accumulated best-effort from the SDK's per-message usage (see _RunBudget.add_usage).
# ─────────────────────────────────────────────────────────────────────────────
# With the routing directory in place, simple requests still take 0-1 hand-offs (the prompt
# keeps single-focus work on the fast path). The headroom covers a full multi-faceted chain
# that fans across specialists and CONVERGES on the Investment Committee, e.g.
# macro → analytics → attribution → esg → liquidity → trading → committee (~6-7 hops, each
# agent possibly making several tool calls) — so the ceilings are lifted accordingly.
MAX_HANDOFFS = int(os.environ.get('MAX_HANDOFFS', '12'))
MAX_ITERS = int(os.environ.get('MAX_ITERS', '28'))
# Max graph NODE EXECUTIONS before we stop the DAG (the graph analogue of MAX_ITERS — a fixed
# DAG can't infinite-loop, but this bounds a pathological/large topology under one budget knob).
MAX_GRAPH_NODES = int(os.environ.get('MAX_GRAPH_NODES', '24'))
# Cumulative OUTPUT-token ceiling for the WHOLE invocation, across every agent/node. The hard
# cost guard: even if the structural caps allow many hops, the run stops once it has produced
# this many output tokens in aggregate. Generous default so normal multi-agent runs complete.
MAX_TOTAL_OUTPUT_TOKENS = int(os.environ.get('MAX_TOTAL_OUTPUT_TOKENS', '120000'))
# Whole-swarm wall clock — the SYNCHRONOUS/vanilla path. MUST stay under the WebSocket
# bridge's 290s read timeout (lambda/websocket/index.py) so the swarm fails its OWN graceful
# timeout (emitting the "couldn't converge" notice cleanly) rather than the bridge severing
# the socket mid-run. Mirrors GRAPH_EXEC_TIMEOUT=280.
EXEC_TIMEOUT = 280.0
NODE_TIMEOUT = 120.0   # per-node (s)

# LONG-RUNNING (async background-job) budgets. On the start/poll path the run is decoupled
# from any HTTP request — the runtime keeps the microVM alive via /ping HealthyBusy — so the
# only ceiling is the 8h microVM maxLifetime. We target ~2h whole-run with generous per-node
# headroom, well under 8h so the run always ends on its OWN terms (graceful notice) rather than
# the microVM being reaped mid-synthesis. The per-tool loop cap (PER_TOOL_BUDGET) still bounds
# any single node, so "generous" never means "runaway". Overridable via env for tuning.
LONG_EXEC_TIMEOUT = float(os.environ.get('LONG_EXEC_TIMEOUT', str(2 * 3600)))   # whole-run (s) ~2h
LONG_NODE_TIMEOUT = float(os.environ.get('LONG_NODE_TIMEOUT', str(20 * 60)))    # per-node (s) 20m

# Graph engine budgets. The DAG ALWAYS runs the full 5-layer pipeline (unlike the swarm,
# which rarely chains >1 hop), and each node is bounded by the TOOL_BUDGET loop cap above —
# so we give a node more wall-clock headroom while keeping the whole-graph budget safely
# under the 290s WebSocket-bridge read timeout (lambda/websocket) so the graph fails its own
# node gracefully rather than the bridge cutting the socket. Overridable via env for tuning.
GRAPH_NODE_TIMEOUT = float(os.environ.get('GRAPH_NODE_TIMEOUT', '180'))   # per-node (s)
GRAPH_EXEC_TIMEOUT = float(os.environ.get('GRAPH_EXEC_TIMEOUT', '280'))   # whole-graph (s)

# Per-generation output-token ceiling for EVERY agent. BedrockModel defaults max_tokens to
# None → Bedrock applies a low per-request default (~4096 for Claude), which TRUNCATED the
# Investment Committee's synthesis memo mid-write (it reasons over all upstream outputs) and
# raised MaxTokensReachedException. Lift it to a generous ceiling so the final memo and any
# long structured result complete. Well within Claude's max output window. Applied via the
# `max_tokens` DIRECT kwarg (NOT model_config, which BedrockModel silently ignores).
MAX_OUTPUT_TOKENS = int(os.environ.get('MAX_OUTPUT_TOKENS', '16000'))


# ─────────────────────────────────────────────────────────────────────────────
# Per-run auth holder for the 3LO consent flow (see module docstring). One instance
# per invoke; shared by closure into the 3LO tools and read by the stream loop.
# ─────────────────────────────────────────────────────────────────────────────
class _AuthHolder:
    __slots__ = ('auth_url', 'pending')

    def __init__(self):
        self.auth_url = None
        self.pending = False

    def require(self, url):
        self.auth_url = url
        self.pending = True


# Sentinel a 3LO tool returns to the model when consent is needed, so the model
# doesn't keep trying. The stream loop halts on auth_holder.pending regardless.
_AUTH_SENTINEL = json.dumps({
    'status': 'auth_required',
    'message': 'User consent is required before this can proceed. Stop and wait for authorization.',
})


class _ToolResultCapture(HookProvider):
    """Capture each tool's real result keyed by toolUseId — the stream's tool_result
    event is NOT delivered to the callback path, so this hook is the reliable source
    for AG-UI TOOL_CALL_RESULT. We stash into a dict the stream loop drains.

    For calls the budget hook cancelled (toolUseId in the shared `cancelled` set), Strands
    hands us the cancel INSTRUCTION as the result — which is a prompt for the model, not tool
    output. Storing it verbatim made the guardrail text render as the RESULT of the Gateway /
    sandbox tools (they looked like they errored). We substitute an honest guardrail note."""

    def __init__(self, results_by_id, cancelled=None):
        self._results = results_by_id
        self._cancelled = cancelled if cancelled is not None else set()

    def register_hooks(self, registry: HookRegistry, **kwargs):
        registry.add_callback(AfterToolCallEvent, self._after)
        # Clear the handoff stop-flag at the START of every node's turn — see _before_invocation.
        registry.add_callback(BeforeInvocationEvent, self._before_invocation)

    def _before_invocation(self, event: BeforeInvocationEvent):
        # CRITICAL companion to the stop_event_loop set in _after: the Swarm passes the SAME
        # invocation_state dict to EVERY node (verified in swarm.py _execute_node), so the
        # stop_event_loop=True we set to end the handing-off node's loop LEAKS into the next
        # node — the target specialist then calls its tool, gets data, and is stopped BEFORE it
        # can synthesize (observed: handoff fires, curve_lookup runs, then "couldn't converge"
        # with the data already fetched). Reset the flag as each node begins so a fresh node is
        # never poisoned by the previous node's handoff. Best-effort; never break a run.
        try:
            rs = event.invocation_state.get('request_state')
            if isinstance(rs, dict) and rs.get('stop_event_loop'):
                rs['stop_event_loop'] = False
        except Exception as e:
            print(f'HANDOFF reset-loop hook skipped: {type(e).__name__}: {e}', flush=True)

    def _after(self, event: AfterToolCallEvent):
        tu = event.tool_use or {}
        # ── Break the handoff → re-handoff recursion (the swarm "couldn't converge" bug). ──
        # Strands' handoff_to_agent only sets swarm.state.handoff_node; it does NOT stop the
        # handing-off node's OWN agent loop. So after the tool returns "success", the same node
        # is re-prompted, hands off AGAIN, and recurses until the event loop blows its stack
        # ("maximum recursion depth exceeded") — the node never yields a clean result, so the SDK
        # never emits multiagent_handoff and the target specialist never runs. Verified live +
        # reproduced: the orchestrator emitted N identical handoffs to "Macro & Rates" and the run
        # ended with the "couldn't converge" fallback (handoffs=0 reached the client).
        # FIX: the instant a handoff is issued, tell THIS node's event loop to stop after this
        # cycle (request_state.stop_event_loop — honored at event_loop.py). The node completes
        # cleanly, the SDK processes the pending handoff, and control moves to the target agent.
        if tu.get('name') == 'handoff_to_agent':
            try:
                event.invocation_state.setdefault('request_state', {})['stop_event_loop'] = True
            except Exception as e:  # never let the hook break a run
                print(f'HANDOFF stop-loop hook skipped: {type(e).__name__}: {e}', flush=True)
        tcid = tu.get('toolUseId')
        if not tcid:
            return
        # A budget-cancelled call was never really executed — don't leak the cancel
        # instruction as if it were tool output; show the honest guardrail note instead.
        if tcid in self._cancelled:
            self._results[tcid] = _BUDGET_CANCEL_NOTE
            return
        # event.result is a ToolResult dict {toolUseId, status, content:[{text:...}]}.
        payload = None
        try:
            if event.exception is not None:
                payload = json.dumps({'error': str(event.exception)})
            else:
                res = event.result or {}
                content = res.get('content') or []
                texts = [c['text'] for c in content if isinstance(c, dict) and 'text' in c]
                payload = '\n'.join(texts) if texts else json.dumps(res, default=str)
        except Exception as e:  # never let the hook break a run
            payload = json.dumps({'error': f'result-capture failed: {e}'})
        self._results[tcid] = payload


# Per-node ceiling on domain-tool calls. A Strands inner Agent has NO agentic-loop cap —
# it keeps calling tools until it emits `end_turn` or hits the wall-clock node_timeout. On a
# heavy mandate a data-heavy node (e.g. Universe & Data screening the ~3,000-bond universe)
# can loop on bond_screen/price_bond/curve_lookup and burn the whole node_timeout, which in
# the fail-fast Graph aborts the ENTIRE run with a raw "Node '…' timed out" error — and in the
# Swarm terminates the whole run with NO final answer (the "couldn't converge" apology). This
# hook caps the loop deterministically: once a node has made TOOL_BUDGET real tool calls,
# further calls are cancelled with a message that tells the model to stop and answer from what
# it has. Registered on BOTH engines (see _build_swarm / _build_graph hooks).
TOOL_BUDGET = 12
# The async long-running path runs on a 20-min node ceiling (LONG_NODE_TIMEOUT), so a genuine
# desk review legitimately makes MANY cheap governed calls (bond_screen/curve_lookup/positions
# via the Gateway, code-interpreter runs) before it synthesizes. A flat cap of 12 fires on those
# and — worse — the cancel showed up in the timeline as the "result" of the Gateway/sandbox tools,
# making the demo's flagship integrations look like they errored. Lift the OVERALL backstop well
# clear of a real review on the long path; the tight PER-TOOL caps below are the actual runaway guard.
LONG_TOOL_BUDGET = 40

# Tighter PER-TOOL ceilings for expensive, loop-prone tools. Each AgentCore Browser fetch is
# ~20-30s (page load + network-idle + table wait + recording flush), so a specialist that
# browses 5-6 URLs blows the whole NODE_TIMEOUT (120s) before it can synthesize — the swarm
# then ends with no answer (observed live: 6× web_browser, 2m11s, no output). Cap the pricey
# tools per node WELL below what the node_timeout can afford (3 × ~28s ≈ 84s, leaving room to
# write the answer) so the model is forced to answer from what it gathered instead of churning.
PER_TOOL_BUDGET = {
    'web_browser': 3,
}
# On the long path (20-min nodes) the browser has far more headroom (8 × ~28s ≈ 224s ≪ 20m),
# so allow deeper research while still bounding the loop hard enough to leave synthesis time.
LONG_PER_TOOL_BUDGET = {
    'web_browser': 8,
}


class _ToolBudget(HookProvider):
    """Cancel a node's tool calls once it has spent its per-node budget, so a runaway
    tool-calling loop degrades into 'answer with what you have' instead of timing out the
    whole run. Counts per node/agent instance (id()) so parallel nodes budget independently.
    Enforces TWO ceilings: a tight PER-TOOL cap for expensive tools (web_browser) checked
    first, and an overall per-node cap for everything else. The auto-injected handoff_to_agent
    tool is NEVER counted or cancelled — routing must always remain available.

    IMPORTANT — the `cancel_tool` string is an INSTRUCTION to the model, not tool output.
    Strands returns it as the tool's result, and _ToolResultCapture would otherwise stash it
    so it renders as the tool's RESULT in the timeline (observed: the guardrail text appearing
    as the "result" of Bond Screen (Gateway) and Code Interpreter, making them look like they
    failed). We record every cancelled toolUseId in the shared `cancelled` set so the capture
    hook and the stream translator can substitute an honest guardrail note instead of leaking
    the raw instruction — the tool was never actually run."""

    def __init__(self, budget=TOOL_BUDGET, per_tool=None, cancelled=None, blocked_agent_names=None):
        self._budget = budget
        self._per_tool = PER_TOOL_BUDGET if per_tool is None else per_tool
        self._cancelled = cancelled if cancelled is not None else set()  # toolUseIds we cancelled
        self._counts = {}       # id(agent) -> total domain-tool calls
        self._tool_counts = {}  # (id(agent), tool_name) -> calls of that specific tool
        # Per-AGENT access (entitlements `agents` dimension): DISPLAY NAMES of specialists this
        # user may not invoke. Revoked specialists are already pruned from the swarm nodes (so
        # Strands can't resolve a handoff to them), so this is defense-in-depth — it turns a
        # would-be handoff into an explicit, honest denial instead of an SDK resolution error.
        self._blocked_agent_names = set(blocked_agent_names or ())

    def register_hooks(self, registry: HookRegistry, **kwargs):
        registry.add_callback(BeforeToolCallEvent, self._before)

    def _before(self, event: BeforeToolCallEvent):
        try:
            tu = event.tool_use or {}
            tool_name = tu.get('name', '')
            # Never throttle routing — only real domain tools loop. But DO deny a handoff to a
            # specialist the user isn't entitled to invoke (belt-and-suspenders behind pruning).
            if tool_name == 'handoff_to_agent':
                if self._blocked_agent_names:
                    target = ((tu.get('input') or {}).get('agent_name') or '').strip()
                    if target in self._blocked_agent_names:
                        self._mark_cancelled(tu)
                        event.cancel_tool = (
                            f"Access denied: you are not granted the '{target}' specialist on this "
                            f"desk. Route to a specialist you are entitled to, or ask your "
                            f"administrator to grant it in the Access Control console.")
                return
            if tool_name == '':
                return
            key = id(event.agent)
            # 1) PER-TOOL cap first (tighter — catches the browser loop that starves the node).
            cap = self._per_tool.get(tool_name)
            if cap is not None:
                tk = (key, tool_name)
                tn = self._tool_counts.get(tk, 0) + 1
                self._tool_counts[tk] = tn
                if tn > cap:
                    self._mark_cancelled(tu)
                    event.cancel_tool = (
                        f"You have already called {tool_name} {cap} times — that is enough. Do "
                        "NOT call it again. Answer now from the data you already gathered; if "
                        "something is still missing, say so explicitly rather than browsing more.")
                    return
            # 2) Overall per-node cap for everything else.
            n = self._counts.get(key, 0) + 1
            self._counts[key] = n
            if n > self._budget:
                self._mark_cancelled(tu)
                event.cancel_tool = (
                    f"Tool-call budget reached ({self._budget} calls). Stop calling tools now "
                    "and return your best structured result from the data you already gathered.")
        except Exception as e:  # never let the budget hook break a run
            print(f'TOOL BUDGET hook skipped: {type(e).__name__}: {e}', flush=True)
            return

    def _mark_cancelled(self, tool_use):
        tcid = (tool_use or {}).get('toolUseId')
        if tcid:
            self._cancelled.add(tcid)


# What the timeline shows for a call the budget hook cancelled — an honest guardrail note in
# place of the internal cancel instruction. Keyed nowhere; the frontend just renders the text.
_BUDGET_CANCEL_NOTE = ('Skipped by the tool-call guardrail — this agent had already reached its '
                       'call budget for this step, so the call was not executed. The agent '
                       'answered from data it had already gathered.')


class _RunBudget:
    """Single shared budget notion for ONE invocation, enforced by BOTH engines so caps never
    drift between the swarm and graph. Tracks the structural counters (hand-offs, iterations /
    node executions) and the cumulative OUTPUT-token spend. `exhausted()` returns the first cap
    hit (or None); the stream loop stops gracefully and emits a 'budget_exhausted' event.

    Token accounting is best-effort: the SDK reports per-message usage in the inner stream
    events; add_usage() scrapes outputTokens from whatever shape is present (dicts differ by
    model), so an unparseable usage block simply isn't counted rather than crashing the run."""
    __slots__ = ('handoffs', 'iters', 'nodes', 'output_tokens',
                 'max_handoffs', 'max_iters', 'max_nodes', 'max_output_tokens')

    def __init__(self, max_handoffs=MAX_HANDOFFS, max_iters=MAX_ITERS,
                 max_nodes=MAX_GRAPH_NODES, max_output_tokens=MAX_TOTAL_OUTPUT_TOKENS):
        self.handoffs = 0
        self.iters = 0
        self.nodes = 0
        self.output_tokens = 0
        self.max_handoffs = max_handoffs
        self.max_iters = max_iters
        self.max_nodes = max_nodes
        self.max_output_tokens = max_output_tokens

    def add_usage(self, inner):
        """Accumulate output tokens from an inner agent event, if it carries a usage block."""
        try:
            usage = _find_usage(inner)
            if usage:
                self.output_tokens += int(
                    usage.get('outputTokens') or usage.get('output_tokens') or 0)
        except Exception:
            pass

    def exhausted(self):
        """Return a short reason string for the first cap exceeded, else None."""
        if self.output_tokens > self.max_output_tokens:
            return f'output-token budget ({self.max_output_tokens}) exhausted'
        if self.handoffs > self.max_handoffs:
            return f'hand-off budget ({self.max_handoffs}) exhausted'
        if self.iters > self.max_iters:
            return f'iteration budget ({self.max_iters}) exhausted'
        if self.nodes > self.max_nodes:
            return f'graph-node budget ({self.max_nodes}) exhausted'
        return None


def _find_usage(obj, _depth=0):
    """Best-effort search for a token-usage dict (has an outputTokens/output_tokens key) inside
    a nested Strands event dict. Bounded depth so a pathological structure can't spin."""
    if _depth > 6 or not isinstance(obj, dict):
        return None
    if 'outputTokens' in obj or 'output_tokens' in obj:
        return obj
    for v in obj.values():
        if isinstance(v, dict):
            found = _find_usage(v, _depth + 1)
            if found:
                return found
    return None


def _budget_exhausted_events(reason):
    """AG-UI frames for a graceful budget stop: a CUSTOM 'budget_exhausted' marker (for any
    telemetry) plus a clean final text message so the run still closes with a visible answer.
    Rides the frozen event contract (CustomEvent + TEXT_MESSAGE_*) — no new event type."""
    yield _ev(CustomEvent(type=EventType.CUSTOM, name='budget_exhausted',
                          value={'reason': reason}))
    msg_id = _uuid.uuid4().hex
    yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role='assistant'))
    yield _ev(TextMessageContentEvent(
        type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id,
        delta=("I stopped this run early to stay within the configured budget "
               f"({reason}). Here is where the desk got to — please narrow the request "
               "or ask for one thing at a time to continue.\n\n"
               "*The run reached its budget ceiling and halted gracefully.*")))
    yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))


def _build_tools(execute_tool, tool_names, user_id, user_jwt, force_reauth, auth_holder, pctx=None):
    """Wrap the existing AgentCore tool implementations as Strands @tool callables.

    `execute_tool` is the async fn from main.py (unchanged) that performs the real
    AgentCore work (gateway SigV4, browser-over-CDP, code-interpreter, 3LO identity).
    We bind per-request identity + the auth holder via closure (verified pattern). The
    @tool docstrings/signatures mirror the original toolSpec schemas so the model gets
    the same affordances. Tools that need 3LO consent set the auth holder + return the
    sentinel instead of raising (Strands would swallow a raise into an error result).

    `pctx` is the compiled persona context (personas.compile_persona). A handful of SHARED
    tools (secure_vault / market_data / macro_indicator / positions_view / trade_execute)
    have ONE implementation but describe themselves differently per desk — an insurance
    `trade_execute` binds a policy; a fintech one freezes a card. Rather than duplicate the
    closures per persona, we build them ONCE (CM-worded docstring = the default) and, when a
    persona declares an override in personas.TOOL_SPEC_OVERRIDES, rewrite that tool's
    description/inputSchema via Strands' tool_spec setter so the model sees the desk's own
    language and its real, in-scope arguments. The backend routes by dataset/series/secret
    NAME (all globally unique), so no persona has to be threaded into execute_tool — only the
    description the model reads changes. Passing pctx=None keeps the CM defaults verbatim."""

    async def _run(name, inp):
        """Invoke the real tool; convert a 3LO AuthRequiredException into the
        shared-auth-holder + sentinel pattern.

        IMPORTANT — DON'T match the exception by class identity. The container launches the
        agent as `python main.py`, so main is the `__main__` module; this module does
        `import swarm_strands` which (re)imports main as `main`. That makes TWO distinct
        `AuthRequiredException` classes (`__main__.AuthRequiredException` raised vs
        `main.AuthRequiredException`), so `except main.AuthRequiredException` MISSES the
        raised one and it escapes as a generic tool error (verified live). Instead we
        duck-type on the `.auth_url` attribute, which both copies carry."""
        try:
            return await execute_tool({'name': name, 'input': inp}, user_id, user_jwt, force_reauth)
        except Exception as e:
            if e.__class__.__name__ == 'AuthRequiredException' or hasattr(e, 'auth_url'):
                auth_holder.require(getattr(e, 'auth_url', None))
                return {'status': 'auth_required'}
            raise

    built = {}

    # NOTE: tools are ASYNC. Strands runs async @tools on the main event loop (verified),
    # so they can `await execute_tool` directly — avoiding the nested-event-loop fragility
    # of calling asyncio.run() from a sync tool on a worker thread.
    @strands_tool
    async def secure_vault(secret_name: str, name: str = '') -> str:
        """Retrieve a restricted control value held only by the Secure Vault Lambda, OR screen a
        person/entity name against a synthetic/demo watchlist — via AgentCore Gateway, subject to
        Cedar policy. Values/lists are held only by the Lambda; you cannot know them without this
        tool, and access may be blocked by policy.

        Two modes:
          • Retrieval — pass secret_name = one of restricted_list, bloomberg_terminal_pin,
            oms_master_pin, counterparty_credit_memo. Returns the value, quoted verbatim.
          • Screening — pass secret_name = one of sanctions_watchlist, pep_list, fraud_blocklist
            AND a `name`. Returns a deterministic CLEAR / MATCH / HOLD verdict against that
            synthetic/demo list (an unscreenable name is a HOLD, never a silent pass).

        Args:
            secret_name: Which value to retrieve, or which watchlist to screen against. One of:
                restricted_list, bloomberg_terminal_pin, oms_master_pin, counterparty_credit_memo,
                sanctions_watchlist, pep_list, fraud_blocklist.
            name: Optional. A person/entity name to screen against the chosen watchlist
                (sanctions_watchlist / pep_list / fraud_blocklist). Omit for a plain retrieval.
        """
        args = {'secret_name': secret_name}
        if name:
            args['name'] = name
        r = await _run('secure_vault', args)
        return json.dumps(r)
    built['secure_vault'] = secure_vault

    @strands_tool
    async def user_data_lookup(data_type: str) -> str:
        """Look up the signed-in portfolio manager's own directory data via AgentCore Gateway.
        Returns their profile, the funds/portfolios they manage, or preferences.

        Args:
            data_type: Type of data to retrieve. One of: profile, preferences, portfolios, all.
        """
        r = await _run('user_data_lookup', {'data_type': data_type})
        return json.dumps(r)
    built['user_data_lookup'] = user_data_lookup

    @strands_tool
    async def web_browser(url: str) -> str:
        """Browse a website using AgentCore Browser to retrieve live market information
        (e.g. Treasury yields, FOMC statements).

        Args:
            url: The URL to browse.
        """
        r = await _run('web_browser', {'url': url})
        return json.dumps(r)
    built['web_browser'] = web_browser

    @strands_tool
    async def code_interpreter(code: str) -> str:
        """Execute Python code using AgentCore Code Interpreter for portfolio analytics
        (e.g. Sharpe ratio, max drawdown, duration, weighted average yield).

        Args:
            code: Python code to execute.
        """
        r = await _run('code_interpreter', {'code': code})
        return json.dumps(r)
    built['code_interpreter'] = code_interpreter

    @strands_tool
    async def positions_view(fund_name: str) -> str:
        """View the holdings/positions in one of the signed-in PM's funds (or all funds) from the
        Portfolio API. Uses AgentCore Identity 3-legged OAuth (portfolio-api/read scope) so the
        agent reads only the calling PM's funds, on their behalf. The first use requires the PM to
        authorize access in their browser.

        Args:
            fund_name: Fund to view, e.g. 'Core Bond Fund', or 'all' for every fund the PM manages.
        """
        r = await _run('positions_view', {'fund_name': fund_name})
        if auth_holder.pending:
            return _AUTH_SENTINEL
        return json.dumps(r)
    built['positions_view'] = positions_view

    @strands_tool
    async def trade_execute(fund_name: str, ticker: str, side: str, target_allocation: str) -> str:
        """Execute a trade / rebalance in one of the signed-in PM's funds — sets a new target
        allocation for an instrument. WRITE action requiring a SEPARATE portfolio-api/trade consent
        (viewing positions does not grant trading). Performed on behalf of the PM via an AgentCore
        Identity delegated OAuth token; every execution is audit-logged.

        Args:
            fund_name: Fund to trade in, e.g. 'Core Bond Fund'.
            ticker: Instrument / ticker, e.g. 'TLT' or 'UST 10Y'.
            side: 'buy' or 'sell'.
            target_allocation: New target weight for this instrument after the trade, e.g. '18%'.
        """
        r = await _run('trade_execute', {
            'fund_name': fund_name, 'ticker': ticker, 'side': side,
            'target_allocation': target_allocation})
        if auth_holder.pending:
            return _AUTH_SENTINEL
        return json.dumps(r)
    built['trade_execute'] = trade_execute

    # ── Fixed-income tools (real ~3,000-bond universe + analytics + evolutionary build) ──
    @strands_tool
    async def bond_screen(sector: str = '', min_rating: str = '', max_rating: str = '',
                          min_yield: float = None, max_yield: float = None,
                          min_duration: float = None, max_duration: float = None,
                          issuer: str = '', exclude_treasury: bool = False,
                          sort_by: str = 'ytm', limit: int = 25) -> str:
        """Screen the firm's ~3,000-bond universe (real US issuers; yields/durations computed
        off the live Treasury curve + ICE BofA credit spreads). All filters optional.

        Args:
            sector: e.g. 'Financials', 'Technology', 'Energy', 'Treasury' (exact sector name).
            min_rating: best-or-equal floor, e.g. 'BBB' keeps BBB and better (AAA..BBB).
            max_rating: worst-or-equal cap, e.g. 'BB' keeps BB and worse.
            min_yield / max_yield: yield-to-maturity bounds in percent.
            min_duration / max_duration: modified-duration bounds in years.
            issuer: substring match on issuer name or ticker.
            exclude_treasury: drop US Treasuries when True.
            sort_by: one of ytm, mod_duration, oas, convexity, years, liquidity.
            limit: max bonds to return (<=100).
        """
        args = {'sector': sector, 'min_rating': min_rating, 'max_rating': max_rating,
                'min_yield': min_yield, 'max_yield': max_yield, 'min_duration': min_duration,
                'max_duration': max_duration, 'issuer': issuer,
                'exclude_treasury': exclude_treasury, 'sort_by': sort_by, 'limit': limit}
        return json.dumps(await _run('bond_screen', args))
    built['bond_screen'] = bond_screen

    @strands_tool
    async def curve_lookup() -> str:
        """Return the real US Treasury par-yield curve (tenor → yield), with the as-of date and
        source (FRED constant-maturity). Use for rates/curve questions and to anchor pricing."""
        return json.dumps(await _run('curve_lookup', {}))
    built['curve_lookup'] = curve_lookup

    @strands_tool
    async def spread_lookup() -> str:
        """Return the real ICE BofA option-adjusted credit-spread ladder by rating (AAA…CCC),
        with as-of date and source (FRED). Use to reason about credit risk premia."""
        return json.dumps(await _run('spread_lookup', {}))
    built['spread_lookup'] = spread_lookup

    @strands_tool
    async def price_bond(years: float, rating: str = 'A', coupon: float = None) -> str:
        """Value a hypothetical bond off the live Treasury curve + the rating's OAS. Returns
        treasury base, OAS, yield-to-maturity, clean price, modified duration, and convexity.

        Args:
            years: maturity in years.
            rating: credit rating (AAA..CCC); sets the OAS added to the curve.
            coupon: annual coupon in percent; if omitted, prices at par (coupon = ytm).
        """
        args = {'years': years, 'rating': rating}
        if coupon is not None:
            args['coupon'] = coupon
        return json.dumps(await _run('price_bond', args))
    built['price_bond'] = price_bond

    @strands_tool
    async def portfolio_risk(holdings_json: str, duration_target: float = None) -> str:
        """Aggregate risk for a set of holdings: weighted duration, convexity, yield, OAS,
        rating & sector mix, duration gap + yield pickup vs the US Agg, and rate-shock P&L
        (+/-100/200bps).

        Args:
            holdings_json: JSON array of holdings, e.g.
                '[{"ticker":"JPM","weight":0.1},{"cusip":"...","weight":0.05}]'.
                Weights are normalized; cusip or ticker both resolve against the universe.
            duration_target: optional target duration (years) to report the gap against.
        """
        try:
            holdings = json.loads(holdings_json) if isinstance(holdings_json, str) else holdings_json
        except Exception:
            return json.dumps({'error': 'holdings_json must be a JSON array of {cusip|ticker, weight}'})
        args = {'holdings': holdings}
        if duration_target is not None:
            args['duration_target'] = duration_target
        return json.dumps(await _run('portfolio_risk', args))
    built['portfolio_risk'] = portfolio_risk

    @strands_tool
    async def evolve_portfolio(duration_target: float = 6.0, rating_floor: str = 'BBB',
                               allow_high_yield: bool = False, max_sector_weight: float = 0.30,
                               max_issuer_weight: float = 0.05, n_bonds: int = 25,
                               yield_weight: float = 1.0, risk_weight: float = 1.0) -> str:
        """Run an EVOLUTIONARY search over portfolio-construction recipes against the PM's
        mandate, on the real bond universe (sandboxed Python in AgentCore Code Interpreter,
        with a Lambda fallback). Returns a fitness-by-generation curve, a leaderboard of
        candidate portfolios, and the WINNING portfolio (holdings + metrics: yield, duration,
        convexity, tracking error vs the Agg, rate-shock P&L, rating/sector mix). Use this when
        the PM wants to BUILD, optimize, or rebalance a fixed-income portfolio to a mandate.

        Args:
            duration_target: target modified duration in years (e.g. 6.0 to track the Agg).
            rating_floor: lowest acceptable rating (e.g. 'BBB' for investment-grade only).
            allow_high_yield: permit sub-investment-grade (BB and below) bonds.
            max_sector_weight: cap on any one sector (fraction, e.g. 0.30).
            max_issuer_weight: cap on any one issuer (fraction, e.g. 0.05).
            n_bonds: approximate number of holdings to build toward.
            yield_weight: objective tilt toward yield (higher = reach for more yield).
            risk_weight: objective tilt toward risk control (higher = hug duration/benchmark).
        """
        mandate = {'duration_target': duration_target, 'rating_floor': rating_floor,
                   'allow_high_yield': allow_high_yield, 'max_sector_weight': max_sector_weight,
                   'max_issuer_weight': max_issuer_weight, 'n_bonds': n_bonds,
                   'yield_weight': yield_weight, 'risk_weight': risk_weight}
        return json.dumps(await _run('evolve_portfolio', {'mandate': mandate}))
    built['evolve_portfolio'] = evolve_portfolio

    # ── AgentCore Identity: M2M (machine) + API-key vault ──
    # No per-user consent — these never set the auth holder or return the sentinel.
    @strands_tool
    async def market_data(dataset: str = 'curve') -> str:
        """Pull LICENSED market/reference data from the firm's market-data vendor via AgentCore
        Identity machine-to-machine (client_credentials) — the agent authenticates as MERIDIAN'S
        APPLICATION, not a user, so no consent is needed. Use for a governed, application-licensed
        source of the curve / spreads / issuer reference.

        Args:
            dataset: 'curve' (Treasury par-yield), 'spreads' (ICE BofA OAS ladder), or
                'reference' (issuer master).
        """
        return json.dumps(await _run('market_data', {'dataset': dataset}))
    built['market_data'] = market_data

    @strands_tool
    async def macro_indicator(indicator: str = 'CPI') -> str:
        """Fetch a LIVE macroeconomic series from FRED, using a key retrieved at call time from
        the AgentCore Identity API-key vault (never a plaintext credential in the agent).

        Args:
            indicator: one of CPI, unemployment, fed_funds, core_pce, 10y.
        """
        return json.dumps(await _run('macro_indicator', {'indicator': indicator}))
    built['macro_indicator'] = macro_indicator

    # ── Per-vertical governed tools (insurance / banking / fintech) ──
    # Thin @tool wrappers over the same _run → execute_tool path as the bond tools; main.py
    # routes each name to its Gateway target (personas.VERTICAL_TOOL_TARGET). Signatures mirror
    # the toolSchema registered in deploy.sh so the model's args match what each Lambda expects.
    # An agent only receives the tools its roster lists (the return filter below), so a desk
    # never sees another vertical's tools — but defining them all here keeps ONE tool layer.

    # Insurance — Ridgeline underwriting desk.
    @strands_tool
    async def risk_screen(line: str = '', occupancy: str = '', construction: str = '', state: str = '',
                          min_tiv: float = None, max_tiv: float = None, max_hazard_grade: int = None,
                          exclude_cat_zone: bool = False, limit: int = 25, sort_by: str = 'rate_adequacy') -> str:
        """Screen the ~4,000-submission underwriting universe by line, occupancy/class, construction,
        protection class, TIV band, state and hazard grade; ranked and capped.

        Args:
            line: e.g. 'Commercial Property', 'GL', 'Umbrella', 'Term Life'.
            occupancy: e.g. 'Habitational', 'Manufacturing', 'Retail', 'Healthcare'.
            construction: ISO class — 'Frame', 'JM', 'NC', 'MNC', 'Fire-Resistive'.
            state: two-letter US state code.
            min_tiv / max_tiv: total-insured-value bounds (USD).
            max_hazard_grade: 1 (best) to 5 (worst).
            exclude_cat_zone: drop tier-1 wind / wildfire / SFHA flood zones.
            limit: max submissions to return (<=60).
            sort_by: one of premium, rate_adequacy, hazard, tiv.
        """
        args = {'line': line, 'occupancy': occupancy, 'construction': construction, 'state': state,
                'min_tiv': min_tiv, 'max_tiv': max_tiv, 'max_hazard_grade': max_hazard_grade,
                'exclude_cat_zone': exclude_cat_zone, 'limit': limit, 'sort_by': sort_by}
        return json.dumps(await _run('risk_screen', args))
    built['risk_screen'] = risk_screen

    @strands_tool
    async def peril_lookup(state: str = '', county: str = '', zip: str = '', occupancy: str = '',
                           construction: str = '', protection_class: int = None) -> str:
        """Return the perils and hazard grades attaching to a location / occupancy / protection class —
        hurricane / storm-surge / wildfire / flood / severe-convective, with bureau hazard grade and PPC.

        Args:
            state / county / zip: location.
            occupancy / construction: risk class.
            protection_class: ISO public-protection class (1 best … 10 worst).
        """
        args = {'state': state, 'county': county, 'zip': zip, 'occupancy': occupancy,
                'construction': construction, 'protection_class': protection_class}
        return json.dumps(await _run('peril_lookup', args))
    built['peril_lookup'] = peril_lookup

    @strands_tool
    async def book_risk(holdings_json: str = '', loss_ratio_target: float = None) -> str:
        """Aggregate written premium, expected & booked loss ratio, combined ratio, AAL, single-event
        PML, line/state/cat concentration, net-of-reinsurance retention and rate adequacy for a book.

        Args:
            holdings_json: JSON array of policies [{policy_id, line, state, premium, tiv, expected_lr, cat_zone}].
            loss_ratio_target: plan/target loss ratio for framing.
        """
        try:
            holdings = json.loads(holdings_json) if isinstance(holdings_json, str) and holdings_json.strip() else []
        except Exception:
            holdings = []
        args = {'holdings': holdings}
        if loss_ratio_target is not None:
            args['loss_ratio_target'] = loss_ratio_target
        return json.dumps(await _run('book_risk', args))
    built['book_risk'] = book_risk

    @strands_tool
    async def evolve_book(loss_ratio_target: float = 0.58, max_state_weight: float = 0.25,
                          cat_pml_cap: float = 60_000_000, rate_adequacy_floor: float = 1.0,
                          n_policies: int = 300, objective: str = 'balanced') -> str:
        """Run an evolutionary search over book-construction recipes against an appetite; returns a
        fitness-by-generation curve, a leaderboard of candidate books, and the winning bind list.

        Args:
            loss_ratio_target: target loss ratio (e.g. 0.58).
            max_state_weight: cap on any one state (fraction).
            cat_pml_cap: 1-in-250 PML ceiling (USD).
            rate_adequacy_floor: minimum indicated-vs-charged rate (e.g. 1.0).
            n_policies: approximate book size.
            objective: 'balanced' | 'premium' | 'defensive'.
        """
        appetite = {'loss_ratio_target': loss_ratio_target, 'max_state_weight': max_state_weight,
                    'cat_pml_cap': cat_pml_cap, 'rate_adequacy_floor': rate_adequacy_floor,
                    'n_policies': n_policies, 'objective': objective}
        return json.dumps(await _run('evolve_book', {'appetite': appetite}))
    built['evolve_book'] = evolve_book

    @strands_tool
    async def cat_model_run(book_name: str = 'all', perils_csv: str = '', return_periods_csv: str = '10,100,250,500',
                            climate_conditioning: str = 'forward') -> str:
        """Run the licensed catastrophe model (hurricane/wildfire/severe-convective/flood/quake) over a
        book; returns AAL, single-event PML and the loss-exceedance curve by return period.

        Args:
            book_name: book to model, or 'all'.
            perils_csv: comma-separated subset of hurricane,wildfire,scs,flood,quake (blank = all).
            return_periods_csv: comma-separated return periods, e.g. '10,100,250,500'.
            climate_conditioning: 'historical' or 'forward' (warmed-climate).
        """
        perils = [p.strip() for p in perils_csv.split(',') if p.strip()]
        rps = [int(x) for x in return_periods_csv.split(',') if x.strip().isdigit()]
        return json.dumps(await _run('cat_model_run', {'book_name': book_name, 'perils': perils,
                                                       'return_periods': rps, 'climate_conditioning': climate_conditioning}))
    built['cat_model_run'] = cat_model_run

    @strands_tool
    async def fraud_signal(cohort: str = '', accounts_json: str = '', threshold: int = 70) -> str:
        """Score a risk or claims cohort for fraud, moral hazard and adverse selection; returns a
        0-100 integrity score per account with the SIU red flags, prior-loss and litigation history.

        Args:
            cohort: optional named cohort, e.g. 'FL AOB water claims'.
            accounts_json: JSON array of accounts [{account_id, insured, line, state, premium}].
            threshold: flag score >= threshold (default 70).
        """
        try:
            accounts = json.loads(accounts_json) if isinstance(accounts_json, str) and accounts_json.strip() else []
        except Exception:
            accounts = []
        return json.dumps(await _run('fraud_signal', {'cohort': cohort, 'accounts': accounts, 'threshold': threshold}))
    built['fraud_signal'] = fraud_signal

    # Banking — Rampart credit desk.
    @strands_tool
    async def credit_score(borrower: str, segment: str = 'commercial', annual_revenue: float = None,
                           ebitda: float = None, total_debt: float = None, bureau_score: int = None,
                           years_in_business: int = None, requested_amount: float = None) -> str:
        """Compute the bank internal probability-of-default, credit grade and score band for a borrower
        from their financials and bureau data.

        Args:
            borrower: borrower legal name.
            segment: one of commercial, cre, small_business, consumer.
            annual_revenue / ebitda / total_debt: financials (USD).
            bureau_score: vendor bureau score if known.
            years_in_business: years operating.
            requested_amount: facility amount requested (USD).
        """
        args = {'borrower': borrower, 'segment': segment, 'annual_revenue': annual_revenue,
                'ebitda': ebitda, 'total_debt': total_debt, 'bureau_score': bureau_score,
                'years_in_business': years_in_business, 'requested_amount': requested_amount}
        return json.dumps(await _run('credit_score', args))
    built['credit_score'] = credit_score

    @strands_tool
    async def loan_price(amount: float, tenor_months: int, grade: str, index: str = 'sofr',
                         collateral_type: str = '', ltv: float = None, rate_type: str = 'floating') -> str:
        """Price a loan/facility off the live curve: risk-based APR, spread over index, fee schedule,
        and expected net interest margin after expected loss and cost of funds (plus RAROC).

        Args:
            amount: facility amount (USD).
            tenor_months: term in months.
            grade: internal credit grade, e.g. '6 / BB'.
            index: reference index — 'sofr', 'prime', 'fixed'.
            collateral_type: e.g. 'equipment', 'CRE', 'unsecured'.
            ltv: loan-to-value (fraction).
            rate_type: 'fixed' or 'floating'.
        """
        args = {'amount': amount, 'tenor_months': tenor_months, 'grade': grade, 'index': index,
                'collateral_type': collateral_type, 'ltv': ltv, 'rate_type': rate_type}
        return json.dumps(await _run('loan_price', args))
    built['loan_price'] = loan_price

    @strands_tool
    async def portfolio_risk_scan(book: str = '', facilities_json: str = '', proposed_facility_json: str = '') -> str:
        """Aggregate a loan book: concentration by sector/geography/grade, weighted PD/LGD, expected
        loss, NPL ratio and CECL reserve coverage. Optionally test a proposed deal's marginal effect.

        Args:
            book: loan-book name to scan, e.g. 'Commercial & Industrial Book'.
            facilities_json: optional explicit facility list (JSON array); otherwise the officer's book.
            proposed_facility_json: optional new deal (JSON object) to test its effect on limits.
        """
        args = {'book': book}
        try:
            if facilities_json.strip():
                args['facilities'] = json.loads(facilities_json)
        except Exception:
            pass
        try:
            if proposed_facility_json.strip():
                args['proposed_facility'] = json.loads(proposed_facility_json)
        except Exception:
            pass
        return json.dumps(await _run('portfolio_risk_scan', args))
    built['portfolio_risk_scan'] = portfolio_risk_scan

    @strands_tool
    async def covenant_check(borrower: str, facility_id: str = '', dscr: float = None,
                             leverage: float = None, ltv: float = None, liquidity: float = None) -> str:
        """Test a borrower/facility against its covenant package (DSCR floor, max leverage, LTV cap,
        min liquidity) and report breaches, headroom and tight covenants with a recommended action.

        Args:
            borrower: borrower name.
            facility_id: facility identifier.
            dscr: current debt-service-coverage ratio.
            leverage: current Debt/EBITDA.
            ltv: current loan-to-value (fraction).
            liquidity: current liquidity (USD).
        """
        args = {'borrower': borrower, 'facility_id': facility_id, 'dscr': dscr,
                'leverage': leverage, 'ltv': ltv, 'liquidity': liquidity}
        return json.dumps(await _run('covenant_check', args))
    built['covenant_check'] = covenant_check

    @strands_tool
    async def stress_test(scenario: str = 'severely_adverse', book: str = '', horizon_quarters: int = 9) -> str:
        """Run macro stress scenarios over a loan book and return the capital and expected-loss impact
        with the driving concentrations.

        Args:
            scenario: one of rate_shock_200bps, recession, cre_downturn, severely_adverse.
            book: loan-book name.
            horizon_quarters: projection horizon in quarters.
        """
        return json.dumps(await _run('stress_test', {'scenario': scenario, 'book': book,
                                                     'horizon_quarters': horizon_quarters}))
    built['stress_test'] = stress_test

    # FinTech — Kairo payments/risk desk.
    @strands_tool
    async def merchant_screen(mcc: str = '', geo: str = '', risk_band: str = '', min_volume: float = None,
                              max_volume: float = None, min_approval_rate: float = None,
                              max_chargeback_rate: float = None, exclude_restricted: bool = False,
                              limit: int = 25, sort_by: str = 'risk_score') -> str:
        """Screen the book of merchants / card programs / wallet cohorts by MCC, geography, monthly
        volume, approval rate, chargeback rate and risk band; ranked and capped.

        Args:
            mcc: merchant-category code or category name.
            geo: ISO country / region filter.
            risk_band: one of low, medium, high, restricted.
            min_volume / max_volume: monthly processed-volume bounds (USD).
            min_approval_rate: minimum authorization approval rate (0-1).
            max_chargeback_rate: maximum chargeback rate (0-1).
            exclude_restricted: drop MCCs on the restricted list.
            limit: max rows (<=60).
            sort_by: one of volume, approval_rate, chargeback_rate, risk_score.
        """
        args = {'mcc': mcc, 'geo': geo, 'risk_band': risk_band, 'min_volume': min_volume,
                'max_volume': max_volume, 'min_approval_rate': min_approval_rate,
                'max_chargeback_rate': max_chargeback_rate, 'exclude_restricted': exclude_restricted,
                'limit': limit, 'sort_by': sort_by}
        return json.dumps(await _run('merchant_screen', args))
    built['merchant_screen'] = merchant_screen

    @strands_tool
    async def exposure_report(book_json: str = '', loss_ceiling_bps: float = 45, stress: str = 'none') -> str:
        """Aggregate a book's fraud/chargeback/credit exposure, settlement float, reserve requirement,
        expected loss and concentration by MCC/geo/issuer, plus a stress-scenario P&L.

        Args:
            book_json: JSON array of accounts/merchants [{id, volume, mcc, geo, limit, chargeback_rate}].
            loss_ceiling_bps: fraud+chargeback loss ceiling in bps of volume for pass/fail.
            stress: one of none, volume_2x, delinquency_shock, fx_shock.
        """
        try:
            book = json.loads(book_json) if isinstance(book_json, str) and book_json.strip() else []
        except Exception:
            book = []
        return json.dumps(await _run('exposure_report', {'book': book, 'loss_ceiling_bps': loss_ceiling_bps, 'stress': stress}))
    built['exposure_report'] = exposure_report

    @strands_tool
    async def strategy_optimize(approval_floor: float = 0.94, fraud_loss_ceiling_bps: float = 25,
                                chargeback_ceiling_bps: float = 12, revenue_objective: str = 'balanced',
                                concentration_cap: float = 0.20) -> str:
        """Run an evolutionary search over risk/growth strategy recipes (decline thresholds, credit
        limits, 3DS/step-up rules, routing, pricing) against a mandate; returns a fitness curve, a
        leaderboard and the winning policy.

        Args:
            approval_floor: minimum authorization approval rate (0-1).
            fraud_loss_ceiling_bps: max fraud loss in bps of volume.
            chargeback_ceiling_bps: max chargebacks in bps of volume.
            revenue_objective: 'balanced' | 'growth' | 'loss_control'.
            concentration_cap: max exposure in any one MCC (fraction).
        """
        mandate = {'approval_floor': approval_floor, 'fraud_loss_ceiling_bps': fraud_loss_ceiling_bps,
                   'chargeback_ceiling_bps': chargeback_ceiling_bps, 'revenue_objective': revenue_objective,
                   'concentration_cap': concentration_cap}
        return json.dumps(await _run('strategy_optimize', {'mandate': mandate}))
    built['strategy_optimize'] = strategy_optimize

    @strands_tool
    async def fraud_scan(entity_type: str, entity_id: str, window: str = '7d', include_linked: bool = True) -> str:
        """Score a customer / device / merchant / transaction against velocity, device-fingerprint,
        known-fraud-ring and anomaly signals; returns a risk score, contributing signals and any
        linked accounts / shared identifiers.

        Args:
            entity_type: one of customer, device, merchant, transaction.
            entity_id: account / device / merchant / txn id to score.
            window: lookback window, e.g. 24h, 7d, 30d.
            include_linked: return linked accounts sharing device / card / IP / bank-account.
        """
        return json.dumps(await _run('fraud_scan', {'entity_type': entity_type, 'entity_id': entity_id,
                                                    'window': window, 'include_linked': include_linked}))
    built['fraud_scan'] = fraud_scan

    @strands_tool
    async def cohort_ltv(book: str = '', cohort: str = 'all', segment: str = '', horizon_months: int = 24) -> str:
        """Signup-cohort retention curves, lifetime value, payback period, contribution margin and
        revenue mix (interchange / FX / subscription / fee) for a book or segment.

        Args:
            book: book / product name, e.g. 'Consumer Wallet'.
            cohort: signup cohort, e.g. '2026-Q1', or 'all'.
            segment: optional segment filter (geo, tier, channel).
            horizon_months: projection horizon for LTV / payback.
        """
        return json.dumps(await _run('cohort_ltv', {'book': book, 'cohort': cohort,
                                                    'segment': segment, 'horizon_months': horizon_months}))
    built['cohort_ltv'] = cohort_ltv

    # Apply per-persona description/schema overrides to the SHARED tools. The closure and its
    # name are unchanged (Strands forbids renaming via tool_spec) — only the description and
    # inputSchema the model sees are swapped, so an insurance/banking/fintech agent reads its
    # desk's own wording and its in-scope arguments. CM (or an unknown desk) → no overrides →
    # the docstring-derived spec stands verbatim. Defensive: never let a bad override break a
    # run — a malformed spec is logged and skipped, leaving the CM default in place.
    overrides = personas.tool_spec_overrides(pctx['id']) if pctx else {}
    for name, spec_patch in overrides.items():
        tool = built.get(name)
        if tool is None:
            continue
        try:
            base = dict(tool.tool_spec)  # {'name', 'description', 'inputSchema'}
            if 'description' in spec_patch:
                base['description'] = spec_patch['description']
            if 'inputSchema' in spec_patch:
                base['inputSchema'] = spec_patch['inputSchema']
            tool.tool_spec = base  # setter validates name/shape; raises on mismatch
        except Exception as e:  # pragma: no cover - defensive; CM default remains usable
            print(f'TOOL SPEC OVERRIDE WARNING: {name} for persona '
                  f'{pctx.get("id") if pctx else "?"}: {type(e).__name__}: {e}', flush=True)

    return [built[n] for n in tool_names if n in built]


def _agent_model_id(spec, model_id, auto_tier, model_resolver):
    """Resolve the Bedrock model id for one specialist. In Auto mode ('auto_tier'), use the
    agent's own TIER (spec['model'] → Bedrock id via the caller's resolver); otherwise every
    agent is forced onto the single selected model_id (the "swap the LLM" sidebar demo)."""
    if auto_tier and spec.get('model') and model_resolver:
        resolved = model_resolver(spec['model'])
        if resolved:
            return resolved
    return model_id


def _build_swarm(pctx, model_id, base_system, user_id, user_jwt, force_reauth,
                 auth_holder, results_by_id, execute_tool,
                 auto_tier=False, model_resolver=None, long_running=False):
    """Construct the Strands Swarm for the ACTIVE persona: one specialist Agent per roster
    entry (each with its domain tools + the auto-injected handoff_to_agent tool). In Auto
    mode each agent runs its own tiered model (Opus for reasoning agents, Sonnet 5 for the
    rest); otherwise all share model_id.

    `pctx` is the compiled persona context (personas.compile_persona) — roster, routing
    directory, and entry/sink keys — so the whole desk is persona-driven, not a global.

    long_running lifts the wall-clock budgets for the async background-job path (decoupled
    from any HTTP request, so bounded only by the 8h microVM); the synchronous path keeps the
    sub-290s budget so it still ends gracefully before the WS bridge times out."""
    roster = pctx['roster']
    sink_name = roster.get(pctx['sink_key'], {}).get('name', 'the committee')
    # Shared set of toolUseIds the budget hook cancelled, so the capture hook substitutes an
    # honest guardrail note instead of leaking the cancel instruction as a fake tool result.
    cancelled_calls = set()
    capture = _ToolResultCapture(results_by_id, cancelled=cancelled_calls)
    # Per-node tool-call cap — the SAME guard the Graph engine uses. Without it a swarm node
    # has no agentic-loop ceiling and can churn an expensive tool (e.g. web_browser) until the
    # node_timeout, ending the whole run with no answer. Buckets by agent id() so nodes budget
    # independently; the tight PER_TOOL_BUDGET on web_browser is what actually saves the run.
    # On the long path the ceilings are lifted so a genuine desk review isn't throttled.
    budget = _ToolBudget(
        budget=LONG_TOOL_BUDGET if long_running else TOOL_BUDGET,
        per_tool=LONG_PER_TOOL_BUDGET if long_running else PER_TOOL_BUDGET,
        cancelled=cancelled_calls,
        blocked_agent_names=pctx.get('pruned_agent_names'))
    nodes = []
    entry = None
    for key, spec in roster.items():
        # One model instance per agent. model_id is a DIRECT kwarg, NOT model_config —
        # verified live: BedrockModel(model_config={...}) warns "Invalid configuration
        # parameters" and silently uses the default model.
        agent_model_id = _agent_model_id(spec, model_id, auto_tier, model_resolver)
        model = BedrockModel(model_id=agent_model_id, max_tokens=MAX_OUTPUT_TOKENS)
        tools = _build_tools(execute_tool, spec['tools'], user_id, user_jwt, force_reauth, auth_holder, pctx)
        # In Auto mode the shared base_system describes the whole tier; pin THIS agent's own
        # model so "which model are you?" is answered precisely by whichever agent replies.
        identity = (f"\n\n=== YOUR MODEL ===\nYou (this agent, {spec['name']}) are running on "
                    f"{_MODEL_DISPLAY.get(agent_model_id, agent_model_id)} via Amazon Bedrock."
                    if auto_tier else "")
        sys_prompt = (
            f"{base_system}{identity}\n\n=== YOUR ROLE IN THE SWARM ===\n{spec['role']}\n\n"
            "=== SPECIALIST DIRECTORY (who owns which tool) ===\n"
            f"{pctx['routing_directory']}\n\n"
            "ROUTING RULES (critical — the swarm must NOT bounce work around):\n"
            "- If YOU own the tool the request needs, CALL IT YOURSELF now. Do not hand off.\n"
            "- If another specialist owns it, hand off DIRECTLY to that specialist (per the directory "
            "above) in ONE step — never hand back to the Lead Coordinator just to re-route, and never "
            "hand off to a specialist who lacks the needed tool.\n"
            "- The Lead Coordinator has NO tools; it only routes. Specialists do the work, then EITHER "
            "answer the user directly OR hand to the next specialist if the task needs another tool.\n"
            "- SINGLE-FOCUS request (one specialist fully answers it — one lookup, one screen, one "
            f"analysis): that specialist WRITES THE FINAL ANSWER directly. Do NOT involve {sink_name} — "
            "it would just add a needless hop.\n"
            "- MULTI-FACETED request (THREE OR MORE specialists genuinely contribute — e.g. build "
            "something AND analyze its risk AND screen it AND plan execution): after the last "
            f"contributing specialist finishes, hand off to {sink_name} to reconcile, challenge, and "
            f"issue the final verdict. Route to {sink_name} at most ONCE, and only when real work from "
            "multiple specialists is already on the table — never as a first hop.\n"
            "- Otherwise, once your part is done and nothing else is needed, WRITE THE FINAL ANSWER — "
            "do not hand off again.\n\n"
            "OUTPUT DISCIPLINE (critical): do NOT narrate your process. Before a hand-off or a tool "
            "call, write NOTHING — call handoff_to_agent / the tool immediately (the UI shows hand-offs "
            "and tool calls visually). Never write 'I'll hand this off…', 'Let me retrieve…', or any "
            "preamble. Only the agent that produces the FINAL answer writes prose, exactly once, as the "
            "polished executive answer — not a play-by-play. End that final answer with one short italic "
            "line noting which AgentCore feature / specialist handled it."
        )
        agent = Agent(name=spec['name'], model=model, system_prompt=sys_prompt,
                      tools=tools, hooks=[capture, budget], callback_handler=None)
        nodes.append(agent)
        if key == pctx['entry_key']:
            entry = agent
    swarm = Swarm(
        nodes=nodes,
        entry_point=entry,
        max_handoffs=MAX_HANDOFFS,
        max_iterations=MAX_ITERS,
        execution_timeout=LONG_EXEC_TIMEOUT if long_running else EXEC_TIMEOUT,
        node_timeout=LONG_NODE_TIMEOUT if long_running else NODE_TIMEOUT,
    )
    return swarm


def _agent_active_events(agent_key, roster):
    """Emit a COMPLETE tool-call frame marking the active agent, so the UI renders the
    swarm entry/switch as a finished chip (carries the __agent_active marker). `roster` is
    the ACTIVE persona's roster (pctx['roster'])."""
    acid = _uuid.uuid4().hex
    name = roster.get(agent_key, {}).get('name', agent_key)
    return [
        _ev(ToolCallStartEvent(
            type=EventType.TOOL_CALL_START, tool_call_id=acid,
            tool_call_name=f"Agent active · {name}")),
        _ev(ToolCallArgsEvent(
            type=EventType.TOOL_CALL_ARGS, tool_call_id=acid,
            delta=json.dumps({'__tool': 'agent_active', '__agent': agent_key,
                              '__agent_active': {'agent': agent_key, 'name': name}}))),
        _ev(ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=acid)),
        _ev(ToolCallResultEvent(
            type=EventType.TOOL_CALL_RESULT, message_id=_uuid.uuid4().hex,
            tool_call_id=acid, content=json.dumps({'active': name}))),
    ]


# Human label for each domain tool, shown in the tool-call timeline. Both engines resolve
# labels through _translate_inner (which the Graph engine reuses from this module), so this
# is the single source of truth — a tool missing here renders its raw snake_case name
# (e.g. "evolve_portfolio") in the card header.
TOOL_LABELS = {
    'secure_vault': 'Secure Vault (Gateway + Cedar policy)',
    'user_data_lookup': 'Portfolio Manager Data Lookup (Gateway)',
    'web_browser': 'Web Browser (AgentCore Browser)',
    'code_interpreter': 'Code Interpreter (AgentCore sandbox)',
    'positions_view': 'View Positions (Identity 3LO · portfolio-api/read)',
    'trade_execute': 'Execute Trade (Identity 3LO · portfolio-api/trade)',
    'market_data': 'Market Data (Identity M2M · client-credentials)',
    'macro_indicator': 'Macro Indicator (FRED · Identity API-key vault)',
    # Fixed-income tools (governed bond universe + analytics + evolutionary construction).
    'bond_screen': 'Bond Screen (real universe · Gateway)',
    'curve_lookup': 'Treasury Curve (real · FRED)',
    'spread_lookup': 'Credit Spread Ladder (real · ICE BofA OAS)',
    'price_bond': 'Price Bond (curve + OAS)',
    'portfolio_risk': 'Portfolio Risk (duration · convexity · rate-shock)',
    'evolve_portfolio': 'Evolve Portfolio (Code Interpreter · GA construction)',
    # Insurance tools (Gateway → insurance-tools).
    'risk_screen': 'Submission Screen (Gateway)',
    'peril_lookup': 'Peril & Hazard Lookup (Gateway)',
    'book_risk': 'Book Risk (premium · loss ratio · PML)',
    'evolve_book': 'Evolve Book (GA construction)',
    'cat_model_run': 'Cat Model (AAL · PML by return period)',
    'fraud_signal': 'Fraud Signal (SIU red flags)',
    # Banking tools (Gateway → banking-tools).
    'credit_score': 'Credit Score (internal PD · grade)',
    'loan_price': 'Loan Price (APR · spread · RAROC)',
    'portfolio_risk_scan': 'Loan-Book Scan (concentration · CECL)',
    'covenant_check': 'Covenant Check (DSCR · leverage · LTV)',
    'stress_test': 'Stress Test (capital · loss impact)',
    # FinTech tools (Gateway → fintech-tools).
    'merchant_screen': 'Merchant Screen (MCC · chargeback · risk)',
    'exposure_report': 'Exposure Report (fraud · reserve · concentration)',
    'strategy_optimize': 'Strategy Optimize (GA · approval vs loss)',
    'fraud_scan': 'Fraud Scan (velocity · device · ring)',
    'cohort_ltv': 'Cohort LTV (retention · payback · margin)',
}


def _build_task(message, history):
    """Compose the swarm's task: recent conversation context + the new user message.

    The swarm runs fresh each turn, so without the immediately-prior exchange a reply like
    "3" (picking an option just offered) is meaningless. We prepend a compact transcript so
    the orchestrator can resolve references to what was just said. Kept short and clearly
    delimited so it reads as context, not as new instructions."""
    if not history:
        return message
    lines = []
    for role, text in history:
        who = 'PM' if role == 'user' else 'Assistant'
        t = (text or '').strip()
        if len(t) > 1200:  # trim long prior answers; keep the gist for reference
            t = t[:1200] + ' …[truncated]'
        lines.append(f"{who}: {t}")
    transcript = '\n'.join(lines)
    return (
        "=== RECENT CONVERSATION (context only — do not re-answer these) ===\n"
        f"{transcript}\n"
        "=== END CONTEXT ===\n\n"
        "The PM's NEW message follows. If it refers to something above (e.g. choosing an "
        "option you just offered, or 'yes'/'do it'), interpret it in that context.\n\n"
        f"PM: {message}"
    )


async def run_swarm_events(message, base_system, model_id, user_id, user_jwt,
                           force_reauth, execute_tool, on_final=None, history=None,
                           auto_tier=False, model_resolver=None, long_running=False,
                           persona_ctx=None):
    """Drive the Strands swarm and YIELD AG-UI event dicts (same wire form as the
    converse-loop version). The caller (invoke) wraps these with RunStarted/RunFinished.

    Args:
        message:      the user's text for this turn.
        base_system:  the fully-composed system prompt (model identity + memory + user).
        model_id:     resolved Bedrock model id (used for ALL agents unless auto_tier).
        user_id/user_jwt/force_reauth: 3LO identity context.
        execute_tool: the async tool dispatcher from main.py (unchanged AgentCore impls).
        on_final:     optional callback(final_text) for session-commit + memory store.
        history:      recent [(role, text), ...] turns (strictly prior) for short-term
                      continuity — prepended to the task so "3"/"yes" resolve in context.
        auto_tier:    when True, each specialist runs its own roster['model'] tier
                      (reasoning agents → Opus, the rest → Sonnet 5) instead of model_id.
        model_resolver: callable(short_key) → Bedrock id (main._resolve_model); required
                      for auto_tier so the per-agent short keys resolve.
        persona_ctx:  the compiled persona context (personas.compile_persona) selecting the
                      desk — roster, routing directory, graph entry/sink. Defaults to the
                      capital-markets desk so any caller that omits it is unchanged.

    Emits, per the frozen agentClient.ts contract:
      - an agent-active frame on entry and on each hand-off (the swarm roster/graph),
      - TOOL_CALL_START/ARGS/END (+ __tool/__agent keys) and TOOL_CALL_RESULT per tool,
      - a hand-off frame (carrying __handoff) on every multiagent_handoff,
      - TEXT_MESSAGE_START/CONTENT/END for the final answer,
      - and, if 3LO consent is needed, a CUSTOM auth_required (handled by the caller via
        the returned auth_url — see AuthPending below).
    """
    pctx = persona_ctx or personas.compile_persona(personas.DEFAULT_PERSONA)
    roster = pctx['roster']
    key_by_name = pctx['key_by_name']
    auth_holder = _AuthHolder()
    results_by_id = {}
    swarm = _build_swarm(pctx, model_id, base_system, user_id, user_jwt, force_reauth,
                         auth_holder, results_by_id, execute_tool,
                         auto_tier=auto_tier, model_resolver=model_resolver,
                         long_running=long_running)

    current_key = pctx['entry_key']
    # Track tool-call frames we've opened so we can close them with the captured result.
    open_tool_ids = {}     # toolUseId -> tool name (domain tools only)
    started_args = set()   # toolUseIds we've already emitted START+ARGS for
    # The frozen agentClient.ts concatenates EVERY TEXT_MESSAGE_CONTENT delta into ONE
    # buffer with no separator, ignoring message_id. So if we streamed each agent's prose
    # live, the orchestrator's hand-off narration, a specialist's pre-tool preamble, and
    # the real answer would mash together on screen ("…positions.I'll retrieve…(…OAuth).
    # Core Bond Fund — 6 holdings…"). Instead we BUFFER prose and emit only the FINAL
    # segment: text accumulates in text_state, is DISCARDED whenever the same agent then
    # hands off / calls a tool / another agent starts speaking (proving it was narration
    # or a pre-tool preamble), and the surviving last segment is flushed as one clean
    # answer at the end. This enforces "only the final agent writes prose" at the
    # translation layer — robust even on models that ignore that prompt instruction.
    text_state = _TextState()   # per-run text-buffer state (NOT module-level)
    swarm_result = None         # terminal multiagent_result (for exhausted-stop fallback)
    budget = _RunBudget()       # shared budget notion (finding #3) — same as the graph engine
    budget_stop = None          # reason string once a cap is hit

    # Announce the entry agent.
    for e in _agent_active_events(current_key, roster):
        yield e

    task = _build_task(message, history)
    async for sev in swarm.stream_async(task):
        stype = sev.get('type')

        # ── Hand-off: switch active agent, surface the edge (rides tool-call channel) ──
        if stype == 'multiagent_handoff':
            # Budget: count the hand-off; stop gracefully if we've exceeded the ceiling.
            budget.handoffs += 1
            budget_stop = budget.exhausted()
            if budget_stop:
                break
            # Any prose the handing-off agent streamed first ("I'll hand this off…") is
            # narration, never the final answer — drop the pending buffer.
            text_state.discard()
            frm = (sev.get('from_node_ids') or [None])[0]
            to = (sev.get('to_node_ids') or [None])[0]
            reason = sev.get('message') or ''
            from_key, to_key = _agent_key(frm, key_by_name), _agent_key(to, key_by_name)
            tcid = _uuid.uuid4().hex
            yield _ev(ToolCallStartEvent(
                type=EventType.TOOL_CALL_START, tool_call_id=tcid,
                tool_call_name=f"Hand-off → {roster.get(to_key, {}).get('name', to_key)}"))
            yield _ev(ToolCallArgsEvent(
                type=EventType.TOOL_CALL_ARGS, tool_call_id=tcid,
                delta=json.dumps({
                    '__tool': 'handoff', '__agent': from_key,
                    '__handoff': {'from': from_key, 'to': to_key,
                                  'from_name': roster.get(from_key, {}).get('name', from_key),
                                  'to_name': roster.get(to_key, {}).get('name', to_key),
                                  'reason': reason},
                    'reason': reason})))
            yield _ev(ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=tcid))
            yield _ev(ToolCallResultEvent(
                type=EventType.TOOL_CALL_RESULT, message_id=_uuid.uuid4().hex,
                tool_call_id=tcid,
                content=json.dumps({'handoff': 'accepted', 'to': roster.get(to_key, {}).get('name', to_key), 'reason': reason})))
            current_key = to_key
            for e in _agent_active_events(current_key, roster):
                yield e
            continue

        # ── Node start: Strands began executing a node (covers entry already emitted) ──
        if stype == 'multiagent_node_start':
            # Budget: each node activation is one iteration of the swarm loop.
            budget.iters += 1
            budget_stop = budget.exhausted()
            if budget_stop:
                break
            nk = _agent_key(sev.get('node_id'), key_by_name)
            if nk != current_key:
                current_key = nk
                for e in _agent_active_events(current_key, roster):
                    yield e
            continue

        # ── Inner agent event (text deltas + tool-use streaming) ──
        if stype == 'multiagent_node_stream':
            node_key = _agent_key(sev.get('node_id'), key_by_name)
            inner = sev.get('event') or {}
            budget.add_usage(inner)   # accumulate output tokens (best-effort)
            for out in _translate_inner(inner, node_key, open_tool_ids, started_args,
                                        results_by_id, text_state):
                yield out
            # If a 3LO tool just flagged consent, halt the whole swarm cleanly.
            if auth_holder.pending:
                break
            # If the cumulative output-token ceiling was crossed, stop gracefully.
            budget_stop = budget.exhausted()
            if budget_stop:
                break
            continue

        # ── Swarm result: capture the terminal status so we can detect an exhausted /
        # forced stop (max hand-offs/iterations) and avoid emitting a blank answer. ──
        if stype == 'multiagent_result':
            swarm_result = sev.get('result')
            continue

        # node_stop / other: nothing to emit directly (text is buffered, flushed at end).

    # ── 3LO consent path: emit auth_required CUSTOM, do NOT commit session ──
    if auth_holder.pending:
        yield _ev(CustomEvent(
            type=EventType.CUSTOM, name='auth_required',
            value={'auth_url': auth_holder.auth_url,
                   'message': 'Authorization required to access your fund positions. '
                              'Approve in the new tab, then choose "I\'ve approved — continue".'}))
        # Caller appends RUN_FINISHED. Signal "do not commit" by NOT calling on_final.
        return

    # ── Budget ceiling hit: stop gracefully with a visible notice; do NOT commit to memory. ──
    if budget_stop:
        # If an agent had already written a real answer before the cap, flush it; otherwise
        # emit the budget notice. Either way we don't commit (a truncated run isn't a fact).
        partial = text_state.text()
        if partial:
            msg_id = _uuid.uuid4().hex
            yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role='assistant'))
            yield _ev(TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta=partial))
            yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))
            yield _ev(CustomEvent(type=EventType.CUSTOM, name='budget_exhausted', value={'reason': budget_stop}))
        else:
            for e in _budget_exhausted_events(budget_stop):
                yield e
        return

    # ── Final answer: flush the surviving buffered segment as ONE clean text message.
    # Everything discarded along the way (hand-off narration, pre-tool preambles) never
    # reaches the client or long-term memory; what remains is the final agent's answer. ──
    final = text_state.text()
    committed = bool(final)
    if not final:
        # The swarm terminated without any agent writing a final answer — e.g. it hit
        # max hand-offs/iterations (specialists bouncing), or a node force-stopped. Emit a
        # graceful, honest message instead of a blank bubble, and DON'T commit it to memory.
        final = (
            "I wasn't able to complete that request — the specialist agents couldn't converge "
            "on an answer within the allowed steps. Please try rephrasing, or ask for one thing "
            "at a time.\n\n*The agent swarm reached its coordination limit without a final answer.*"
        )
    msg_id = _uuid.uuid4().hex
    yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role='assistant'))
    yield _ev(TextMessageContentEvent(
        type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta=final))
    yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))

    # Only commit a REAL answer to long-term memory (never the fallback notice).
    if on_final and committed:
        on_final(final)


class _TextState:
    """Per-run text BUFFER (not a live stream). The frozen agentClient.ts globally
    concatenates every TEXT_MESSAGE_CONTENT delta into one buffer with no separator and
    never resets — so streaming each agent's prose live would mash hand-off narration,
    pre-tool preambles, and the real answer into one run-on blob. Instead we accumulate
    the CURRENT prose segment here and DISCARD it whenever the same agent then hands off
    or calls a tool (proving it was a preamble) or another agent starts speaking. The
    surviving last segment is the clean final answer, flushed once at the end.

    One instance per run_swarm_events call (NOT shared) so concurrent/sequential runs in
    the same process never cross streams."""
    __slots__ = ('buf', 'node_key')

    def __init__(self):
        self.buf = []          # chunks of the current (pending) prose segment
        self.node_key = None   # which agent is producing the current segment

    def append(self, text, node_key):
        # A different agent started talking → the prior segment was not the final answer.
        if self.node_key is not None and self.node_key != node_key:
            self.buf = []
        self.node_key = node_key
        self.buf.append(text)

    def discard(self):
        """Drop the pending segment (it was narration / a pre-tool preamble)."""
        self.buf = []
        self.node_key = None

    def text(self):
        return ''.join(self.buf).strip()


def _translate_inner(inner, node_key, open_tool_ids, started_args,
                     results_by_id, text_state):
    """Translate ONE inner Strands agent event dict into AG-UI frames. A plain generator
    (no awaits) so the caller iterates it synchronously.

    Text deltas are NOT streamed to the client (the frozen client would mash every
    speaker's prose together — see _TextState). They are buffered; the surviving last
    segment is flushed once, cleanly, at the end of the run."""
    # Text delta → buffer only (do not emit; see _TextState docstring).
    if 'data' in inner and isinstance(inner.get('data'), str):
        text_state.append(inner['data'], node_key)
        return

    # Tool-use streaming: emit START+ARGS once per toolUseId when we first see its name.
    if inner.get('type') == 'tool_use_stream':
        ctu = inner.get('current_tool_use') or {}
        tcid = ctu.get('toolUseId')
        name = ctu.get('name')
        if not tcid or not name:
            return
        # Skip the auto handoff tool here — handled by multiagent_handoff.
        if name == 'handoff_to_agent':
            return
        # This agent is calling a tool, so any prose it streamed first was a pre-tool
        # preamble ("I'll retrieve the current holdings…"), not the final answer — drop it.
        if tcid not in started_args:
            text_state.discard()
            started_args.add(tcid)
            open_tool_ids[tcid] = name
            yield _ev(ToolCallStartEvent(
                type=EventType.TOOL_CALL_START, tool_call_id=tcid,
                tool_call_name=TOOL_LABELS.get(name, name)))
            # input may still be a partial JSON string mid-stream; parse best-effort.
            raw = ctu.get('input')
            args = {}
            if isinstance(raw, dict):
                args = raw
            elif isinstance(raw, str) and raw.strip():
                try:
                    args = json.loads(raw)
                except Exception:
                    args = {}
            yield _ev(ToolCallArgsEvent(
                type=EventType.TOOL_CALL_ARGS, tool_call_id=tcid,
                delta=json.dumps({'__tool': name, '__agent': node_key, **args})))
            yield _ev(ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=tcid))
        return

    # A completed assistant/tool-result message — drain any captured tool results into
    # TOOL_CALL_RESULT frames (the AfterToolCallEvent hook filled results_by_id).
    if 'message' in inner:
        for tcid, name in list(open_tool_ids.items()):
            if tcid in results_by_id:
                # Cap is a frame-size guard (API Gateway WS limit is 128KB; the content
                # is re-escaped inside the {type:'agui_event',...} envelope, ~2x worst
                # case). 60KB comfortably fits the largest real payload — evolve_portfolio
                # (6 gens + 12-row leaderboard + ~34-holding winner ≈ 15KB) — so its JSON
                # arrives INTACT and the rich EvolveView parses it. A 4000-char cap chopped
                # evolve mid-JSON → invalid → silent RawFallback. Truly pathological results
                # still truncate and degrade gracefully (frontend falls back to raw).
                yield _ev(ToolCallResultEvent(
                    type=EventType.TOOL_CALL_RESULT, message_id=_uuid.uuid4().hex,
                    tool_call_id=tcid, content=str(results_by_id[tcid])[:60000]))
                del open_tool_ids[tcid]
        return
