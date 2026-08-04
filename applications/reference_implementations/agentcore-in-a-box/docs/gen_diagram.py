#!/usr/bin/env python3
"""Generate architecture.svg for the Meridian AgentCore demo using the OFFICIAL AWS
Architecture Service Icons (extracted into diagram-icons-official.json).

Single regenerable source of truth for docs/architecture.svg. Banded TOP-TO-BOTTOM
layout with ORTHOGONAL (right-angle) connectors routed through the gutters between
bands — no diagonals crossing boxes. Reflects the current system: an 11-agent Strands
multi-agent desk on AgentCore Runtime, all 8 AgentCore primitives, both Identity flows
(3LO on-behalf-of the PM + M2M as the firm), and the FRED/ICE bond-data pipeline.

Run:  python3 docs/gen_diagram.py   (writes docs/architecture.svg)
"""
import json
import os

_here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_here, 'diagram-icons-official.json'), encoding='utf-8') as _icons_f:
    ICONS = json.load(_icons_f)

W, H = 1440, 1285
parts = []


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ── defs: fonts, arrow markers (data + control-plane) ────────────────────────────
defs = ['<defs>']
defs.append('<style>'
            'text{font-family:"Segoe UI",Helvetica,Arial,sans-serif;}'
            '.lbl{fill:#232f3e;font-size:13px;font-weight:600;text-anchor:middle;}'
            '.sub{fill:#5a6b7b;font-size:10.5px;text-anchor:middle;}'
            '.tier{fill:#8794a3;font-size:12px;font-weight:700;letter-spacing:1px;}'
            '.edge{fill:#566;font-size:10px;text-anchor:middle;}'
            '.chip{fill:#232f3e;font-size:11px;font-weight:600;text-anchor:middle;}'
            '.inset{fill:#8794a3;font-size:10.5px;font-weight:700;letter-spacing:1px;}'
            '</style>')
defs.append('<marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            '<path d="M0 0 L7 3 L0 6 z" fill="#7a8896"/></marker>')
defs.append('<marker id="arrowc" markerWidth="9" markerHeight="9" refX="7" refY="3" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            '<path d="M0 0 L7 3 L0 6 z" fill="#b06fd6"/></marker>')
defs.append('</defs>')
parts.append('\n'.join(defs))


def _icon_tile(cx, cy, key, title, sub='', size=54):
    ic = ICONS[key]
    vb = [float(v) for v in ic['viewBox'].split()]
    side = vb[2] or 64.0
    sc = size / side
    x, y = cx - size / 2, cy - size / 2
    cid = f'clip_{key.replace("-", "_")}_{int(cx)}_{int(cy)}'
    g = [f'<g transform="translate({x:.1f},{y:.1f})">']
    g.append(f'<clipPath id="{cid}"><rect width="{size}" height="{size}" rx="9"/></clipPath>')
    g.append(f'<g clip-path="url(#{cid})">')
    g.append(f'<rect width="{size}" height="{size}" fill="{ic["bg"]}"/>')
    g.append(f'<g transform="scale({sc:.5f})">{ic["body"]}</g>')
    g.append('</g></g>')
    ty = cy + size / 2 + 15
    g.append(f'<text class="lbl" x="{cx}" y="{ty}">{esc(title)}</text>')
    if sub:
        g.append(f'<text class="sub" x="{cx}" y="{ty+14}">{esc(sub)}</text>')
    return '\n'.join(g)


def aws_tile(cx, cy, key, title, sub='', size=54):
    return _icon_tile(cx, cy, key, title, sub, size)


def agent_tile(cx, cy, title, sub='', size=54):
    return _icon_tile(cx, cy, 'agentcore', title, sub, size)


def plain_tile(cx, cy, title, sub='', bg='#4b5563', mono='', size=54):
    x, y = cx - size / 2, cy - size / 2
    g = [f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="9" fill="{bg}"/>']
    if mono:
        g.append(f'<text x="{cx}" y="{cy+5}" text-anchor="middle" '
                 f'style="fill:#fff;font-size:13px;font-weight:700;letter-spacing:.5px">{esc(mono)}</text>')
    ty = cy + size / 2 + 15
    g.append(f'<text class="lbl" x="{cx}" y="{ty}">{esc(title)}</text>')
    if sub:
        g.append(f'<text class="sub" x="{cx}" y="{ty+14}">{esc(sub)}</text>')
    return '\n'.join(g)


def container(x, y, w, h, label, stroke):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" '
                 f'fill="none" stroke="{stroke}" stroke-width="1.6" stroke-dasharray="6 5"/>')
    parts.append(f'<text class="tier" x="{x+16}" y="{y+22}" fill="{stroke}">{esc(label)}</text>')


def inset(x, y, w, h, label, stroke='#117a65', fill='#f4faf8'):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>')
    parts.append(f'<text class="inset" x="{x+14}" y="{y+20}" fill="{stroke}">{esc(label)}</text>')


def chip(cx, cy, text, border, w=None):
    w = w or (len(text) * 6.6 + 26)
    h = 26
    x, y = cx - w / 2, cy - h / 2
    parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" rx="13" '
                 f'fill="#ffffff" stroke="{border}" stroke-width="1.6"/>')
    parts.append(f'<text class="chip" x="{cx}" y="{cy+4}">{esc(text)}</text>')
    return w


def _edge_label(mx, my, label):
    parts.append(f'<rect x="{mx-len(label)*3.0-4:.1f}" y="{my-11:.1f}" '
                 f'width="{len(label)*6.0+8:.1f}" height="15" rx="3" fill="#ffffff" opacity="0.96"/>')
    parts.append(f'<text class="edge" x="{mx:.1f}" y="{my:.1f}">{esc(label)}</text>')


def _stroke(ctrl, dash):
    color = '#b06fd6' if ctrl else '#7a8896'
    mk = 'arrowc' if ctrl else 'arrow'
    da = ' stroke-dasharray="5 4"' if dash else ''
    return color, mk, da


def line(x1, y1, x2, y2, label='', dash=False, ctrl=False, lx=None, ly=None):
    """Straight orthogonal segment (use for pure vertical / horizontal runs)."""
    color, mk, da = _stroke(ctrl, dash)
    parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" '
                 f'stroke-width="1.7"{da} marker-end="url(#{mk})"/>')
    if label:
        _edge_label(lx if lx is not None else (x1 + x2) / 2,
                    ly if ly is not None else (y1 + y2) / 2, label)


