"""
Secure Vault Tool Lambda - Gateway Target for AgentCore Demo.

Returns restricted values (and runs screens) that ONLY this Lambda holds. The model
cannot reproduce or guess these — so when the Cedar policy blocks this gateway tool, the
agent genuinely CANNOT answer. This is the point of the policy demo: unlike math (which the
model can do unaided), a held secret / a lookup against a held list is unfakeable.

SOURCE OF TRUTH: an AWS Secrets Manager secret (a single JSON blob) whose id is passed in via
the ``VAULT_SECRET_ID`` env var (provisioned by the infra side). We fetch it once, parse the
JSON, and cache it in a module-global for the warm-container lifetime. Expected JSON keys:

    restricted_list            (str)   — illustrative restricted-trading line
    bloomberg_terminal_pin     (str)   — illustrative terminal PIN (demo placeholder)
    oms_master_pin             (str)   — illustrative OMS PIN (demo placeholder)
    counterparty_credit_memo   (str)   — illustrative internal credit memo
    sanctions_watchlist        (list)  — synthetic OFAC/AML-style names to screen against
    pep_list                   (list)  — synthetic politically-exposed-person names
    fraud_blocklist            (list)  — synthetic fraud-ring entity identifiers

If ``VAULT_SECRET_ID`` is unset OR the fetch fails, we fall back to the clearly-labeled
synthetic defaults below (so the demo still runs locally). Those defaults are REDACTED
placeholders on purpose — never real-looking PINs — and every returned value is tagged as
sensitive/illustrative so a scrutinizing customer sees a demo, not a live system of record.
"""
import json
import os

import boto3

VAULT_SECRET_ID = os.environ.get('VAULT_SECRET_ID', '')
_sm = boto3.client('secretsmanager')

# Which keys are screenable name/entity lists vs. scalar string secrets.
_LIST_KEYS = ('sanctions_watchlist', 'pep_list', 'fraud_blocklist')
_SCALAR_KEYS = ('restricted_list', 'bloomberg_terminal_pin', 'oms_master_pin', 'counterparty_credit_memo')

_DISCLAIMER = ('SYNTHETIC DEMO VALUE — held only by the vault Lambda for an AgentCore policy '
               'demonstration. Sensitive/illustrative; not a real credential, restriction, or '
               'watchlist. Report it ONLY if this tool actually returned it, quoted verbatim.')

# Clearly-synthetic fallback used ONLY when the Secrets Manager fetch is unavailable. Scalar
# secrets are REDACTED placeholders (never real-looking PINs); the lists are obviously-fake demo
# names so a screen still resolves deterministically without leaking a real list.
_FALLBACK = {
    'restricted_list': 'DEMO restricted list — SYNTHETIC-CO 5.1% 2031, SAMPLE-SOV USD 2035 (illustrative only)',
    'bloomberg_terminal_pin': 'DEMO-TERMINAL-PIN-REDACTED',
    'oms_master_pin': 'DEMO-OMS-PIN-REDACTED',
    'counterparty_credit_memo': 'DEMO memo — counterparty SYNTHETIC-COUNTERPARTY-A, illustrative internal rating BB-, sample cap $50MM (not real)',
    'sanctions_watchlist': ['SYNTHETIC SANCTIONS ENTITY A', 'DEMO BLOCKED TRADING CO', 'SAMPLE OFAC-STYLE NAME LLC'],
    'pep_list': ['DEMO PEP PERSON ONE', 'SYNTHETIC OFFICIAL TWO'],
    'fraud_blocklist': ['DEMO-FRAUD-RING-001', 'SYNTHETIC-BLOCKED-ENTITY-002'],
}

_CACHE = {'vault': None}


def _load_vault():
    """Fetch + cache the vault JSON from Secrets Manager. Falls back to the labeled synthetic
    defaults if the secret id is unset or the fetch/parse fails, so the demo still runs."""
    if _CACHE['vault'] is not None:
        return _CACHE['vault']
    vault = dict(_FALLBACK)
    if VAULT_SECRET_ID:
        try:
            resp = _sm.get_secret_value(SecretId=VAULT_SECRET_ID)
            parsed = json.loads(resp.get('SecretString') or '{}')
            if isinstance(parsed, dict):
                vault.update({k: v for k, v in parsed.items() if v is not None})
        except Exception as e:
            print(f'vault secret fetch failed ({type(e).__name__}: {e}); using synthetic defaults', flush=True)
    _CACHE['vault'] = vault
    return vault


