"""
IAM least-privilege backstop for AGENT-side outbound credential grants — the
belt-and-suspenders analogue of cedar.py (which is the platform kill-switch for USER-side
tool grants at the Gateway). This module is the 4th enforcement layer for the creds
dimension of the RBAC story.

WHY THIS IS A REAL BACKSTOP (not cosmetic):
  Every outbound credential vend the agent performs — 3LO USER_FEDERATION, M2M
  client_credentials, and the API-key vault — ultimately reads the provider's backing
  secret out of the AgentCore-Identity Secrets Manager namespace
  (`bedrock-agentcore-identity!default/{oauth2,apikey}/<provider>-<hash>`) USING THE RUNTIME
  ROLE'S OWN CREDENTIALS. The stack grants that `secretsmanager:GetSecretValue` explicitly
  because without it the vend fails (see lib/agent_core-stack.ts). So if we attach a scoped
  explicit DENY for a revoked provider's secret ARN to the runtime role, the vend fails at
  the AWS control plane — Deny always beats Allow — even if the runtime pre-check and the
  Gateway interceptor were both bypassed. That is genuine defense in depth, not a toggle.

  (Honest nuance: the runtime pre-check already blocks the tool BEFORE any vend is attempted,
  and the SDK may briefly cache a freshly-minted token in-process. This IAM layer is the
  control-plane backstop for a bypassed/forced re-vend — the next GetSecretValue is denied.)

WHAT IT DOES:
  Maintains ONE inline policy (CRED_BLOCKLIST_POLICY_NAME) on the runtime role. Its single
  statement DENIES `secretsmanager:GetSecretValue` on the secret-ARN prefix of every globally
  revoked credential provider (revoked for the agent workload). Empty blocklist → the inline
  policy is DELETED (an IAM policy document must have ≥1 statement, and no residual deny is
  the correct "nothing blocked" state).

Env (set by deploy.sh; all optional — the module no-ops safely if unwired):
    REGION, ACCOUNT_ID, RUNTIME_ROLE_ARN (or RUNTIME_ROLE_NAME),
    and the provider-name vars named by CRED_CATALOG[*]['provider_env']
    (CREDENTIAL_PROVIDER_NAME, M2M_PROVIDER_NAME, FRED_APIKEY_PROVIDER_NAME).
"""
import os

import boto3

import entitlements as E

REGION = os.environ.get('REGION', 'us-west-2')
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', '')

# The inline policy we own on the runtime role. Fixed name so we always overwrite/delete the
# same policy (never accrete stale denies across re-materializations).
CRED_BLOCKLIST_POLICY_NAME = 'AgentCoreCredBlocklist'

_iam = boto3.client('iam', region_name=REGION)


def _runtime_role_name():
    """The friendly role name PutRolePolicy expects. Prefer an explicit name; else parse it
    from the ARN (`arn:aws:iam::acct:role/<path>/<name>` → final component)."""
    name = os.environ.get('RUNTIME_ROLE_NAME', '')
    if name:
        return name
    arn = os.environ.get('RUNTIME_ROLE_ARN', '')
    if ':role/' in arn:
        return arn.split(':role/', 1)[1].split('/')[-1]
    return ''


def _wired():
    return bool(ACCOUNT_ID and _runtime_role_name())


def _provider_name(cred_key):
    """Resolve a cred catalog key to its concrete (env-suffixed) provider name via the
    provider_env indirection, so we never hardcode per-env suffixes."""
    spec = E.CRED_CATALOG.get(cred_key) or {}
    env_var = spec.get('provider_env', '')
    return os.environ.get(env_var, '') if env_var else ''


