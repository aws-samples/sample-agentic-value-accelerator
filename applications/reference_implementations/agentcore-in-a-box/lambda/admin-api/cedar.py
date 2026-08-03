"""
Cedar policy re-materialization for the platform-layer (Gateway) kill-switch.

The AgentCore Gateway is created with AWS_IAM inbound auth, so from Cedar's point of view
the principal is ALWAYS the agent runtime's gateway role — Cedar here cannot tell alice
from bob. That is by design: per-USER enforcement lives in the runtime pre-check and the
Gateway REQUEST interceptor (both of which see the verified user JWT). This module owns the
COMPLEMENTARY platform backstop: a single "tool blocklist" Cedar policy that scoped-`forbid`s
any Gateway-fronted tool that is globally revoked (denied for every managed user). It is a
real MCP-boundary kill-switch — even if the runtime code were bypassed, the Gateway itself
refuses a blocklisted tool.

We keep ONE policy (not one-per-tool) and express the blocklist as a single Cedar statement:

    forbid(principal,
           action in [AgentCore::Action::"secure-vault___secure_vault", ...],
           resource == AgentCore::Gateway::"<gateway-arn>");

Empty blocklist → a redundant blanket permit (a harmless no-op over Policy A). This reuses
the exact scoped-forbid + IGNORE_ALL_FINDINGS pattern the original vault toggle proved works.

Env (set by deploy.sh; all optional — the module no-ops safely if unwired):
    REGION, POLICY_ENGINE_ID, GATEWAY_ARN, BLOCKLIST_POLICY_ID
"""
import os
import boto3

import entitlements as E

REGION = os.environ.get('REGION', 'us-west-2')
POLICY_ENGINE_ID = os.environ.get('POLICY_ENGINE_ID', '')
GATEWAY_ARN = os.environ.get('GATEWAY_ARN', '')
BLOCKLIST_POLICY_ID = os.environ.get('BLOCKLIST_POLICY_ID', '')

_client = boto3.client('bedrock-agentcore-control', region_name=REGION)

# A no-op permit used when nothing is blocked (an empty forbid is invalid Cedar).
_PERMIT_NOOP = 'permit(principal, action, resource is AgentCore::Gateway);'


def _wired():
    return bool(POLICY_ENGINE_ID and GATEWAY_ARN and BLOCKLIST_POLICY_ID)


def _statement_for(blocked_actions):
    """Build the Cedar statement for a set of namespaced tool actions."""
    actions = sorted(a for a in blocked_actions if a)
    if not actions:
        return _PERMIT_NOOP
    action_list = ', '.join(f'AgentCore::Action::"{a}"' for a in actions)
    return (
        f'forbid(principal, action in [{action_list}], '
        f'resource == AgentCore::Gateway::"{GATEWAY_ARN}");'
    )


def apply_tool_blocks(blocked_tool_names):
    """Re-materialize the blocklist policy to forbid exactly `blocked_tool_names` (a set of
    TOOL names). Only tools with a Gateway action are representable in Cedar; others are
    silently ignored (they are runtime-enforced only). No-ops if the policy isn't wired."""
    if not _wired():
        # LOG LOUDLY: this backstop silently no-ops if deploy.sh didn't wire the policy env. A
        # quiet skip means a failed wiring looks like success — surface it so it's noticed.
        print('CEDAR WARNING: tool-blocklist backstop NOT WIRED '
              '(missing POLICY_ENGINE_ID/GATEWAY_ARN/BLOCKLIST_POLICY_ID) — the platform Cedar '
              'kill-switch is INACTIVE; per-user runtime + interceptor layers still enforce. '
              'Re-run deploy.sh to wire it.', flush=True)
        return {'wired': False}
    actions = []
    for name in blocked_tool_names:
        spec = E.TOOL_CATALOG.get(name) or {}
        act = spec.get('gateway_action')
        if act:
            actions.append(act)
    statement = _statement_for(actions)
    # IGNORE_ALL_FINDINGS: a broad-principal scoped forbid trips the analyzer's
    # "overly restrictive" finding, which is advisory here (intentional kill-switch).
    _client.update_policy(
        policyEngineId=POLICY_ENGINE_ID,
        policyId=BLOCKLIST_POLICY_ID,
        definition={'cedar': {'statement': statement}},
        validationMode='IGNORE_ALL_FINDINGS',
    )
    return {'wired': True, 'blocked_actions': sorted(actions), 'statement': statement}


def get_blocked_actions():
    """Read the current blocklist policy and return the set of forbidden tool actions
    (for status display). Returns [] if unwired or on any read error."""
    if not _wired():
        return []
    try:
        pol = _client.get_policy(policyEngineId=POLICY_ENGINE_ID, policyId=BLOCKLIST_POLICY_ID)
        stmt = pol.get('definition', {}).get('cedar', {}).get('statement', '') or ''
        if not stmt.strip().startswith('forbid'):
            return []
        # Extract the AgentCore::Action::"..." tokens.
        import re
        return re.findall(r'AgentCore::Action::"([^"]+)"', stmt)
    except Exception as e:
        print(f'CEDAR get_blocked WARN: {type(e).__name__}: {e}', flush=True)
        return []
