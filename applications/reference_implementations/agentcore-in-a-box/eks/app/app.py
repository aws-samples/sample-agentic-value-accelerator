"""Realtime Market Data service — a small internal API that runs on EKS and is exposed to the
agent platform as a governed MCP tool through the AgentCore Gateway (OpenAPI target).

This stands in for Michelle's "internally-built MCPs and APIs to provide access to real-time data"
running on her own compute (EKS). It is deliberately dependency-free (Python stdlib http.server
only) so the container is tiny and has no supply-chain surface.

CONTRACT (matches eks/openapi.json, which the Gateway parses to synthesize the `market_quote` tool):
  GET  /healthz                 → liveness/readiness probe (no auth)
  POST /quote  {symbols:[...]}   → live-ish quotes for the requested tickers

AUTH: the AgentCore Gateway injects a shared API key as the `x-agentcore-api-key` header (from its
API_KEY credential provider — never supplied by the model). This service VALIDATES that header on
/quote and 401s without it, so the EKS workload is reachable ONLY through the governed Gateway
boundary, never anonymously. The key is read from the API_KEY env var (a Kubernetes Secret).

The "realtime" quotes are generated deterministically from the symbol + the current minute so the
demo shows values that move over time without needing a real market feed (the point is the governed
path from an external MCP client → Gateway → this EKS service, not the data vendor)."""
import hashlib
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', '8080'))
# The shared key the Gateway's API_KEY credential provider injects. Empty ⇒ auth disabled (only for
# local `docker run` smoke tests; the K8s Deployment always sets it from a Secret).
API_KEY = os.environ.get('API_KEY', '')
API_KEY_HEADER = os.environ.get('API_KEY_HEADER', 'x-agentcore-api-key')
# Optional: name the pod/host in responses so a demo can see WHICH replica served the call.
HOSTNAME = os.environ.get('HOSTNAME', 'eks-pod')

# A tiny reference book so unknown tickers still return something sensible.
_BASE = {
    'AAPL': 231.0, 'MSFT': 430.0, 'NVDA': 128.0, 'AMZN': 185.0, 'GOOGL': 178.0,
    'JPM': 205.0, 'GS': 480.0, 'TLT': 92.0, 'IEF': 95.0, 'SPY': 545.0, 'AGG': 98.0,
}


def _quote(symbol):
    """A deterministic pseudo-live quote for `symbol`: a stable base price nudged by a per-minute
    hash so the number moves between calls without a real feed. Not investment data — demo only."""
    sym = (symbol or '').upper().strip()[:12] or 'UNKN'
    base = _BASE.get(sym)
    if base is None:
        # Derive a stable base from the symbol so unknown tickers are consistent within a run.
        base = 50 + (int(hashlib.sha256(sym.encode()).hexdigest()[:6], 16) % 450)
    minute = int(time.time() // 60)
    # ±1.5% wobble keyed on (symbol, minute) — same within a minute, drifts across minutes.
    h = int(hashlib.sha256(f'{sym}:{minute}'.encode()).hexdigest()[:8], 16)
    drift = ((h % 3000) / 100000.0) - 0.015  # in [-0.015, +0.015)
    price = round(base * (1 + drift), 2)
    spread = round(max(0.01, price * 0.0004), 2)
    return {
        'symbol': sym,
        'bid': round(price - spread, 2),
        'ask': round(price + spread, 2),
        'last': price,
        'currency': 'USD',
        'as_of': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'venue': 'AGENTCORE-DEMO-FEED',
    }


class Handler(BaseHTTPRequestHandler):
    # Quieter logs (one line/req is enough; CloudWatch/kubectl logs capture it).
    def log_message(self, fmt, *args):
        print(f'{self.command} {self.path} - {fmt % args}', flush=True)

    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.rstrip('/') in ('/healthz', '/health', '/ready'):
            self._send(200, {'status': 'ok', 'service': 'market-data', 'pod': HOSTNAME})
            return
        self._send(404, {'error': 'not found'})

    def _authorized(self):
        """The Gateway-injected API key must be present + correct. If API_KEY is unset (local dev),
        auth is disabled. Header lookup is case-insensitive (Gateway/ELB may normalize casing)."""
        if not API_KEY:
            return True
        got = ''
        for k, v in self.headers.items():
            if k.lower() == API_KEY_HEADER.lower():
                got = v or ''
                break
        return got == API_KEY

    def do_POST(self):
        if self.path.rstrip('/') != '/quote':
            self._send(404, {'error': 'not found'})
            return
        if not self._authorized():
            # The workload is reachable ONLY through the governed Gateway (which injects the key).
            self._send(401, {'error': 'missing or invalid API key — this service is reachable only '
                                      'through the AgentCore Gateway'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0) or 0)
            raw = self.rfile.read(length) if length else b'{}'
            req = json.loads(raw or b'{}')
        except (ValueError, TypeError):
            self._send(400, {'error': 'invalid JSON body'})
            return
        symbols = req.get('symbols') or []
        if isinstance(symbols, str):
            symbols = [s.strip() for s in symbols.split(',') if s.strip()]
        if not symbols:
            symbols = ['SPY', 'AGG', 'TLT']  # a sensible default basket
        symbols = symbols[:25]  # cap fan-out
        quotes = [_quote(s) for s in symbols]
        self._send(200, {
            'quotes': quotes,
            'count': len(quotes),
            'served_by': HOSTNAME,
            'source': 'EKS market-data service via AgentCore Gateway',
            'disclaimer': 'Synthetic demo quotes — not investment data.',
        })


if __name__ == '__main__':
    print(f'market-data service listening on :{PORT} (auth={"on" if API_KEY else "off"})', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
