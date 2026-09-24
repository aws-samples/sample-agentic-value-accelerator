"""Cognito PreSignUp trigger: reject public-mail-provider domains.

Runs before Cognito writes the user record. Raising exits the flow and returns
the exception message as the error surfaced to the browser SDK, so keep the
message user-actionable.

Denylist is intentionally hardcoded rather than parameterized — the set is
stable, and a config knob would let an operator accidentally open the pool to
public mail with a one-line change.
"""

BLOCKED_DOMAINS = frozenset(
    d.strip().lower()
    for d in (
        "gmail.com", "googlemail.com",
        "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "ymail.com", "rocketmail.com",
        "hotmail.com", "hotmail.co.uk",
        "outlook.com", "outlook.co.uk",
        "live.com", "msn.com",
        "aol.com",
        "icloud.com", "me.com", "mac.com",
        "protonmail.com", "proton.me", "pm.me",
        "gmx.com", "gmx.net", "gmx.de",
        "mail.com",
        "yandex.com", "yandex.ru",
        "qq.com", "163.com", "126.com", "sina.com", "sina.cn",
        "naver.com", "hanmail.net", "daum.net",
        "zoho.com",
        "fastmail.com", "fastmail.fm",
        "duck.com", "duckduckgo.com",
        "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
        "hey.com",
        "tutanota.com", "tuta.io",
        "example.com", "example.org", "test.com",
    )
)


def _domain_of(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1] if "@" in email else ""


def handler(event, _context):
    attrs = (event.get("request") or {}).get("userAttributes") or {}
    email = attrs.get("email") or event.get("userName") or ""
    domain = _domain_of(email)

    if not domain:
        raise Exception("An email address is required to sign up.")
    if domain in BLOCKED_DOMAINS:
        raise Exception(
            "Please sign up with your official company email address. "
            "Public email providers (Gmail, Yahoo, Hotmail, Outlook, iCloud, etc.) "
            "are not accepted."
        )

    # Auto-confirm is intentionally NOT set — users still verify their email
    # so we know the address is reachable. The response block below just
    # tells Cognito to proceed with the normal verification flow.
    event["response"]["autoConfirmUser"] = False
    event["response"]["autoVerifyEmail"] = False
    event["response"]["autoVerifyPhone"] = False
    return event