def _screen(vault, list_key, name):
    """Screen a name/entity against a synthetic list. Deterministic: MATCH / CLEAR, and HOLD when
    the list can't be read (unscreenable = HOLD — never a silent pass)."""
    entries = vault.get(list_key)
    if not isinstance(entries, list):
        return {
            'screen_list': list_key, 'query': name, 'verdict': 'HOLD',
            'reason': 'list unavailable — an unscreenable name is a HOLD, not a pass',
            'list_kind': 'synthetic/demo watchlist',
            'source': 'AgentCore Gateway -> Secure Vault Lambda',
            'disclaimer': _DISCLAIMER,
        }
    nl = (name or '').strip().lower()
    if not nl:
        return {
            'screen_list': list_key, 'query': name, 'verdict': 'HOLD',
            'reason': 'no name supplied to screen — cannot clear an empty query',
            'list_kind': 'synthetic/demo watchlist', 'list_size': len(entries),
            'source': 'AgentCore Gateway -> Secure Vault Lambda',
            'disclaimer': _DISCLAIMER,
        }
    hits = [e for e in entries if nl == str(e).strip().lower() or nl in str(e).strip().lower()
            or str(e).strip().lower() in nl]
    verdict = 'MATCH' if hits else 'CLEAR'
    return {
        'screen_list': list_key, 'query': name, 'verdict': verdict,
        'matches': hits,
        'reason': ('name matched a synthetic/demo list entry' if hits
                   else 'no entry in the synthetic/demo list matched this name'),
        'list_kind': 'synthetic/demo watchlist', 'list_size': len(entries),
        'note': 'Report a MATCH only when this field says MATCH; never fabricate a match.',
        'source': 'AgentCore Gateway -> Secure Vault Lambda',
        'disclaimer': _DISCLAIMER,
    }


def handler(event, context):
    """Handle secure-vault invocations from AgentCore Gateway.

    Body args (all optional):
      secret_name  — which value/list to retrieve or screen against (default restricted_list)
      name/query   — a name to SCREEN against a watchlist (sanctions_watchlist/pep_list/fraud_blocklist)
    """
    body = event if isinstance(event, dict) else json.loads(event.get('body', '{}'))
    vault = _load_vault()

    key = body.get('secret_name', 'restricted_list')
    name = body.get('name') or body.get('query') or body.get('screen_name') or ''

    # 'list' enumeration is intentionally disabled: it would leak the set of secret names to the
    # model and never returns values. The model does not need to discover secret names.
    if key == 'list':
        return {
            'statusCode': 200,
            'body': json.dumps({
                'error': "secret enumeration is disabled; request a specific secret_name",
                'source': 'AgentCore Gateway -> Secure Vault Lambda',
                'disclaimer': _DISCLAIMER,
            })
        }

    # Screening path: a screenable list + a name → deterministic CLEAR/MATCH (HOLD if unreadable).
    if key in _LIST_KEYS and name:
        return {'statusCode': 200, 'body': json.dumps(_screen(vault, key, name))}

    if key not in vault:
        return {
            'statusCode': 404,
            'body': json.dumps({
                'error': f"No secret named '{key}'.",
                'disclaimer': _DISCLAIMER,
            })
        }

    # Retrieval path. For a screenable list with no name, return the (synthetic) list itself so the
    # model works from the real held data rather than inventing entries.
    if key in _LIST_KEYS:
        return {
            'statusCode': 200,
            'body': json.dumps({
                'secret_name': key,
                'list_kind': 'synthetic/demo watchlist',
                'entries': vault.get(key, []),
                'usage': 'pass a "name" to screen it against this list for a CLEAR/MATCH verdict',
                'source': 'AgentCore Gateway -> Secure Vault Lambda',
                'note': 'This list is held only by the Lambda; the model cannot derive it. It is synthetic/demo data.',
                'disclaimer': _DISCLAIMER,
            })
        }

    return {
        'statusCode': 200,
        'body': json.dumps({
            'secret_name': key,
            'secret_value': vault[key],
            'source': 'AgentCore Gateway -> Secure Vault Lambda',
            'note': 'This value is held only by the Lambda; it cannot be derived by the model. Report it only if returned here, quoted verbatim.',
            'disclaimer': _DISCLAIMER,
        })
    }
