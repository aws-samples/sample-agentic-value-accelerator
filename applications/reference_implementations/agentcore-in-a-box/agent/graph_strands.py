"""Strands **Graph** orchestration — the deterministic-DAG sibling of the Swarm engine.

Meridian ships TWO real Strands multi-agent architectures over the SAME 11 specialists
and the SAME AgentCore tools, switchable from the UI:

  • swarm_strands.py  — `strands.multiagent.Swarm`: EMERGENT routing. Each agent decides
                        the next hop via the auto-injected `handoff_to_agent` tool. Peer-
                        to-peer, sequential, the model owns the path. Great for open-ended
                        asks; the path is non-deterministic and rarely deep.
  • graph_strands.py  — `strands.multiagent.Graph` (this module): DETERMINISTIC DAG. The
                        topology is declared up front with `GraphBuilder` (nodes + edges +
                        dependencies + conditional edges). Independent branches run
                        CONCURRENTLY; a node fires only once all its dependencies complete;
                        the graph FANS IN to the Investment Committee sink. Reproducible,
                        auditable, parallel, and deep — the governance story for a regulated
                        buyer: "the orchestration is a fixed, reviewable graph, not a
                        model's improvisation."

WHY this is a thin module: Strands 1.45.0 `Graph.stream_async` yields the SAME typed event
dicts as `Swarm.stream_async` — `multiagent_node_start` / `multiagent_node_stream`
(node_id + a nested inner agent `event`) / `multiagent_handoff` (with LIST-valued
`from_node_ids`/`to_node_ids` for batch transitions) / `multiagent_result` — and the inner
agent events are byte-identical (`{"data":..}`, `{"type":"tool_use_stream",..}`,
`{"message":..}`). So we REUSE swarm_strands' proven machinery wholesale: the @tool
wrappers, the 3LO auth-holder + sentinel, the AfterToolCallEvent result-capture hook, the
per-run text BUFFER (`_TextState`), and `_translate_inner`. This module only (a) declares
the DAG, (b) drives `graph.stream_async`, and (c) maps Graph's batch-handoff events onto
our existing `__handoff`/`__agent`/`__graph` AG-UI frames so the frozen agentClient.ts and
the graph visualization light up with zero wire-contract changes.

Verified against strands-agents==1.45.0 (the container pin) by installing it in isolation
and introspecting: Graph.stream_async exists; GraphBuilder.add_edge(condition=Callable);
_build_node_input auto-threads each dependency's output into the downstream node's prompt
(so the Committee sink sees every branch's result for free).
"""
import json
import uuid as _uuid

from ag_ui.core import (
    TextMessageStartEvent, TextMessageContentEvent, TextMessageEndEvent,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ToolCallResultEvent,
    CustomEvent, EventType,
)
from strands import Agent
from strands.models import BedrockModel
from strands.multiagent import GraphBuilder

# Reuse the swarm engine's building blocks verbatim — same tools, same identity plumbing,
# same event translation. The two engines deliberately share ONE tool layer so the demo's
# message is honest: "same agents, same tools, different orchestration architecture." The
# ROSTER + graph topology are NOT imported as globals any more — they now come from the
# per-request persona context (personas.compile_persona), so one container serves every
# vertical. Importing SWARM_AGENTS/_ROUTING_DIRECTORY here would be a hard startup break
# (they no longer exist as module globals in swarm_strands).
import personas
import swarm_strands as _sw
from swarm_strands import (
    _MODEL_DISPLAY,
    _AuthHolder, _ToolResultCapture, _ToolBudget, _AUTH_SENTINEL,
    _build_tools, _agent_model_id, _agent_key,
    _TextState, _translate_inner, _build_task, _ev,
    _RunBudget, _budget_exhausted_events,
    GRAPH_NODE_TIMEOUT, GRAPH_EXEC_TIMEOUT, MAX_OUTPUT_TOKENS,
    LONG_EXEC_TIMEOUT, LONG_NODE_TIMEOUT,
    TOOL_BUDGET, LONG_TOOL_BUDGET, PER_TOOL_BUDGET, LONG_PER_TOOL_BUDGET,
)


# The DAG is now DATA in personas.py (per persona): entry / sink / edges / layers. A
# declarative edge list over roster keys — the orchestration is reviewable at a glance (the
# whole point vs. emergent swarm routing). The flagship capital-markets pipeline reads:
#
#   orchestrator ─┬─ macro ────────┐
#                 └─ universe ──────┴─ analytics ─┬─ attribution ┐
#                                                 ├─ esg         ┼─ committee
#                                                 └─ liquidity   ┘
#
# Each persona declares its own entry, sink, edges and layers; run_graph_events builds the
# graph from the compiled persona context (pctx) at request time, so the topology is never a
# module global. See personas.compile_persona for the pctx shape.


