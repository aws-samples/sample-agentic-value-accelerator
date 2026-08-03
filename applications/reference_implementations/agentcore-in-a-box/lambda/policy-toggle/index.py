"""
Policy Toggle Lambda - Enables/disables access to the secure_vault TOOL.
Demonstrates the fine-grained Cedar policy feature of AgentCore Gateway.

The toggle flips a DEDICATED, TOOL-SCOPED policy (VAULT_POLICY_ID) between a
scoped permit (vault ON — a no-op over the blanket permit) and a scoped forbid
(vault OFF — a Cedar `forbid` that overrides the blanket permit for this ONE tool
only). This means disabling the vault no longer blocks the whole gateway — bond /
portfolio / positions tools keep working. See the scoped-Cedar memory for the
per-tool action naming (AgentCore::Action::"<target>___<tool>") and the important
Gateway decision-cache behaviour (tightening is instant; re-enabling lags).

Backward-compat: if VAULT_POLICY_ID / GATEWAY_ARN are not wired (older deploy),
falls back to flipping the blanket POLICY_ID between permit/forbid (old behaviour).
"""
import json
import os
import boto3

region = os.environ.get('REGION', 'us-west-2')
client = boto3.client('bedrock-agentcore-control', region_name=region)

# The Cognito group whose members may flip the guardrail. Mirrors admin-api's ADMIN_GROUP.
ADMIN_GROUP = os.environ.get('ADMIN_GROUP', 'admins')

# Blanket policy (permanent permit) — kept only for the legacy fallback path.
POLICY_ENGINE_ID = os.environ.get('POLICY_ENGINE_ID', '')
POLICY_ID = os.environ.get('POLICY_ID', '')

# Fine-grained path: the tool-scoped policy we actually flip, plus the gateway ARN
# and tool action needed to build the scoped Cedar statements.
VAULT_POLICY_ID = os.environ.get('VAULT_POLICY_ID', '')
GATEWAY_ARN = os.environ.get('GATEWAY_ARN', '')
# Namespaced <targetName>___<toolName> — must match the gateway target + tool name.
VAULT_TOOL_ACTION = os.environ.get('VAULT_TOOL_ACTION', 'secure-vault___secure_vault')

# Blanket statements (legacy fallback only).
PERMIT_POLICY = 'permit(principal, action, resource is AgentCore::Gateway);'
FORBID_POLICY = 'forbid(principal, action, resource is AgentCore::Gateway);'


def _scoped(effect):
    """Build a Cedar statement scoped to ONLY the secure_vault tool on this gateway."""
    return (
        f'{effect}(principal, '
        f'action == AgentCore::Action::"{VAULT_TOOL_ACTION}", '
        f'resource == AgentCore::Gateway::"{GATEWAY_ARN}");'
    )


def _use_scoped():
    return bool(VAULT_POLICY_ID and GATEWAY_ARN)


def _target_policy_id():
    return VAULT_POLICY_ID if _use_scoped() else POLICY_ID


def _statement_for(enable):
    """The Cedar statement to write for the requested state."""
    if _use_scoped():
        # ON  -> scoped permit (redundant over the blanket permit; harmless no-op)
        # OFF -> scoped forbid (overrides the blanket permit for this one tool)
        return _scoped('permit') if enable else _scoped('forbid')
    return PERMIT_POLICY if enable else FORBID_POLICY


def _claims(event):
    """The verified JWT claims injected by the API Gateway HttpUserPoolAuthorizer. We never
    parse the raw token here — API Gateway already validated signature/issuer/expiry/audience."""
    try:
        return event['requestContext']['authorizer']['jwt']['claims'] or {}
    except (KeyError, TypeError):
        return {}


def _is_admin(event):
    """True iff the verified token's cognito:groups contains the admins group. Cognito may
    surface the claim as a JSON array, a bracketed string, or a comma/space list — normalize.
    Mirrors admin-api/entitlements.is_admin so both control-plane routes enforce identically."""
    groups = _claims(event).get('cognito:groups', [])
    if not groups:
        return False
    if isinstance(groups, str):
        groups = groups.strip().strip('[]').replace('"', '')
        groups = [g.strip() for g in groups.replace(',', ' ').split()]
    try:
        return ADMIN_GROUP in set(groups)
    except TypeError:
        return False


def handler(event, context):
    """Toggle the policy between permit and forbid for the secure_vault tool.

    SECURITY: the /policy/toggle route is Cognito-authorized at the API Gateway, but that only
    proves the caller is a VALID user — not an admin. Flipping the platform guardrail is an
    admin action, so we ALSO require the verified JWT's cognito:groups to contain `admins`
    server-side (mirrors admin-api). A valid non-admin token gets 403; enforcement does NOT
    rely on the frontend hiding the toggle. `status` (read-only) is allowed for any authed user
    so the UI can render the current guardrail state."""
    body = json.loads(event.get('body', '{}'))
    action = body.get('action', 'status')  # 'enable', 'disable', or 'status'

    # Mutating actions are admin-only; the read-only status probe is open to any authed user.
    if action in ('enable', 'disable') and not _is_admin(event):
        return response(403, {
            'error': 'Forbidden: admin group required',
            'hint': 'Your identity is valid but lacks the admins group.',
        })

    policy_id = _target_policy_id()
    if not POLICY_ENGINE_ID or not policy_id:
        return response(500, {'error': 'Policy engine/policy not configured'})

    try:
        if action == 'status':
            policy = client.get_policy(
                policyEngineId=POLICY_ENGINE_ID,
                policyId=policy_id,
            )
            statement = policy.get('definition', {}).get('cedar', {}).get('statement', '')
            # ON when the statement is a permit (or contains no forbid at all).
            is_enabled = statement.strip().startswith('permit') or 'forbid' not in statement
            return response(200, {
                'enabled': is_enabled,
                'scoped': _use_scoped(),
                'policy': statement,
            })

        elif action in ('enable', 'disable'):
            enable = action == 'enable'
            # IGNORE_ALL_FINDINGS is REQUIRED: a broad-principal scoped forbid trips the
            # Cedar analyzer's "Overly Restrictive / DENY_ALL" finding, which would fail the
            # update under the default FAIL_ON_ANY_FINDINGS. The finding is advisory here
            # (the forbid is intentionally scoped to one tool action).
            # NB: update_policy does NOT accept enforcementMode (only create_policy does).
            # The policy is created ACTIVE and we flip state by swapping the statement.
            client.update_policy(
                policyEngineId=POLICY_ENGINE_ID,
                policyId=policy_id,
                definition={'cedar': {'statement': _statement_for(enable)}},
                validationMode='IGNORE_ALL_FINDINGS',
            )
            msg = (
                'Secure Vault tool access ENABLED' if enable
                else 'Secure Vault tool access DISABLED (this tool only — other gateway tools stay live)'
            )
            return response(200, {'enabled': enable, 'scoped': _use_scoped(), 'message': msg})

        else:
            return response(400, {'error': f'Unknown action: {action}'})

    except Exception as e:
        return response(500, {'error': str(e)})


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body),
    }