def elbow(x1, y1, x2, y2, midx=None, midy=None, label='', dash=False, ctrl=False,
          lx=None, ly=None, r=9):
    """Orthogonal connector with ONE bend, rounded. Give midx to go vertical→turn→
    horizontal at column midx (H-then-V is midy). Right-angle only, never diagonal."""
    color, mk, da = _stroke(ctrl, dash)
    if midx is not None:                       # V from (x1,y1) to y2, then H to x2
        sy = 1 if y2 > y1 else -1
        sx = 1 if x2 > midx else -1
        d = (f'M{x1} {y1} L{x1} {y2-sy*r} Q{x1} {y2} {x1+sx*r} {y2} '
             f'L{x2} {y2}')
    else:                                       # H from (x1,y1) to midy? default: H then V
        my = midy if midy is not None else y1
        sx = 1 if x2 > x1 else -1
        sy = 1 if y2 > my else -1
        d = (f'M{x1} {my} L{x2-sx*r} {my} Q{x2} {my} {x2} {my+sy*r} '
             f'L{x2} {y2}')
    parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.7"{da} '
                 f'marker-end="url(#{mk})"/>')
    if label:
        _edge_label(lx, ly, label)


def zbus(x1, y1, x2, y2, busy, label='', dash=False, ctrl=False, lx=None, ly=None, r=9):
    """Z-route: V from (x1,y1) down to horizontal bus at busy, H across, V to (x2,y2).
    This is how cross-band edges travel through a gutter without crossing boxes."""
    color, mk, da = _stroke(ctrl, dash)
    sx = 1 if x2 > x1 else -1
    s1 = 1 if busy > y1 else -1
    s2 = 1 if y2 > busy else -1
    d = (f'M{x1} {y1} L{x1} {busy-s1*r} Q{x1} {busy} {x1+sx*r} {busy} '
         f'L{x2-sx*r} {busy} Q{x2} {busy} {x2} {busy+s2*r} L{x2} {y2}')
    parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.7"{da} '
                 f'marker-end="url(#{mk})"/>')
    if label:
        _edge_label(lx if lx is not None else (x1 + x2) / 2,
                    ly if ly is not None else busy - 4, label)