def _graph_role_addendum(key, pctx):
    """Per-node instructions for the GRAPH engine. Unlike the swarm, nodes do NOT choose
    the next hop — the DAG does — so we strip the routing/hand-off guidance and instead
    tell each node its fixed place in the pipeline and to pass a clean, structured result
    downstream. The SINK node is the sole finalizer (Strands feeds it every upstream node's
    output automatically). All names come from the ACTIVE persona (pctx), so this reads
    correctly for any vertical."""
    roster = pctx['roster']
    entry_key, sink_key = pctx['entry_key'], pctx['sink_key']
    sink_name = roster.get(sink_key, {}).get('name', 'the committee')
    if key == entry_key:
        # Name the parallel scouts (the second layer) so the entry node frames one brief.
        layers = pctx['graph_layers']
        scouts = layers[1] if len(layers) > 1 else []
        scout_names = ', '.join(roster.get(s, {}).get('name', s) for s in scouts) or 'the specialists'
        return (
            "\n\n=== GRAPH MODE (deterministic pipeline) ===\n"
            "You are the ENTRY node of a FIXED orchestration graph — you do NOT route or hand "
            "off (the graph does). Restate the user's request as a crisp mandate/brief for the "
            "desk (objective, constraints, benchmark), so the downstream specialists share one "
            f"framing. Scouts ({scout_names}) run in parallel next. Be concise; do NOT attempt "
            "the analysis yourself and do NOT write the final answer."
        )
    if key == sink_key:
        return (
            "\n\n=== GRAPH MODE (you are the SINK) ===\n"
            "Every upstream specialist's output has been collected and handed to you below. You "
            "are the FINAL node — reconcile all of it into ONE coherent recommendation, CHALLENGE "
            "it (call out the conflicts and trade-offs across the specialists' findings), and "
            "issue a clear, decisive verdict with reasoning. Write the polished executive answer. "
            "Do NOT re-run analysis; synthesize what you were given."
        )
    # Worker specialists: do your part on the inputs you're given, then STOP (the graph
    # carries your output to the next node — you neither hand off nor write the final answer).
    return (
        "\n\n=== GRAPH MODE (pipeline worker) ===\n"
        "You are one node in a FIXED graph. Do YOUR specialist part using YOUR tools on the "
        "mandate + any upstream inputs provided below, then STOP — return a clean, structured "
        "result (key numbers/findings). Do NOT hand off and do NOT write the final client answer: "
        f"the graph automatically carries your output to the next node, and {sink_name} "
        "writes the final verdict. Other specialists may be running in parallel with you."
    )


