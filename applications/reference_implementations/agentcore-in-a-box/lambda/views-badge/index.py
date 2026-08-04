"""Views badge: counts raw views and all-time unique visitors, returns an SVG.

Embedded as an image in README.md (and optionally other pages via ?page=).
Served with no-store headers so every render hits the counter.

Counting model:
- views: every non-bot render.
- visitors: distinct (IP + user-agent) fingerprints, all-time (no expiry).
  Behind CloudFront the viewer IP is the first X-Forwarded-For entry;
  requestContext sourceIp would be the CloudFront edge and collapse
  everyone into one visitor.
- Bots/CLIs (link previews, crawlers, curl) get the badge but don't count.
"""
import hashlib
import os
import re

import boto3

TABLE_NAME = os.environ.get("TABLE_NAME", "agentcore-demo-views")
PAGE_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
BOT_UA = ("bot", "slack", "crawler", "spider", "preview", "curl", "wget",
          "python-requests", "go-http-client", "headless")

ddb = boto3.client("dynamodb")


def _badge_svg(sections):
    """sections: list of (text, bg_color) rendered left to right."""
    char_w = 6.5
    pad = 10
    widths = [int(len(t) * char_w + pad) for t, _ in sections]
    total_w = sum(widths)
    aria = " ".join(t for t, _ in sections)
    rects, texts, x = [], [], 0
    for (text, color), w in zip(sections, widths):
        rects.append(f'<rect x="{x}" width="{w}" height="20" fill="{color}"/>')
        texts.append(f'<text x="{(x + w / 2) * 10:.0f}" y="140" transform="scale(.1)">{text}</text>')
        x += w
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="20" role="img" aria-label="{aria}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="{total_w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
{''.join(rects)}
<rect width="{total_w}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="110" text-rendering="geometricPrecision">
{''.join(texts)}
</g>
</svg>"""


def _bump(page, field):
    resp = ddb.update_item(
        TableName=TABLE_NAME,
        Key={"id": {"S": page}},
        UpdateExpression="ADD #f :one",
        ExpressionAttributeNames={"#f": field},
        ExpressionAttributeValues={":one": {"N": "1"}},
        ReturnValues="ALL_NEW",
    )
    return resp["Attributes"]


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    page = params.get("page", "readme")
    if not PAGE_RE.match(page):
        page = "readme"

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    ua = headers.get("user-agent", "")
    xff = headers.get("x-forwarded-for", "")
    ip = xff.split(",")[0].strip() if xff else \
        event.get("requestContext", {}).get("http", {}).get("sourceIp", "")

    is_bot = not ua or any(b in ua.lower() for b in BOT_UA)

    if is_bot:
        resp = ddb.get_item(TableName=TABLE_NAME, Key={"id": {"S": page}})
        attrs = resp.get("Item", {})
    else:
        attrs = _bump(page, "views")
        fingerprint = hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()[:32]
        try:
            ddb.put_item(
                TableName=TABLE_NAME,
                Item={"id": {"S": f"seen#{page}#{fingerprint}"}},
                ConditionExpression="attribute_not_exists(id)",
            )
            attrs = _bump(page, "visitors")
        except ddb.exceptions.ConditionalCheckFailedException:
            pass

    views = attrs.get("views", {}).get("N", "0")
    visitors = attrs.get("visitors", {}).get("N", "0")

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
        "body": _badge_svg([
            ("views", "#555"), (views, "#007ec6"),
            ("visitors", "#555"), (visitors, "#2ea44f"),
        ]),
    }
