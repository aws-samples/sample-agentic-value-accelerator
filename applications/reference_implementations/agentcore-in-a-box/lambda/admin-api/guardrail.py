"""Bedrock Guardrails content filter — the prompt/response PII + secret gate.

A thin, dependency-free (boto3 only) wrapper around the Bedrock Runtime `ApplyGuardrail` API. The
guardrail itself (PII entities + secret regexes) is provisioned in CDK (lib/agent_core-stack.ts
CfnGuardrail); this module just APPLIES it to text and returns a structured verdict the runtime can
act on — BLOCK the turn, or forward the (possibly PII-masked) text.

Call site in agent/main.py:
  • the user prompt, BEFORE the model/tools run — a secret/SSN/card BLOCKS the turn; email/phone
    PII is MASKED so it never reaches the model or a downstream tool.

IMPORTANT Bedrock semantic (verified live 2026-07-22): the PII ANONYMIZE action only rewrites text
when the `source` is 'OUTPUT'; with source='INPUT' Bedrock BLOCKs but does not mask. Since we want
to BOTH block secrets AND mask PII in the PROMPT, we scan the prompt with source='OUTPUT' (we are
applying the guardrail TO a piece of text; OUTPUT mode gives the full block+mask behavior). `check()`
takes the source explicitly so a caller can still do a pure INPUT (block-only) pass if desired.

Fail-open by design: if the guardrail isn't configured (no GUARDRAIL_ID) or ApplyGuardrail errors,
`check()` returns a PASS verdict with `enforced=False`. Content filtering is a safety augmentation,
not the authorization boundary — a guardrail outage must not brick every turn. Every BLOCK/mask is
surfaced to the caller so main.py can emit an AUDIT line.
"""
import os

import boto3

REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))
GUARDRAIL_ID = os.environ.get('GUARDRAIL_ID', '')
# ApplyGuardrail accepts 'DRAFT' (the unpublished working version) as a valid identifier, so the
# demo works with no published version. A prod deploy pins a numeric published version.
GUARDRAIL_VERSION = os.environ.get('GUARDRAIL_VERSION', 'DRAFT')

_client = None


def _brt():
    global _client
    if _client is None:
        _client = boto3.client('bedrock-runtime', region_name=REGION)
    return _client


def enabled():
    """True iff a guardrail id is configured (so the runtime can skip the call cheaply)."""
    return bool(GUARDRAIL_ID)


class Verdict:
    """The result of a guardrail check.

    passed   — True unless the guardrail intervened with a BLOCK (a hard stop for this turn).
    enforced — True iff the guardrail was actually applied (False = not configured / errored → PASS).
    action   — the raw guardrail action ('NONE' | 'GUARDRAIL_INTERVENED' | 'ERROR' | 'DISABLED').
    text     — the (possibly PII-masked) text to use going forward. On a BLOCK this is the original
               text (the caller stops the turn and shows `message` instead).
    masked   — True iff the guardrail ANONYMIZE-masked some PII in `text`.
    reasons  — short human-readable reasons (which policies tripped), for the audit line + UI.
    message  — the client-facing message to show on a BLOCK.
    """
    __slots__ = ('passed', 'enforced', 'action', 'text', 'masked', 'reasons', 'message')

    def __init__(self, passed, enforced, action, text, masked, reasons, message=''):
        self.passed = passed
        self.enforced = enforced
        self.action = action
        self.text = text
        self.masked = masked
        self.reasons = reasons
        self.message = message


def _passthrough(text, reason='not_configured'):
    return Verdict(passed=True, enforced=False, action='DISABLED', text=text,
                   masked=False, reasons=[reason])


def scan_prompt(text):
    """Scan a user PROMPT for secrets/PII. Uses source='OUTPUT' so Bedrock both BLOCKS secrets/SSN/
    cards AND MASKS email/phone/name (INPUT mode only blocks). Returns a Verdict — .passed=False on a
    block, .text carries the PII-masked prompt otherwise."""
    return check(text, source='OUTPUT')