def _build_graph(pctx, model_id, base_system, user_id, user_jwt, force_reauth,
                 auth_holder, results_by_id, execute_tool,
                 auto_tier=False, model_resolver=None, long_running=False):
    """Construct the Strands Graph over the ACTIVE persona's specialists (pctx). Each node is
    a real `strands.Agent` with its domain tools; edges + dependencies encode the pipeline.
    In Auto mode each node runs its own tiered model; otherwise all share model_id.

    long_running lifts the graph's wall-clock budgets for the async background-job path
    (bounded only by the 8h microVM); the synchronous path keeps GRAPH_*_TIMEOUT (<290s) so a
    node fails its own timeout gracefully before the WS bridge cuts the socket."""
    # Shared set of budget-cancelled toolUseIds → the capture hook shows an honest guardrail
    # note instead of leaking the cancel instruction as a fake tool result (same as the swarm).
    cancelled_calls = set()
    capture = _ToolResultCapture(results_by_id, cancelled=cancelled_calls)
    # Per-node loop cap: keep any single node from looping on its tools until the node_timeout
    # (which, in the fail-fast Graph, would abort the whole run). One instance is safe across
    # nodes — it buckets counts by agent id() so parallel branches budget independently.
    # Long path lifts the ceilings so a real desk review isn't throttled.
    budget = _ToolBudget(
        budget=LONG_TOOL_BUDGET if long_running else TOOL_BUDGET,
        per_tool=LONG_PER_TOOL_BUDGET if long_running else PER_TOOL_BUDGET,
        cancelled=cancelled_calls)
    roster = pctx['roster']
    sink_name = roster.get(pctx['sink_key'], {}).get('name', 'the committee')
    builder = GraphBuilder()
    for key in pctx['graph_nodes']:
        spec = roster[key]
        agent_model_id = _agent_model_id(spec, model_id, auto_tier, model_resolver)
        model = BedrockModel(model_id=agent_model_id, max_tokens=MAX_OUTPUT_TOKENS)
        tools = _build_tools(execute_tool, spec['tools'], user_id, user_jwt,
                             force_reauth, auth_holder, pctx)
        identity = (f"\n\n=== YOUR MODEL ===\nYou (this agent, {spec['name']}) are running on "
                    f"{_MODEL_DISPLAY.get(agent_model_id, agent_model_id)} via Amazon Bedrock."
                    if auto_tier else "")
        sys_prompt = (
            f"{base_system}{identity}\n\n=== YOUR ROLE ===\n{spec['role']}\n\n"
            "=== SPECIALIST DIRECTORY (context — who does what on this desk) ===\n"
            f"{pctx['routing_directory']}"
            f"{_graph_role_addendum(key, pctx)}\n\n"
            "OUTPUT DISCIPLINE: do NOT narrate process or write pre-tool preamble — call your "
            f"tool immediately (the UI shows tool calls visually). Only {sink_name} writes "
            "polished client prose; every other node returns a compact structured result."
        )
        agent = Agent(name=spec['name'], model=model, system_prompt=sys_prompt,
                      tools=tools, hooks=[capture, budget], callback_handler=None)
        # node_id = our short key so the stream's node_id maps straight back via _agent_key
        # (Strands would otherwise default node_id to the agent .name).
        builder.add_node(agent, node_id=key)

    for frm, to in pctx['graph_edges']:
        builder.add_edge(frm, to)
    builder.set_entry_point(pctx['entry_key'])
    # Graph-specific budgets (NOT the swarm's): the DAG always runs the full 5-layer pipeline,
    # so a node gets more wall-clock headroom (GRAPH_NODE_TIMEOUT) while the whole-graph budget
    # (GRAPH_EXEC_TIMEOUT) stays under the WebSocket bridge's 290s read timeout. The TOOL_BUDGET
    # loop cap is the real guard against a runaway node; these timeouts are the backstop.
    builder.set_node_timeout(LONG_NODE_TIMEOUT if long_running else GRAPH_NODE_TIMEOUT)
    builder.set_execution_timeout(LONG_EXEC_TIMEOUT if long_running else GRAPH_EXEC_TIMEOUT)

    return builder.build()


def _graph_marker_events(pctx):
    """Emit a COMPLETE tool-call frame carrying the __graph topology marker, so the UI can
    render the DAG (layers + edges) immediately, before any node runs. Rides the same
    tool-call-args channel as the swarm markers (frozen agentClient.ts forwards verbatim).
    Topology + node names come from the ACTIVE persona (pctx)."""
    gid = _uuid.uuid4().hex
    roster = pctx['roster']
    topo = {
        'entry': pctx['entry_key'],
        'edges': pctx['graph_edges'],
        'layers': pctx['graph_layers'],
        'nodes': {k: roster[k]['name'] for k in pctx['graph_nodes']},
    }
    return [
        _ev(ToolCallStartEvent(
            type=EventType.TOOL_CALL_START, tool_call_id=gid,
            tool_call_name='Orchestration graph')),
        _ev(ToolCallArgsEvent(
            type=EventType.TOOL_CALL_ARGS, tool_call_id=gid,
            delta=json.dumps({'__tool': 'graph', '__agent': pctx['entry_key'], '__graph': topo}))),
        _ev(ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=gid)),
        _ev(ToolCallResultEvent(
            type=EventType.TOOL_CALL_RESULT, message_id=_uuid.uuid4().hex,
            tool_call_id=gid, content=json.dumps({'topology': 'graph', 'nodes': len(pctx['graph_nodes'])}))),
    ]


def _agent_active_events(agent_key, roster):
    """Same active-agent frame the swarm uses (so the roster/graph nodes light up)."""
    return _sw._agent_active_events(agent_key, roster)


# SDK-VERSION COUPLING (isolated here on purpose): Strands 1.45.0 raises a plain Exception whose
# str() reads "Node '<id>' execution timed out after Ns" when a node exceeds its wall-clock
# budget. There is no typed timeout exception to catch, so we classify by (a) an
# asyncio.TimeoutError type check (robust) and (b) a lenient substring test that tolerates
# wording drift ("timed out" / "timeout"), then best-effort extract the node id. If a future
# SDK renames the message, we degrade to node='unknown' (still a graceful notice) rather than
# mis-propagating a raw banner — update this ONE helper if the wording changes.
def _classify_timeout(exc):
    """Return (is_timeout, node_id_or_None) for an exception raised out of Graph.stream_async."""
    import asyncio as _asyncio
    msg = str(exc)
    low = msg.lower()
    is_timeout = isinstance(exc, _asyncio.TimeoutError) or 'timed out' in low or 'timeout' in low
    if not is_timeout:
        return False, None
    node = None
    marker = "Node '"
    if marker in msg:
        try:
            node = msg.split(marker, 1)[1].split("'", 1)[0]
        except Exception:
            node = None
    return True, node