def route(pts, label='', dash=False, ctrl=False, lx=None, ly=None, r=9):
    """General orthogonal connector through explicit waypoints (list of (x,y)).
    Consecutive segments must be axis-aligned; corners are rounded by radius r."""
    color, mk, da = _stroke(ctrl, dash)
    d = [f'M{pts[0][0]} {pts[0][1]}']
    for i in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
        # approach point on incoming segment
        if x0 == x1:      # incoming vertical
            ay = y1 - (r if y1 > y0 else -r)
            d.append(f'L{x1} {ay}')
        else:             # incoming horizontal
            ax = x1 - (r if x1 > x0 else -r)
            d.append(f'L{ax} {y1}')
        # leaving point on outgoing segment
        if x1 == x2:      # outgoing vertical
            by = y1 + (r if y2 > y1 else -r)
            d.append(f'Q{x1} {y1} {x1} {by}')
        else:             # outgoing horizontal
            bx = x1 + (r if x2 > x1 else -r)
            d.append(f'Q{x1} {y1} {bx} {y1}')
    d.append(f'L{pts[-1][0]} {pts[-1][1]}')
    parts.append(f'<path d="{" ".join(d)}" fill="none" stroke="{color}" '
                 f'stroke-width="1.7"{da} marker-end="url(#{mk})"/>')
    if label and lx is not None and ly is not None:
        _edge_label(lx, ly, label)


print("helpers ready")

# ── background + title ───────────────────────────────────────────────────────────
parts.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
parts.append(f'<text x="{W/2}" y="36" text-anchor="middle" '
             f'style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:21px;'
             f'font-weight:700;fill:#232f3e">Meridian — Amazon Bedrock AgentCore Architecture</text>')
parts.append(f'<text x="{W/2}" y="56" text-anchor="middle" '
             f'style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12.5px;'
             f'fill:#5a6b7b">An 11-agent fixed-income desk on the Strands SDK — every tool call a governed AgentCore primitive</text>')

# ── node coordinates (centers) — full-width bands, top-to-bottom flow ────────────
C = dict(
    # CLIENT band
    cf=(140, 140), s3=(320, 140), cog=(1300, 140),
    # APPLICATION band
    wsapi=(140, 300), wslam=(340, 300), httpapi=(560, 300), ptlam=(750, 300),
    # AGENTCORE — runtime row
    runtime=(250, 458), model=(560, 458), obs=(820, 458),
    # AGENTCORE — primitives row
    gw=(150, 845), policy=(340, 845), mem=(560, 845),
    brow=(760, 845), code=(960, 845), ident=(1200, 845),
    # GOVERNED tool lambdas (directly under the Gateway that calls them)
    vault=(120, 1004), udata=(300, 1004), ddb=(470, 1004), bondingest=(660, 1004),
    # DOWNSTREAM band
    fred=(660, 1176), mktapi=(870, 1176), portapi=(1070, 1176), portdb=(1250, 1176),
)
def L(k): return C[k]

# ── tier containers (full-width bands) ───────────────────────────────────────────
container(30,   76,   1380, 138, 'CLIENT', '#7a8896')
container(30,   232,  1380, 148, 'APPLICATION LAYER', '#ec7211')
container(30,   398,  1380, 520, 'AMAZON BEDROCK AGENTCORE', '#117a65')
container(30,   936,  1380, 148, 'GOVERNED TOOLS  ·  Lambdas the Gateway invokes', '#ec7211')
container(30,   1102, 1380, 150, 'DOWNSTREAM RESOURCES  ·  reached via AgentCore Identity', '#946ad6')

# nested insets inside the AgentCore band
inset(60,  528, 850, 196, 'STRANDS MULTI-AGENT DESK  ·  11 specialists  ·  Swarm  ∥  Graph')
inset(96,  800, 328, 112, 'GOVERNED')
inset(486, 800, 588, 112, 'MANAGED CAPABILITIES')