def check(text, source):
    """Apply the guardrail to `text`. `source` ∈ {'INPUT','OUTPUT'} tells Bedrock which policy
    direction to evaluate (OUTPUT also performs PII ANONYMIZE masking; INPUT only blocks). Returns a
    Verdict. Never raises (fail-open)."""
    if not GUARDRAIL_ID:
        return _passthrough(text)
    if not text or not str(text).strip():
        return _passthrough(text, reason='empty')
    try:
        resp = _brt().apply_guardrail(
            guardrailIdentifier=GUARDRAIL_ID,
            guardrailVersion=GUARDRAIL_VERSION,
            source=source,  # 'INPUT' or 'OUTPUT'
            content=[{'text': {'text': str(text)}}],
        )
    except Exception as e:
        # Fail-open: a guardrail outage must not deny a turn (it's not the authz boundary).
        print(f'GUARDRAIL apply error ({source}), failing open: {type(e).__name__}: {e}', flush=True)
        return _passthrough(text, reason=f'error:{type(e).__name__}')

    action = resp.get('action', 'NONE')
    reasons = _reasons(resp)
    # The masked/redacted text Bedrock returns (present when PII is ANONYMIZE-masked).
    out_text = text
    outputs = resp.get('outputs') or []
    if outputs and isinstance(outputs[0], dict):
        out_text = outputs[0].get('text', text) or text
    masked = (out_text != text)

    if action == 'GUARDRAIL_INTERVENED':
        # Did anything BLOCK (vs. only ANONYMIZE)? A BLOCK stops the turn; mask-only lets it proceed
        # with the sanitized text. Inspect the assessment for any 'BLOCKED' action.
        blocked = _has_block(resp)
        if blocked:
            return Verdict(passed=False, enforced=True, action=action, text=text, masked=masked,
                           reasons=reasons or ['blocked_content'],
                           message='Blocked by the AgentCore content guardrail: the '
                                   f'{"prompt" if source == "INPUT" else "response"} appeared to '
                                   'contain a secret or disallowed content.')
        # Intervened but only masked PII → PASS with the sanitized text.
        return Verdict(passed=True, enforced=True, action=action, text=out_text, masked=True,
                       reasons=reasons or ['pii_masked'])
    return Verdict(passed=True, enforced=True, action=action, text=out_text, masked=masked, reasons=reasons)


def _has_block(resp):
    """True iff any assessment entry carries a BLOCK/BLOCKED action (as opposed to ANONYMIZED)."""
    for a in resp.get('assessments', []) or []:
        sip = a.get('sensitiveInformationPolicy', {}) or {}
        for coll in (sip.get('piiEntities', []), sip.get('regexes', [])):
            for item in (coll or []):
                if str(item.get('action', '')).upper() in ('BLOCK', 'BLOCKED'):
                    return True
        # Other policy families (content/word/topic) intervene with a block too.
        for fam in ('contentPolicy', 'wordPolicy', 'topicPolicy'):
            block = a.get(fam, {}) or {}
            for key in ('filters', 'customWords', 'managedWordLists', 'topics'):
                for item in (block.get(key, []) or []):
                    if str(item.get('action', '')).upper() in ('BLOCK', 'BLOCKED'):
                        return True
    return False


def _reasons(resp):
    """Short reason strings (which PII types / regex names / filters tripped) for audit + UI."""
    out = []
    for a in resp.get('assessments', []) or []:
        sip = a.get('sensitiveInformationPolicy', {}) or {}
        for e in (sip.get('piiEntities', []) or []):
            out.append(f"pii:{e.get('type', '?')}:{str(e.get('action', '')).lower()}")
        for r in (sip.get('regexes', []) or []):
            out.append(f"regex:{r.get('name', '?')}:{str(r.get('action', '')).lower()}")
        for f in ((a.get('contentPolicy', {}) or {}).get('filters', []) or []):
            out.append(f"content:{f.get('type', '?')}")
    # De-dup while keeping order.
    seen, dedup = set(), []
    for r in out:
        if r not in seen:
            seen.add(r)
            dedup.append(r)
    return dedup