async def run_graph_events(message, base_system, model_id, user_id, user_jwt,
                           force_reauth, execute_tool, on_final=None, history=None,
                           auto_tier=False, model_resolver=None, long_running=False,
                           persona_ctx=None):
    """Drive the Strands **Graph** and YIELD AG-UI event dicts — same wire form as
    `swarm_strands.run_swarm_events`, so main.py/invoke and the frontend are unchanged.

    `persona_ctx` (personas.compile_persona) selects the desk — roster + graph topology.
    Defaults to the capital-markets desk so any caller that omits it is unchanged.

    Emits, per the frozen agentClient.ts contract:
      - a __graph topology frame first (the UI draws the DAG),
      - an agent-active frame as each node begins (nodes light up; parallel nodes light
        up together on a batch transition),
      - a batch __handoff frame on each graph layer transition (surfaces the edges),
      - TOOL_CALL_START/ARGS/END (+ __tool/__agent) and TOOL_CALL_RESULT per tool,
      - TEXT_MESSAGE_* for the FINAL answer (the sink node's memo),
      - a CUSTOM auth_required if a 3LO tool needs consent (handled exactly as the swarm).
    """
    pctx = persona_ctx or personas.compile_persona(personas.DEFAULT_PERSONA)
    roster = pctx['roster']
    key_by_name = pctx['key_by_name']
    sink_key = pctx['sink_key']
    auth_holder = _AuthHolder()
    results_by_id = {}
    graph = _build_graph(pctx, model_id, base_system, user_id, user_jwt, force_reauth,
                         auth_holder, results_by_id, execute_tool,
                         auto_tier=auto_tier, model_resolver=model_resolver,
                         long_running=long_running)

    current_key = pctx['entry_key']
    open_tool_ids = {}
    started_args = set()
    text_state = _TextState()
    active_seen = set()   # nodes we've already announced (avoid duplicate active frames)
    budget = _RunBudget() # shared budget notion (finding #3) — SAME class the swarm uses
    budget_stop = None    # reason string once a cap is hit

    # Draw the graph, then announce the entry node.
    for e in _graph_marker_events(pctx):
        yield e
    for e in _agent_active_events(current_key, roster):
        yield e
    active_seen.add(current_key)

    task = _build_task(message, history)
    timed_out_node = None  # backstop: a node hit the wall-clock timeout (fail-fast graph)
    try:
      async for sev in graph.stream_async(task):
        stype = sev.get('type')

        # ── Batch transition: one or more nodes completed, one or more become ready. In a
        # Graph these are LIST-valued; we surface an edge per (from→to) pair and light up
        # each newly-ready node. This is what renders the parallel fan-out/fan-in. ──
        if stype == 'multiagent_handoff':
            text_state.discard()
            from_ids = [_agent_key(x, key_by_name) for x in (sev.get('from_node_ids') or [])]
            to_ids = [_agent_key(x, key_by_name) for x in (sev.get('to_node_ids') or [])]
            for to_key in to_ids:
                frm_key = from_ids[0] if from_ids else current_key
                tcid = _uuid.uuid4().hex
                to_name = roster.get(to_key, {}).get('name', to_key)
                yield _ev(ToolCallStartEvent(
                    type=EventType.TOOL_CALL_START, tool_call_id=tcid,
                    tool_call_name=f"Edge → {to_name}"))
                yield _ev(ToolCallArgsEvent(
                    type=EventType.TOOL_CALL_ARGS, tool_call_id=tcid,
                    delta=json.dumps({
                        '__tool': 'handoff', '__agent': frm_key,
                        '__handoff': {
                            'from': frm_key, 'to': to_key,
                            'from_name': roster.get(frm_key, {}).get('name', frm_key),
                            'to_name': to_name,
                            # In a fixed graph the "reason" is the edge itself — say so plainly
                            # rather than inventing model narration.
                            'reason': f"graph edge {frm_key} → {to_key}"},
                    })))
                yield _ev(ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=tcid))
                yield _ev(ToolCallResultEvent(
                    type=EventType.TOOL_CALL_RESULT, message_id=_uuid.uuid4().hex,
                    tool_call_id=tcid,
                    content=json.dumps({'edge': 'traversed', 'to': to_name})))
            # Light up every newly-ready node (parallel branches light together).
            for to_key in to_ids:
                if to_key not in active_seen:
                    for e in _agent_active_events(to_key, roster):
                        yield e
                    active_seen.add(to_key)
            if to_ids:
                current_key = to_ids[-1]
            continue

        # ── Node start: announce it if we haven't already (covers the entry + any node
        # not surfaced via a handoff batch). ──
        if stype == 'multiagent_node_start':
            # Budget: each node execution counts toward the graph-node ceiling.
            budget.nodes += 1
            budget_stop = budget.exhausted()
            if budget_stop:
                break
            nk = _agent_key(sev.get('node_id'), key_by_name)
            current_key = nk
            if nk not in active_seen:
                for e in _agent_active_events(nk, roster):
                    yield e
                active_seen.add(nk)
            continue

        # ── Inner agent event: reuse the swarm's translator verbatim (text buffered,
        # tool-use streamed as START/ARGS/END, results drained on message). ──
        if stype == 'multiagent_node_stream':
            node_key = _agent_key(sev.get('node_id'), key_by_name)
            inner = sev.get('event') or {}
            budget.add_usage(inner)   # accumulate output tokens (best-effort)
            for out in _translate_inner(inner, node_key, open_tool_ids, started_args,
                                        results_by_id, text_state):
                yield out
            if auth_holder.pending:
                break
            budget_stop = budget.exhausted()
            if budget_stop:
                break
            continue

        # ── node_stop: the buffered text for a WORKER node is its structured hand-off to
        # the next node, NOT the client answer — discard it so only the Committee sink's
        # prose survives to be flushed. (The graph already carried the real result
        # downstream via node dependencies; see _build_node_input.) ──
        if stype == 'multiagent_node_stop':
            nk = _agent_key(sev.get('node_id'), key_by_name)
            if nk != sink_key:
                text_state.discard()
            continue

        # multiagent_result / other: nothing to emit (final text flushed below).
    except Exception as e:
        # The Graph is FAIL-FAST: one node's node_timeout (or crash) is re-raised out of
        # stream_async and would otherwise escape to main.py as a raw "Node '…' execution
        # timed out" RUN_ERROR banner. The TOOL_BUDGET loop cap makes this rare, but if it
        # still happens degrade gracefully. Non-timeout errors still propagate.
        is_timeout, node = _classify_timeout(e)
        if not is_timeout:
            raise
        timed_out_node = node or 'unknown'

    # ── 3LO consent path (identical to the swarm): surface auth_required, do NOT commit. ──
    if auth_holder.pending:
        yield _ev(CustomEvent(
            type=EventType.CUSTOM, name='auth_required',
            value={'auth_url': auth_holder.auth_url,
                   'message': 'Authorization required to access your fund positions. '
                              'Approve in the new tab, then choose "I\'ve approved — continue".'}))
        return

    # ── Budget ceiling hit: stop gracefully with a visible notice; do NOT commit to memory. ──
    if budget_stop:
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

    # ── Final answer: flush the surviving buffered segment (the sink node's memo). ──
    final = text_state.text()
    committed = bool(final)
    sink_name = roster.get(sink_key, {}).get('name', 'the committee')
    if timed_out_node and not final:
        # Backstop: a node exhausted its wall-clock budget before the sink synthesized.
        # Surface a calm, on-brand message instead of the raw Strands exception banner. Don't
        # commit it to memory (committed stays False) so a retry starts clean.
        node_name = roster.get(timed_out_node, {}).get('name', timed_out_node)
        final = (
            f"The **{node_name}** step ran long and the desk review didn't reach {sink_name}'s "
            "verdict in time. This usually means the request was very broad — try narrowing the "
            "mandate (e.g. fewer constraints or a single objective) and re-running.\n\n"
            "*The deterministic graph stopped early at a long-running node; no verdict was produced.*"
        )
    elif not final:
        final = (
            "I wasn't able to complete that request — the orchestration graph finished "
            f"without {sink_name} producing a verdict. Please try again, or "
            "narrow the request.\n\n*The deterministic graph completed without a final synthesis.*"
        )
    msg_id = _uuid.uuid4().hex
    yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role='assistant'))
    yield _ev(TextMessageContentEvent(
        type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta=final))
    yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))

    if on_final and committed:
        on_final(final)