# ═══ EDGES (orthogonal; drawn before tiles so tiles overlay endpoints) ═══════════
# --- CLIENT ---
line(167, 140, 293, 140, 'origin')                                     # CloudFront → S3
route([(140,113),(140,100),(1300,100),(1300,113)],                     # CloudFront → Cognito (top)
      'Hosted UI auth', dash=True, ctrl=True, lx=720, ly=96)
# --- CLIENT → APPLICATION ---
line(140, 167, 140, 273, 'WS · JWT', lx=185, ly=232)                   # CloudFront → WebSocket API
route([(140,167),(140,225),(560,225),(560,273)],                       # CloudFront → HTTP API
      'POST /policy', lx=355, ly=221)
# --- APPLICATION internal ---
line(167, 300, 313, 300)                                               # WebSocket API → websocket λ
line(587, 300, 723, 300)                                               # HTTP API → policy-toggle λ
# --- APPLICATION → AGENTCORE (separate bus heights so the runs don't coincide) ---
route([(340,327),(340,360),(250,360),(250,428)],                       # websocket λ → Runtime
      'invoke (bearer JWT)', lx=455, ly=356)
route([(750,327),(750,372),(42,372),(42,845),(313,845)],               # policy-toggle λ → Policy Engine
      'UpdatePolicy', dash=True, ctrl=True, lx=615, ly=368)
# --- AGENTCORE runtime row ---
line(280, 458, 533, 458, 'inference')                                  # Runtime → Bedrock Models
route([(250,428),(250,412),(820,412),(820,431)],                       # Runtime → Observability
      'OTEL spans', lx=535, ly=408)
line(250, 488, 250, 524)                                               # Runtime → Desk
# --- DESK → primitives (fan down through the gutter 724..800) ---
line(150, 724, 150, 818, 'MCP · SigV4', lx=196, ly=770)                # Desk → Gateway
line(560, 724, 560, 818, 'store / recall', lx=612, ly=770)             # Desk → Memory
line(760, 724, 760, 818, 'fetch', lx=790, ly=770)                      # Desk → Browser
route([(880,724),(880,762),(960,762),(960,818)], 'run', lx=902, ly=758)  # Desk → Code Interpreter
route([(900,724),(900,748),(1200,748),(1200,818)],                     # Desk → Identity
      'vend token', ctrl=True, lx=1050, ly=744)
line(313, 845, 177, 845, 'Cedar permit / forbid', dash=True, ctrl=True, lx=245, ly=838)  # Policy → Gateway
# --- GATEWAY → governed tool lambdas (gutter 912..936) ---
route([(135,872),(135,948),(120,948),(120,977)], 'vault', lx=170, ly=930)      # → vault-tool
route([(150,872),(150,930),(300,930),(300,977)], 'userdata', lx=245, ly=926)   # → userdata-tool
route([(165,872),(165,922),(660,922),(660,977)], 'bond-tools', lx=470, ly=918) # → bond-ingest
line(327, 1004, 443, 1004, 'per-PM data')                              # userdata-tool → DynamoDB
line(660, 1149, 660, 1031, 'FRED / ICE feed', lx=722, ly=1090)         # FRED → bond-ingest (up)
# --- IDENTITY → downstream (two flows) ---
route([(1210,872),(1210,1090),(1070,1090),(1070,1149)],                # 3LO
      '3LO · on behalf of PM', ctrl=True, lx=1140, ly=1086)
route([(1190,872),(1190,1072),(870,1072),(870,1149)],                  # M2M
      'M2M · as the firm', ctrl=True, lx=1010, ly=1068)
line(1097, 1176, 1223, 1176, 'positions')                              # Portfolio API → Positions DB
# --- COGNITO → IDENTITY (OAuth2 IdP for 3LO consent) ---
route([(1300,167),(1300,795),(1200,795),(1200,818)],                   # Cognito → Identity
      'OAuth2 consent (3LO)', dash=True, ctrl=True, lx=1250, ly=791)

