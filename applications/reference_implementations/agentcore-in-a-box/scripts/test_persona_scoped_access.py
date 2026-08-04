#!/usr/bin/env python3
"""
Standalone regression checks for the Persona-Scoped Access feature — the two pure, security-
critical cores that have no other automated coverage:

  1. entitlements.evaluate / allows  — expiry-aware + the fail-open-until-scoped `agents` rule.
  2. personas.prune_roster           — edge-contraction keeps entry→sink reachable when a mid-DAG
                                        specialist is revoked (a broken contraction would silently
                                        drop the committee verdict or KeyError the graph build).

Run: python3 scripts/test_persona_scoped_access.py   (exit 0 = all pass). No AWS, no deps.
"""
import sys

sys.path.insert(0, 'agent')
import entitlements as E  # noqa: E402
import personas as P  # noqa: E402

NOW = 1_000_000.0


def _reachable(entry, sink, edges):
    adj = {}
    for a, b in edges:
        adj.setdefault(a, []).append(b)
    seen, stack = {entry}, [entry]
    while stack:
        for m in adj.get(stack.pop(), []):
            if m not in seen:
                seen.add(m)
                stack.append(m)
    return sink in seen, seen


def test_expiry_and_agents_semantics():
    # Unmanaged → fail-open everywhere (incl. agents).
    u = E.evaluate({}, now=NOW)
    assert E.allows(u, 'desks', 'banking')
    assert E.allows(u, 'agents', 'banking::fraud')

    # Managed on desks/tools but NO agents item → agents dimension fail-open.
    m = E.evaluate({'meta': {'managed': True},
                    'desks': {'grants': {'capital_markets': True, 'banking': False}}}, now=NOW)
    assert m['managed'] and not m['agents_managed']
    assert E.allows(m, 'desks', 'capital_markets')
    assert not E.allows(m, 'desks', 'banking')
    assert E.allows(m, 'agents', 'capital_markets::trading')  # unmanaged agents → open
    assert E.blocked_agents(m, 'capital_markets') == set()

    # Agents scoped → default-deny within the dimension; structural keys never gated.
    a = E.evaluate({'meta': {'managed': True},
                    'agents': {'grants': {'capital_markets::universe': True,
                                          'capital_markets::research': True}}}, now=NOW)
    assert a['agents_managed']
    assert E.allows(a, 'agents', 'capital_markets::universe')
    assert not E.allows(a, 'agents', 'capital_markets::trading')
    assert E.allows(a, 'agents', 'capital_markets::orchestrator')  # structural → allow
    blk = E.blocked_agents(a, 'capital_markets')
    assert 'trading' in blk and 'compliance' in blk
    assert 'orchestrator' not in blk and 'committee' not in blk

    # Time-boxing: an expired grant denies; a live one allows and is surfaced for countdown.
    exp = E.evaluate({'meta': {'managed': True},
                      'desks': {'grants': {'banking': True}, 'expiries': {'banking': NOW - 1}}}, now=NOW)
    assert not E.allows(exp, 'desks', 'banking')
    assert exp['expiries']['desks'] == {}
    live = E.evaluate({'meta': {'managed': True},
                       'desks': {'grants': {'banking': True}, 'expiries': {'banking': NOW + 3600}}}, now=NOW)
    assert E.allows(live, 'desks', 'banking')
    assert live['expiries']['desks'] == {'banking': NOW + 3600}


def test_catalog_integrity():
    for k, spec in E.AGENT_CATALOG.items():
        assert k == E.agent_key(spec['desk'], spec['key'])
        assert spec['key'] not in E.STRUCTURAL_AGENT_KEYS
        assert spec['desk'] in E.DESK_CATALOG
    for d in E.DESK_CATALOG:
        assert set(P.revocable_agents(d)) == {E.AGENT_CATALOG[k]['key'] for k in E.agents_for_desk(d)}


