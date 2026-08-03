"""
Demo Reset Lambda — restore the demo to a clean baseline between sessions.

Run this MANUALLY (e.g. `aws lambda invoke`) between demos to:
  1. Delete the extracted long-term memory records for the demo PMs, so the
     "remember which funds I run" beat starts fresh.
  2. Reset the positions table to its baseline (so a trade executed during a demo —
     e.g. TLT bumped to 20% — reverts).

It is NOT wired to any API route on purpose: it's an operator tool, invoked by
hand, not reachable from the app.

Env:
  MEMORY_ID      - AgentCore Memory id
  GRADES_TABLE   - positions DynamoDB table name (CDK resource name unchanged)
  USERDATA_TABLE - userdata table (to resolve PM subs is not needed; we take
                   subs from the event or env)
  ALICE_SUB / BOB_SUB - the demo PMs' Cognito subs (passed by the invoker or
                   set as env by deploy.sh)
"""
import json
import os
import boto3

REGION = os.environ.get('REGION', 'us-west-2')
MEMORY_ID = os.environ.get('MEMORY_ID', '')
GRADES_TABLE = os.environ.get('GRADES_TABLE', '')

_agentcore = boto3.client('bedrock-agentcore', region_name=REGION)
_ddb = boto3.resource('dynamodb', region_name=REGION)

# Baseline positions — must match deploy.sh's seed so reset == fresh deploy state. Keyed by the
# demo user's EMAIL (the reset resolves each email → Cognito sub at run time). Values are the
# per-book target-allocation maps (sort key = book/fund name), across all four persona desks.
BASELINE_GRADES = {
    # Capital markets — Meridian (fixed-income ETF weights)
    'alice@demo.com': [
        {'dataType': 'Core Bond Fund', 'positions': {'AGG': '30%', 'IEF': '20%', 'LQD': '20%', 'MUB': '15%', 'TIP': '15%'}},
        {'dataType': 'Short Duration Income Fund', 'positions': {'SHY': '45%', 'AGG': '25%', 'LQD': '20%', 'HYG': '10%'}},
    ],
    'bob@demo.com': [
        {'dataType': 'Government Securities Fund', 'positions': {'SHY': '25%', 'IEF': '35%', 'TLT': '30%', 'TIP': '10%'}},
    ],
    # Insurance — Ridgeline (book segment/line weights)
    'uw1@demo.com': [
        {'dataType': 'Coastal Property Book', 'positions': {'FL Habitational': '28%', 'TX Coastal Commercial': '24%', 'Gulf Marine/Cargo': '16%', 'SE Retail': '18%', 'Reinsurance Ceded': '14%'}},
        {'dataType': 'Middle-Market Property Book', 'positions': {'Midwest Manufacturing': '34%', 'Warehouse/Logistics': '26%', 'Retail Strip': '22%', 'Healthcare Facilities': '18%'}},
    ],
    'uw2@demo.com': [
        {'dataType': 'Umbrella & Excess Casualty Book', 'positions': {'Contractors GL': '30%', 'Products Liability': '22%', 'Commercial Auto Excess': '24%', 'Habitational Umbrella': '16%', 'Reinsurance Ceded': '8%'}},
        {'dataType': 'Group Term Life Book', 'positions': {'Employer Group Term': '48%', 'Voluntary Life': '26%', 'AD&D': '14%', 'Reinsurance Ceded': '12%'}},
    ],
    # Banking — Rampart (loan-book segment weights)
    'rm1@demo.com': [
        {'dataType': 'Commercial & Industrial Book', 'positions': {'Transportation & Logistics': '24%', 'Manufacturing': '22%', 'Healthcare Services': '18%', 'Wholesale Trade': '16%', 'Business Services': '12%', 'Cedar Ridge Logistics LLC': '8%'}},
        {'dataType': 'Small Business Book', 'positions': {'Retail': '30%', 'Food Service': '26%', 'Professional Services': '24%', 'Construction': '20%'}},
    ],
    'rm2@demo.com': [
        {'dataType': 'Commercial Real Estate Book', 'positions': {'Multifamily': '34%', 'Industrial / Warehouse': '26%', 'Retail (Grocery-anchored)': '18%', 'Office': '19%', 'Hospitality': '3%'}},
    ],
    # FinTech — Kairo (product/segment weights)
    'ops1@demo.com': [
        {'dataType': 'Consumer Wallet', 'positions': {'Debit': '48%', 'Credit': '22%', 'FX/Remittance': '18%', 'Crypto On-Ramp': '12%'}},
        {'dataType': 'Prepaid Card Program', 'positions': {'Payroll': '40%', 'Teen/Family': '30%', 'Gift/Incentive': '20%', 'Government Disbursement': '10%'}},
    ],
    'ops2@demo.com': [
        {'dataType': 'SMB Card Program', 'positions': {'Corporate Charge': '38%', 'Virtual Cards (AP)': '27%', 'Expense Cards': '23%', 'Fleet/Fuel': '12%'}},
    ],
}