# ═══ TILES ═══════════════════════════════════════════════════════════════════════
# CLIENT
parts.append(aws_tile(*L('cf'),  'aws-cloudfront', 'CloudFront', 'CDN / TLS'))
parts.append(aws_tile(*L('s3'),  'aws-s3', 'S3', 'React SPA'))
parts.append(aws_tile(*L('cog'), 'aws-cognito', 'Cognito', 'Hosted UI · OAuth2 IdP'))
# APPLICATION
parts.append(aws_tile(*L('wsapi'),   'aws-api-gateway', 'WebSocket API', 'chat stream'))
parts.append(aws_tile(*L('wslam'),   'aws-lambda',      'websocket', 'bridge → runtime'))
parts.append(aws_tile(*L('httpapi'), 'aws-api-gateway', 'HTTP API', '/policy · /oauth'))
parts.append(aws_tile(*L('ptlam'),   'aws-lambda',      'policy-toggle', 'JWT-authorized'))
# AGENTCORE — runtime row
parts.append(agent_tile(*L('runtime'), 'Runtime', 'agent container · arm64', size=60))
parts.append(agent_tile(*L('model'),   'Bedrock Models', 'tiered per agent'))
parts.append(agent_tile(*L('obs'),     'Observability', 'OTEL → CloudWatch'))
# AGENTCORE — primitives row
parts.append(agent_tile(*L('gw'),     'Gateway', 'governed MCP'))
parts.append(agent_tile(*L('policy'), 'Policy Engine', 'Cedar'))
parts.append(agent_tile(*L('mem'),    'Memory', 'long-term recall'))
parts.append(agent_tile(*L('brow'),   'Browser', 'Playwright/CDP'))
parts.append(agent_tile(*L('code'),   'Code Interpreter', 'sandboxed Python'))
parts.append(agent_tile(*L('ident'),  'Identity', '3LO + M2M'))
# GOVERNED tool lambdas
parts.append(aws_tile(*L('vault'),      'aws-lambda',   'vault-tool', 'restricted secrets'))
parts.append(aws_tile(*L('udata'),      'aws-lambda',   'userdata-tool', 'per-PM funds'))
parts.append(aws_tile(*L('ddb'),        'aws-dynamodb', 'DynamoDB', 'user data · sessions'))
parts.append(aws_tile(*L('bondingest'), 'aws-lambda',   'bond-ingest', '~3,000-bond universe'))
# DOWNSTREAM
parts.append(plain_tile(*L('fred'),   'FRED / ICE BofA', 'Treasury curve · OAS', bg='#37648b', mono='DATA'))
parts.append(aws_tile(*L('mktapi'),   'aws-api-gateway', 'Market-Data API', 'licensed feed (M2M)'))
parts.append(aws_tile(*L('portapi'),  'aws-api-gateway', 'Portfolio API', 'scopes: read · trade'))
parts.append(aws_tile(*L('portdb'),   'aws-dynamodb',    'Positions DB', 'per-PM positions'))

# ── agent desk chips (inside the desk inset x 60..910, y 528..724) ───────────────
GRN, BLU, PUR, PNK, TEA, DK = '#16a34a', '#2f7fd6', '#8b5cf6', '#e0338a', '#0d9488', '#334155'
chip(485, 580, 'Lead Coordinator', GRN)                 # router
chip(185, 622, 'Macro & Rates', PNK)                    # scouts (parallel)
chip(370, 622, 'Universe & Data', BLU)
chip(560, 622, 'Credit Research', PUR)
chip(745, 622, 'Compliance', DK)
chip(180, 664, 'Risk & Quant', PUR)                     # builders / analysts
chip(360, 664, 'Perf. Attribution', PUR)
chip(560, 664, 'ESG & Sustainability', TEA)
chip(760, 664, 'Liquidity & Micro', BLU)
chip(300, 704, 'Portfolio & Execution', DK)             # execution + sink
chip(560, 704, 'Investment Committee', DK)

# ── legend ──────────────────────────────────────────────────────────────────────
parts.append(f'<text x="44" y="{H-18}" '
             f'style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;fill:#8794a3">'
             f'Solid grey = request / data flow      Purple = identity &amp; policy control plane      '
             f'Dashed = auth / consent (not a data-plane call)</text>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
       f'width="{W}" height="{H}" role="img" '
       f'aria-label="Meridian AgentCore architecture diagram">\n'
       + '\n'.join(parts) + '\n</svg>\n')
with open(os.path.join(_here, 'architecture.svg'), 'w', encoding='utf-8') as _svg_f:
    _svg_f.write(svg)
print('wrote architecture.svg', len(svg), 'bytes')