def test_prune_roster_keeps_sink_reachable():
    cases = [
        ('capital_markets', {'analytics'}),                          # mid-DAG choke (fan-in+out)
        ('capital_markets', {'macro', 'universe'}),                  # whole layer-2 fan-out
        ('capital_markets', {'attribution', 'esg', 'liquidity'}),    # whole penultimate layer
        ('insurance', {'pricing', 'catmodel'}),
        ('banking', {'underwriting', 'portfolio', 'fraud'}),
        ('fintech', {'analytics', 'esg'}),
    ]
    for persona, blocked in cases:
        pctx = P.compile_persona(persona)
        pr = P.prune_roster(pctx, blocked)
        ok, seen = _reachable(pr['entry_key'], pr['sink_key'], pr['graph_edges'])
        assert ok, f'{persona} block={blocked}: sink unreachable'
        ns = set(pr['graph_nodes'])
        assert ns - seen == set(), f'{persona} block={blocked}: orphaned {ns - seen}'
        for a, b in pr['graph_edges']:
            assert a in ns and b in ns, f'{persona}: dangling edge {a}->{b}'
        for k in pr['graph_nodes']:
            assert k in pr['roster'], f'{persona}: node {k} missing from roster (KeyError at build)'
        for k in blocked:
            assert k not in pr['roster']
            assert pctx['roster'][k]['name'] not in pr['routing_directory']  # not advertised
        assert pr['entry_key'] in pr['roster'] and pr['sink_key'] in pr['roster']

    # Structural nodes are never pruned; a no-op prune returns the same object.
    pctx = P.compile_persona('capital_markets')
    pr = P.prune_roster(pctx, {'orchestrator', 'committee'})
    assert 'orchestrator' in pr['roster'] and 'committee' in pr['roster']
    assert P.prune_roster(pctx, set()) is pctx
    assert P.prune_roster(pctx, None) is pctx


def test_scope_tools_prefilters_and_is_copy_on_write():
    # scope_tools removes ONLY blocked tools, never mutates the shared module roster, rebuilds the
    # routing directory, and composes with prune_roster while keeping entry→sink reachable.
    pctx = P.compile_persona('capital_markets')
    before_dir = pctx['routing_directory']
    scoped = P.scope_tools(pctx, {'secure_vault', 'web_browser'})
    assert scoped is not pctx
    # original (shared module specs) untouched
    assert any('secure_vault' in s['tools'] for s in pctx['roster'].values())
    all_tools = [t for s in scoped['roster'].values() for t in s['tools']]
    assert 'secure_vault' not in all_tools and 'web_browser' not in all_tools
    assert set(scoped['pruned_tools']) == {'secure_vault', 'web_browser'}
    assert scoped['routing_directory'] != before_dir  # directory no longer advertises them

    # No-op paths return the SAME object (zero overhead on the common path).
    assert P.scope_tools(pctx, set()) is pctx
    assert P.scope_tools(pctx, None) is pctx
    assert P.scope_tools(pctx, {'not_a_real_tool'}) is pctx

    # A specialist whose only tool is stripped stays in the roster with an empty toolset (tools
    # scoping trims tools; only the agents dimension prunes whole nodes).
    scoped2 = P.scope_tools(pctx, {'secure_vault'})
    comp = [k for k, s in scoped2['roster'].items() if s['name'] == 'Compliance & Controls']
    assert comp and scoped2['roster'][comp[0]]['tools'] == []

    # Composes with prune_roster: sink still reachable, blocked tool gone.
    pr = P.prune_roster(P.compile_persona('banking'), {'fraud'})
    sc = P.scope_tools(pr, {'stress_test'})
    ok, _ = _reachable(sc['entry_key'], sc['sink_key'], sc['graph_edges'])
    assert ok
    assert 'stress_test' not in [t for s in sc['roster'].values() for t in s['tools']]


def main():
    tests = [test_expiry_and_agents_semantics, test_catalog_integrity,
             test_prune_roster_keeps_sink_reachable, test_scope_tools_prefilters_and_is_copy_on_write]
    for t in tests:
        t()
        print(f'  PASS {t.__name__}')
    print(f'ALL {len(tests)} persona-scoped-access checks PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