def _secret_arn_prefix(cred_key):
    """Build the Secrets Manager ARN pattern for a provider's backing secret. The concrete
    secret is `bedrock-agentcore-identity!default/<vault>/<provider>-<hash>-<rand>`, so a
    trailing `-*` wildcard matches the CDK/service-appended hash + Secrets Manager's random
    6-char suffix. Returns '' if the provider isn't resolvable (skip it — never emit a broken
    ARN that could widen or misfire the deny)."""
    spec = E.CRED_CATALOG.get(cred_key) or {}
    vault = spec.get('secret_vault', '')
    provider = _provider_name(cred_key)
    if not (vault and provider):
        return ''
    return (f'arn:aws:secretsmanager:{REGION}:{ACCOUNT_ID}:secret:'
            f'bedrock-agentcore-identity!default/{vault}/{provider}-*')


def apply_cred_blocks(blocked_cred_keys):
    """Re-materialize the runtime-role inline DENY to forbid the backing secret of exactly
    `blocked_cred_keys` (a set/iterable of CRED_CATALOG keys). Empty → delete the policy.
    No-ops if unwired. Best-effort by contract: the caller must not fail a grant on an IAM
    hiccup (the runtime pre-check is the primary per-turn enforcement)."""
    if not _wired():
        # LOG LOUDLY: same rationale as cedar.py — a silent skip hides a failed wiring.
        print('IAM-CREDS WARNING: agent-side credential kill-switch NOT WIRED '
              '(missing ACCOUNT_ID/RUNTIME_ROLE_ARN) — the IAM secret-deny backstop is INACTIVE; '
              'the runtime pre-check still gates cred vends per turn. Re-run deploy.sh to wire it.',
              flush=True)
        return {'wired': False}

    role = _runtime_role_name()
    resources, applied_keys = [], []
    for key in sorted(set(blocked_cred_keys or [])):
        arn = _secret_arn_prefix(key)
        if arn:
            resources.append(arn)
            applied_keys.append(key)

    if not resources:
        # Nothing blocked → remove our inline policy entirely (no residual deny).
        try:
            _iam.delete_role_policy(RoleName=role, PolicyName=CRED_BLOCKLIST_POLICY_NAME)
        except _iam.exceptions.NoSuchEntityException:
            pass  # already absent — the desired state
        return {'wired': True, 'blocked_creds': [], 'policy': 'deleted'}

    document = {
        'Version': '2012-10-17',
        'Statement': [{
            'Sid': 'DenyRevokedCredentialProviderSecrets',
            'Effect': 'Deny',
            'Action': 'secretsmanager:GetSecretValue',
            'Resource': resources,
        }],
    }
    import json
    _iam.put_role_policy(
        RoleName=role,
        PolicyName=CRED_BLOCKLIST_POLICY_NAME,
        PolicyDocument=json.dumps(document),
    )
    return {'wired': True, 'blocked_creds': applied_keys, 'resources': resources}


def get_blocked_cred_keys():
    """Read the current inline blocklist and map its denied resource ARNs back to CRED_CATALOG
    keys (for status display). Returns [] if unwired, absent, or on any read error."""
    if not _wired():
        return []
    role = _runtime_role_name()
    try:
        resp = _iam.get_role_policy(RoleName=role, PolicyName=CRED_BLOCKLIST_POLICY_NAME)
    except _iam.exceptions.NoSuchEntityException:
        return []
    except Exception as e:
        print(f'IAM-CREDS get WARN: {type(e).__name__}: {e}', flush=True)
        return []
    doc = resp.get('PolicyDocument', {})
    # get_role_policy URL-decodes the document into a dict for us (boto3), but be defensive.
    if isinstance(doc, str):
        import json
        import urllib.parse
        try:
            doc = json.loads(urllib.parse.unquote(doc))
        except Exception:
            return []
    resources = set()
    for stmt in doc.get('Statement', []):
        if stmt.get('Effect') == 'Deny':
            res = stmt.get('Resource', [])
            resources.update([res] if isinstance(res, str) else res)
    blocked = []
    for key in E.CRED_CATALOG:
        if _secret_arn_prefix(key) in resources:
            blocked.append(key)
    return blocked