def _reset_memory(actor_id):
    """Delete all extracted memory records for one PM across their namespaces."""
    if not MEMORY_ID:
        return 0
    deleted = 0
    # The demo's strategies write under user/{actorId} (semantic) and
    # user/{actorId}/sessions/{sessionId} (summary). A prefix wildcard covers both.
    namespaces = [f'user/{actor_id}', f'user/{actor_id}/']
    for ns in namespaces:
        token = None
        while True:
            kwargs = {'memoryId': MEMORY_ID, 'namespace': ns, 'maxResults': 100}
            if token:
                kwargs['nextToken'] = token
            try:
                resp = _agentcore.list_memory_records(**kwargs)
            except Exception as e:
                print(f'list_memory_records({ns}) error: {type(e).__name__}: {e}', flush=True)
                break
            records = resp.get('memoryRecordSummaries', resp.get('memoryRecords', []))
            ids = [r.get('memoryRecordId') for r in records if r.get('memoryRecordId')]
            for rid in ids:
                try:
                    _agentcore.delete_memory_record(memoryId=MEMORY_ID, memoryRecordId=rid)
                    deleted += 1
                except Exception as e:
                    print(f'delete_memory_record({rid}) error: {type(e).__name__}: {e}', flush=True)
            token = resp.get('nextToken')
            if not token:
                break
    return deleted


def _reset_grades(subs):
    """Overwrite the positions table back to baseline for the given demo users (keyed by email)."""
    if not GRADES_TABLE:
        return 0
    table = _ddb.Table(GRADES_TABLE)
    written = 0
    for who, sub in subs.items():
        if not sub:
            continue
        for row in BASELINE_GRADES.get(who, []):
            table.put_item(Item={'userId': sub, 'dataType': row['dataType'], 'positions': row['positions']})
            written += 1
    return written


def _resolve_subs():
    """Map every demo-user email → its Cognito sub, so reset covers all four persona desks
    without threading each sub through env vars. Needs USER_POOL_ID + cognito-idp:AdminGetUser.
    Falls back to the legacy ALICE_SUB/BOB_SUB env vars if the pool id isn't configured."""
    pool = os.environ.get('USER_POOL_ID', '')
    subs = {}
    if pool:
        idp = boto3.client('cognito-idp', region_name=REGION)
        for email in BASELINE_GRADES:
            try:
                resp = idp.admin_get_user(UserPoolId=pool, Username=email)
                sub = next((a['Value'] for a in resp.get('UserAttributes', []) if a['Name'] == 'sub'), '')
                if sub:
                    subs[email] = sub
            except Exception as e:
                print(f'admin_get_user({email}) error: {type(e).__name__}: {e}', flush=True)
    else:
        # Legacy fallback: only the capital-markets pair, from env.
        if os.environ.get('ALICE_SUB'):
            subs['alice@demo.com'] = os.environ['ALICE_SUB']
        if os.environ.get('BOB_SUB'):
            subs['bob@demo.com'] = os.environ['BOB_SUB']
    return subs


def handler(event, context):
    """Reset memory + positions for ALL demo users across the four persona desks. Resolves
    each user's Cognito sub by email (USER_POOL_ID env); event may still pass explicit
    {'alice_sub','bob_sub'} which are merged in for backward compatibility."""
    event = event or {}
    subs = _resolve_subs()
    if event.get('alice_sub'):
        subs['alice@demo.com'] = event['alice_sub']
    if event.get('bob_sub'):
        subs['bob@demo.com'] = event['bob_sub']

    mem_deleted = sum(_reset_memory(s) for s in subs.values() if s)
    grades_written = _reset_grades(subs)

    result = {
        'memory_records_deleted': mem_deleted,
        'grade_rows_reset': grades_written,
        'subs': {k: bool(v) for k, v in subs.items()},
    }
    print(json.dumps({'demo_reset': result}), flush=True)
    return {'statusCode': 200, 'body': json.dumps(result)}
