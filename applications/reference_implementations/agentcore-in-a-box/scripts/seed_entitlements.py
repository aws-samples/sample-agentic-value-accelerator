#!/usr/bin/env python3
"""
Seed default entitlements so the demo starts FULLY FUNCTIONAL, and the admin then REVOKES to
demonstrate enforcement (the compelling direction for a security demo — you watch access get
taken away and the agent get denied in real time).

Called by deploy.sh after all demo users exist. Idempotent: it only creates a principal's
records if they are ABSENT, so re-running deploy.sh never clobbers grants an admin has since
changed. Writes:
  • every demo USER  → all tools granted + all desks granted + meta(managed)
  • the AGENT workload → all credential providers granted + meta(managed)

TOP-UP for NEW catalog keys: a principal seeded on an OLDER deploy predates any tool/desk/
cred/agent added to the catalog since (e.g. `query_holdings`). Because the create path is
skipped once records exist, those principals would never receive the new key and — being
MANAGED — would default-DENY it forever. So after the create pass we ADD any catalog key that
is entirely ABSENT from a principal's existing grants map (granted true, matching the all-true
seed intent). We only add keys that aren't present at all, so a grant an admin has explicitly
set to false (present-and-false, i.e. a deliberate revoke) is never resurrected.

Usage: seed_entitlements.py <entitlements_table> <region> <agent_workload_name> <sub1> [sub2 ...]

Uses agent/entitlements.py (the canonical catalog) so the seed can never drift from the code.
"""
import sys
import time

import boto3

sys.path.insert(0, 'agent')  # canonical catalog lives in agent/entitlements.py
import entitlements as E  # noqa: E402


def _topup_new_keys(table, principal, kind_grants):
    """For an already-seeded principal, ADD any catalog key entirely ABSENT from its existing
    grants map (grant it true — matching the all-true seed intent). Keys already present — whether
    true or a deliberate admin revoke (false) — are left untouched. Returns the count added."""
    added_total = 0
    for dt, full_grants in kind_grants.items():
        item = table.get_item(Key={'principal': principal, 'dataType': dt}).get('Item')
        existing = (item or {}).get('grants') or {}
        missing = {k: True for k in full_grants if k not in existing}
        if not missing:
            continue
        if item is None:
            # A principal managed via other dims but with no item for THIS dim yet — create it.
            table.put_item(Item={
                'principal': principal, 'dataType': dt,
                'grants': {k: bool(v) for k, v in full_grants.items()},
                'updated_at': int(time.time()), 'updated_by': 'deploy-seed-topup',
            })
            added_total += len(full_grants)
            continue
        # SET only the missing sub-keys so we never touch existing grants/expiries.
        expr = 'SET ' + ', '.join(f'grants.#k{i} = :v{i}' for i in range(len(missing)))
        names = {f'#k{i}': k for i, k in enumerate(missing)}
        vals = {f':v{i}': True for i in range(len(missing))}
        expr += ', updated_at = :ua, updated_by = :ub'
        vals[':ua'] = int(time.time())
        vals[':ub'] = 'deploy-seed-topup'
        table.update_item(
            Key={'principal': principal, 'dataType': dt},
            UpdateExpression=expr, ExpressionAttributeNames=names, ExpressionAttributeValues=vals,
        )
        added_total += len(missing)
    if added_total:
        print(f'  entitlements: {principal} topped up {added_total} new catalog key(s)')
    return added_total


def _seed_principal(table, principal, kind_grants, label, kind):
    """Create records for `principal` only if it has NO records yet (idempotent). If the principal
    already has records, TOP UP any catalog keys added since it was seeded (so a new tool like
    query_holdings reaches pre-existing managed users without clobbering admin changes)."""
    existing = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('principal').eq(principal),
        Select='COUNT',
    )
    if existing.get('Count', 0) > 0:
        added = _topup_new_keys(table, principal, kind_grants)
        if not added:
            print(f'  entitlements: {principal} already seeded — leaving as-is')
        return
    now = int(time.time())
    for dt, grants in kind_grants.items():
        table.put_item(Item={
            'principal': principal, 'dataType': dt,
            'grants': {k: bool(v) for k, v in grants.items()},
            'updated_at': now, 'updated_by': 'deploy-seed',
        })
    table.put_item(Item={
        'principal': principal, 'dataType': E.DT_META,
        'managed': True, 'label': label, 'kind': kind,
        'updated_at': now, 'updated_by': 'deploy-seed',
    })
    print(f'  entitlements: seeded {principal} ({kind}, all granted)')


def main():
    if len(sys.argv) < 5:
        print('usage: seed_entitlements.py <table> <region> <agent_workload> <sub> [sub ...]')
        return 1
    table_name, region, agent_workload = sys.argv[1], sys.argv[2], sys.argv[3]
    subs = [s for s in sys.argv[4:] if s and s != 'None']
    table = boto3.resource('dynamodb', region_name=region).Table(table_name)

    # Users: all tools + all desks + all specialists (agents) granted, standing (no expiry) — the
    # demo starts fully functional and the admin then REVOKES / time-boxes to demonstrate
    # enforcement. Seeding the `agents` item makes each user agents_MANAGED (default-deny within
    # the dimension); a user with NO agents item stays fail-open (all specialists) for back-compat.
    user_grants = {
        E.DT_TOOLS: E.default_grants_for('tools', all_true=True),
        E.DT_DESKS: E.default_grants_for('desks', all_true=True),
        E.DT_AGENTS: E.default_grants_for('agents', all_true=True),
    }
    for sub in subs:
        _seed_principal(table, E.user_pk(sub), user_grants, label=sub, kind='user')

    # Agent workload: all credential providers granted.
    if agent_workload and agent_workload != 'None':
        agent_grants = {E.DT_CREDS: E.default_grants_for('creds', all_true=True)}
        _seed_principal(table, E.agent_pk(agent_workload), agent_grants,
                        label=agent_workload, kind='agent')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
