"""Outbound HTTP for URLs the platform does not choose.

Several routes fetch a URL supplied in the request body - an A2A agent card, an
OIDC discovery document, a connector's instance URL. `urllib.request.urlopen`
will happily fetch any of them, which turns those routes into a proxy for
whatever the backend can reach but the caller cannot: the EC2 instance metadata
service, a VPC-internal admin port, another tenant's service.

The failure mode is the same one this module's neighbours exist to prevent: it
does not raise. The fetch succeeds, and the response - credentials, in the IMDS
case - comes back through an endpoint whose job is to say "yes, that URL looks
like a valid agent card".

Use `fetch()` for any URL that originates outside this process. Config-derived
URLs (a gateway endpoint from settings) do not need it, though they still need a
timeout.

Why the address check is a conjunction and not one property
----------------------------------------------------------
Measured on this image's Python (3.11), no single `ipaddress` predicate is
sufficient, and the two obvious choices each miss a real reachable target:

    100.64.0.1            is_private=False   <- CGNAT, RFC 6598: `is_private` misses it
    224.0.0.1             is_global=True     <- multicast: `is_global` misses it
    64:ff9b::a9fe:a9fe    is_global=True     <- NAT64 wrapping 169.254.169.254:
                          is_private=False      BOTH miss it

That last one is the instance metadata service, reachable from any host with
NAT64/DNS64 - which is how an IPv6-only AWS subnet reaches IPv4. So the gate
requires `is_global` AND not multicast AND not reserved AND not private, and it
unwraps IPv4-mapped (`::ffff:169.254.169.254`) and NAT64-embedded addresses
before judging them. A check that judged the wrapper instead of the payload
would report "global, public, fine" about IMDS.

Why it connects to a pinned IP
------------------------------
Validating the hostname's resolved address and then handing the *hostname* to
the socket layer resolves twice. An attacker who controls the DNS response can
answer public on the first lookup and 169.254.169.254 on the second - DNS
rebinding - and the validation is decoration. So the resolved, validated address
is the one connected to. TLS still verifies against the original hostname via
SNI, so pinning costs no certificate checking.

Redirects are followed manually, re-validating every hop, because a 302 to
`http://169.254.169.254/` is the cheapest bypass of a first-hop-only check.

Known limitation: no HTTP(S)_PROXY support
------------------------------------------
`urlopen` honours the HTTP_PROXY/HTTPS_PROXY/NO_PROXY environment variables and
this does not. That is deliberate, not an oversight. Through a proxy the client
never resolves the target host - the proxy does - so there is no address to
validate and no address to pin, and the guarantee this module exists to provide
cannot be made. Silently accepting a proxy would leave the guard in place while
making it decorative.

Nothing in this platform's compose files, Terraform or Dockerfile sets those
variables (checked, not assumed - the HTTP_PROXY strings in the repo are API
Gateway `integration_type` values, which are unrelated). If egress via an
explicit proxy is ever needed, it needs a deliberate design decision about what
SSRF protection survives, not a quiet `set_proxy` call here.
"""

from __future__ import annotations

import functools
import http.client
import ipaddress
import json
import logging
import socket
import ssl
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

logger = logging.getLogger(__name__)

# Only these two. `file://` reads local disk, `gopher://` was the classic vector for
# forging arbitrary TCP payloads, and `ftp://` still resolves a host we would not check.
ALLOWED_SCHEMES = frozenset({"http", "https"})

DEFAULT_TIMEOUT_S = 10.0
DEFAULT_MAX_BYTES = 5 * 1024 * 1024
DEFAULT_MAX_REDIRECTS = 3

# Dropped when a redirect crosses to a different origin.
#
# This is not hypothetical tidiness. `urllib.request`'s redirect handler builds the
# next request's headers as
#     {k: v for k, v in req.headers.items() if k.lower() not in CONTENT_HEADERS}
# - it strips only content-length and content-type. So every `urlopen` in this
# codebase that sets `Authorization: Bearer <key>` replays that credential to
# whatever host the first one redirects to. `requests` does not have this bug: its
# SessionRedirectMixin.rebuild_auth deletes Authorization on a host change. Both
# behaviours were read out of this image's own installed source, not assumed.
_CREDENTIAL_HEADERS = frozenset({"authorization", "proxy-authorization", "cookie"})

# 64:ff9b::/96 - RFC 6052 "well-known prefix". The low 32 bits are an IPv4 address.
_NAT64_WELL_KNOWN = ipaddress.IPv6Network("64:ff9b::/96")

# Rejections that SAFE_FETCH_ALLOWED_PRIVATE_CIDRS must never be able to override.
#
# The allowlist exists so an operator can reach an on-prem IdP on 10.x without
# disabling the guard. It is not a general "trust this address" switch: IMDS at
# 169.254.169.254 and the ECS credential endpoint at 169.254.170.2 are the assets
# being protected, so link-local stays refused even if someone writes
# 169.254.0.0/16 into the setting. Loopback is here too - "fetch my own admin
# port" is not an integration - as are multicast and the unspecified address,
# which are not things a real service is reachable on.
_ALLOWLIST_CANNOT_OVERRIDE = frozenset(
    {
        "blocked_unspecified_address",
        "blocked_loopback_address",
        "blocked_link_local_address",
        "blocked_multicast_address",
    }
)

# Every address-class refusal `_classify` can return. Kept as one set so the
# allowlistable half can be derived by subtraction instead of written out a second
# time and drifting. `test_every_classify_reason_is_declared` asserts this stays
# complete, because the failure mode of forgetting an entry here is silent: a new
# refusal would just quietly become non-allowlistable.
_ADDRESS_REFUSALS = _ALLOWLIST_CANNOT_OVERRIDE | {
    "blocked_reserved_address",
    "blocked_private_address",
    "blocked_non_global_address",
}

_ALLOWLISTABLE_REFUSALS = _ADDRESS_REFUSALS - _ALLOWLIST_CANNOT_OVERRIDE

# Control characters, escaped rather than stripped. Escaping keeps the fact that
# something was there visible in the log; stripping silently rewrites the value
# into one that looks legitimate. 0x7f (DEL) is included because it is a control
# character that is not below 0x20.
_CONTROL_CHAR_ESCAPES = {c: f"\\x{c:02x}" for c in list(range(0x20)) + [0x7F]}


def _scrub_control_chars(text: str) -> str:
    """Make a string safe to write into a log line.

    A newline in a logged value forges an entire log record, which is how an
    attacker hides a refusal or fabricates one against someone else. Applied to
    both attributes of `SafeFetchError` at construction - see the note there for
    why this is not left to the logging call sites.
    """
    if not text:
        return text
    return text.translate(_CONTROL_CHAR_ESCAPES)


def is_allowlistable_refusal(reason: str) -> bool:
    """Could SAFE_FETCH_ALLOWED_PRIVATE_CIDRS make this particular refusal pass?

    Exists so callers can decide whether pointing an operator at that setting is
    honest advice, without hand-copying the rule. Two call sites had already
    grown their own `_ALLOWLISTABLE_REFUSALS` frozenset listing the complement of
    `_ALLOWLIST_CANNOT_OVERRIDE`; a third was about to. Each copy was correct when
    written and none of them would fail if this module added a reason - the
    refusal would simply stop being mentioned, or start being mentioned wrongly,
    with no test anywhere disagreeing. That is the same one-fact-two-places shape
    this whole sweep exists to remove, so the fact lives here, once.

    Returns False for a reason this module does not recognise: advising an
    operator to allowlist their way past something we cannot name is worse than
    saying nothing.
    """
    return reason in _ALLOWLISTABLE_REFUSALS


class SafeFetchError(Exception):
    """A fetch was refused, or failed.

    `reason` is a stable category safe to hand back to an HTTP caller. It
    deliberately does NOT contain the target, because several of these routes
    echo their error text into a response body, and echoing the resolved address
    of a blocked target turns a refusal into the port scan it just prevented.
    Put the specifics in `detail`, which is for logs.
    """

    def __init__(self, reason: str, detail: str = "") -> None:
        # Scrubbed here rather than at each logging call. `detail` carries the
        # thing that was refused - `host=...`, `resolved=...` - so it is built
        # from caller-controlled text, and its whole purpose is to be logged.
        # Two independent reviews of the converted call sites found the same
        # residual: the site had correctly switched its URL argument to %r, then
        # interpolated `exc.detail` with %s in the same call, so a CR/LF in the
        # host still forged a log line. Fixing it at the raise site fixes it for
        # one caller; fixing it here means no future caller can reintroduce it,
        # and %s stays safe to use on both attributes.
        reason = _scrub_control_chars(reason)
        detail = _scrub_control_chars(detail)
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


@dataclass
class SafeResponse:
    status: int
    body: bytes
    final_url: str
    headers: dict[str, str] = field(default_factory=dict)
    truncated: bool = False

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")

    def json(self) -> object:
        """Parse the body as JSON.

        Raises SafeFetchError rather than JSONDecodeError so callers have one
        exception type to handle. A caller-supplied URL returning non-JSON is an
        expected outcome, not a bug.
        """
        try:
            return json.loads(self.body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise SafeFetchError("invalid_json_response", str(exc)) from exc


def _unwrap(addr: ipaddress.IPv4Address | ipaddress.IPv6Address):
    """Return the address a packet actually reaches, not the notation used for it.

    `::ffff:127.0.0.1` and `64:ff9b::7f00:1` are both loopback wearing an IPv6
    costume. Judging the costume returns the wrong answer.
    """
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return addr.ipv4_mapped
        if addr in _NAT64_WELL_KNOWN:
            return ipaddress.IPv4Address(int(addr) & 0xFFFFFFFF)
    return addr


def _classify(raw: str) -> str | None:
    """Return a rejection reason for this address, or None if it may be reached.

    Deliberately a denylist of properties ANDed with a `is_global` allowlist. Each
    named check earns its place by catching something the others do not - see the
    module docstring for the three measurements that forced this shape.
    """
    try:
        addr = ipaddress.ip_address(raw)
    except ValueError:
        return "unresolvable_address"

    addr = _unwrap(addr)

    if addr.is_unspecified:
        return "blocked_unspecified_address"
    if addr.is_loopback:
        return "blocked_loopback_address"
    if addr.is_link_local:
        # 169.254.0.0/16. Covers both IMDS (169.254.169.254) and the ECS task
        # metadata endpoint (169.254.170.2), which serves task role credentials.
        return "blocked_link_local_address"
    if addr.is_multicast:
        return "blocked_multicast_address"
    if addr.is_reserved:
        return "blocked_reserved_address"
    if addr.is_private:
        return "blocked_private_address"
    if not addr.is_global:
        # Catches CGNAT (100.64.0.0/10), which is_private reports as False.
        return "blocked_non_global_address"
    return None


@functools.lru_cache(maxsize=1)
def _allowlisted_networks(raw: str) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """Parse SAFE_FETCH_ALLOWED_PRIVATE_CIDRS. Cached on the raw string.

    A malformed entry is skipped with a warning rather than raising, because
    raising here would take down every outbound fetch - including token
    verification - over a typo in an optional setting. Skipping fails toward the
    secure answer: the CIDR simply is not allowlisted.
    """
    networks = []
    for entry in (raw or "").split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning(
                "safe_fetch: ignoring unparseable SAFE_FETCH_ALLOWED_PRIVATE_CIDRS entry %r; "
                "addresses in it will be refused",
                entry,
            )
    return tuple(networks)


def _is_allowlisted(raw: str, reason: str, allowlist) -> bool:
    """Whether an operator has explicitly permitted this otherwise-refused address.

    Checks the UNWRAPPED address, so 64:ff9b::a9fe:a9fe cannot be smuggled past a
    CIDR written for the IPv6 wrapper - the allowlist is matched against the
    address a packet actually reaches, the same one _classify judged.
    """
    if not allowlist or reason in _ALLOWLIST_CANNOT_OVERRIDE:
        return False
    try:
        addr = _unwrap(ipaddress.ip_address(raw))
    except ValueError:
        return False
    return any(addr in network for network in allowlist)


def _configured_allowlist() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """Read the allowlist from settings, tolerating its absence.

    Imported lazily: core.config imports nothing from here, and keeping it that
    way means this module stays usable (and testable) without the settings object.
    """
    try:
        from core.config import settings

        return _allowlisted_networks(getattr(settings, "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS", ""))
    except Exception:  # pragma: no cover - settings unavailable
        return ()


@dataclass
class _Target:
    scheme: str
    host: str
    port: int
    path: str
    ips: tuple[str, ...]
    url: str

    # There was a `family: int` here, taken from infos[0]. Nothing ever read it, and
    # once connect() started iterating every address it became actively wrong: one
    # integer cannot describe a mixed v4/v6 `ips`. socket.create_connection derives
    # the family per address anyway. A field that is unread and untrue is a trap for
    # the next person, so it is gone rather than corrected.

    @property
    def ip(self) -> str:
        """The first validated address. Every address in `ips` passed validation."""
        return self.ips[0]


def validate_url(url: str, *, require_public: bool = True) -> _Target:
    """Parse, validate and resolve a URL, returning the address to connect to.

    Raises SafeFetchError on anything not a fetchable http(s) URL. Every address
    the hostname resolves to must pass - not merely the first - because a host
    with one public and one private A record would otherwise be a coin flip that
    succeeds often enough to look like a flake.

    `require_public=False` skips only the address classification, for URLs this
    platform configured for itself (an internal ALB endpoint from settings). It
    is NOT a bypass for caller-supplied URLs: scheme, credential and host checks
    all still apply, and see `fetch_internal` for why the redirect rule differs.
    """
    if not url or not isinstance(url, str):
        raise SafeFetchError("invalid_url")

    try:
        parts = urlparse(url.strip())
    except ValueError as exc:
        raise SafeFetchError("invalid_url", str(exc)) from exc

    scheme = (parts.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise SafeFetchError("blocked_scheme", f"scheme={scheme!r}")

    # Credentials in the URL are stripped by some parsers and honoured by others;
    # refusing is the only behaviour that is the same everywhere.
    if parts.username or parts.password:
        raise SafeFetchError("blocked_url_credentials")

    host = parts.hostname
    if not host:
        raise SafeFetchError("invalid_url", "no host")

    try:
        port = parts.port or (443 if scheme == "https" else 80)
    except ValueError as exc:
        # urlparse defers port validation to attribute access.
        raise SafeFetchError("invalid_url", str(exc)) from exc

    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise SafeFetchError("unresolvable_host", str(exc)) from exc

    if not infos:
        raise SafeFetchError("unresolvable_host", "no addresses")

    if require_public:
        allowlist = _configured_allowlist()
        for _family, _type, _proto, _canon, sockaddr in infos:
            reason = _classify(sockaddr[0])
            if reason and _is_allowlisted(sockaddr[0], reason, allowlist):
                logger.info(
                    "safe_fetch: %s permitted by SAFE_FETCH_ALLOWED_PRIVATE_CIDRS "
                    "despite %s (host=%s)",
                    sockaddr[0],
                    reason,
                    host,
                )
                continue
            if reason:
                raise SafeFetchError(reason, f"host={host} resolved={sockaddr[0]}")

    path = urlunparse(("", "", parts.path or "/", parts.params, parts.query, ""))

    # ALL validated addresses, in resolver order, not just the first.
    #
    # Keeping only infos[0] would trade an SSRF fix for an availability bug on the
    # auth path: cognito-idp.<region>.amazonaws.com resolves to 12 addresses, and
    # `urlopen` tries each in turn. Pinning one and giving up would mean a single
    # unhealthy AWS address breaks every token verification. Dedup preserves order
    # (dict.fromkeys) because a host can return the same address on both families.
    ips = tuple(dict.fromkeys(info[4][0] for info in infos))

    return _Target(
        scheme=scheme,
        host=host,
        port=port,
        path=path or "/",
        ips=ips,
        url=url,
    )


class _PinnedHTTPConnection(http.client.HTTPConnection):
    """HTTPConnection that connects to a pre-validated IP, not a re-resolved name.

    `self.host` stays the hostname so the Host header and any redirect handling
    stay correct; only the socket target is pinned.
    """

    def __init__(self, target: _Target, timeout: float) -> None:
        super().__init__(target.host, target.port, timeout=timeout)
        self._target = target

    def connect(self) -> None:
        # Try every validated address before giving up, which is what urlopen did.
        # All of them already passed _classify, so failover cannot reach a target
        # the first address was not allowed to reach.
        last_error: OSError | None = None
        for ip in self._target.ips:
            try:
                self.sock = socket.create_connection((ip, self._target.port), timeout=self.timeout)
                break
            except OSError as exc:
                last_error = exc
                logger.debug(
                    "safe_fetch: %s:%s unreachable (%s), trying the next address",
                    ip,
                    self._target.port,
                    type(exc).__name__,
                )
        else:
            raise last_error if last_error else OSError("no addresses to connect to")

        if self._tunnel_host:
            self._tunnel()


class _PinnedHTTPSConnection(_PinnedHTTPConnection):
    """As above, with TLS verified against the hostname rather than the pinned IP.

    `server_hostname` is the whole point: connect to the address we validated,
    but present and verify the name the caller asked for. Passing the IP there
    would make every certificate fail and invite someone to "fix" it by
    disabling verification.
    """

    # Not inherited: HTTPConnection.putrequest omits the port from the Host header
    # only when it equals default_port, so leaving this at 80 would send
    # `Host: example.com:443` on every HTTPS request. Legal, but enough to confuse
    # a name-based virtual host into serving the wrong site.
    default_port = 443

    def __init__(self, target: _Target, timeout: float, context: ssl.SSLContext | None = None) -> None:
        super().__init__(target, timeout)
        self._context = context or ssl.create_default_context()

    def connect(self) -> None:
        super().connect()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self._target.host)


def _read_capped(resp: http.client.HTTPResponse, max_bytes: int) -> tuple[bytes, bool]:
    """Read at most max_bytes, reporting whether more was available.

    Reads one extra byte rather than trusting Content-Length, which a hostile or
    merely wrong server is free to understate.
    """
    body = resp.read(max_bytes + 1)
    if len(body) > max_bytes:
        return body[:max_bytes], True
    return body, False


def _with_params(url: str, params: dict[str, str]) -> str:
    """Append query parameters, preserving any the URL already carries.

    Replacing the query instead of merging would silently drop parameters a
    caller put in the URL string, which is the kind of difference that shows up
    as an empty API result rather than an error.
    """
    parts = urlparse(url)
    merged = parse_qsl(parts.query, keep_blank_values=True) + list(params.items())
    return urlunparse(parts._replace(query=urlencode(merged)))


def fetch(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | str | None = None,
    data: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
) -> SafeResponse:
    """Fetch a URL that came from outside this process.

    Every hop is validated and connected by pinned IP. Raises SafeFetchError for
    a refusal or a transport failure; a non-2xx response is returned, not raised,
    because callers routinely need the status.

    `data` form-encodes a dict body and sets Content-Type, and `params` merges
    query parameters, so the `requests.post(url, data=...)` call sites this
    replaces convert without restructuring.

    This is synchronous, matching the `urlopen` calls it replaces. Calling it
    from `async def` blocks the event loop exactly as those did - a pre-existing
    property of these routes, not one introduced here.
    """
    return _fetch(
        url,
        require_public=True,
        method=method,
        headers=headers,
        body=body,
        data=data,
        params=params,
        timeout=timeout,
        max_bytes=max_bytes,
        max_redirects=max_redirects,
    )


def fetch_internal(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | str | None = None,
    data: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> SafeResponse:
    """Fetch a URL this platform configured for itself. NOT for caller input.

    The LLM gateway endpoint comes from settings and resolves to a private ALB
    address, so the public-address check would refuse it - correctly, for a
    caller-supplied URL, but wrongly here. Use this only when the URL's origin is
    the platform's own configuration.

    Redirects are refused outright rather than followed. These call sites attach
    `Authorization: Bearer <master key>`, and the reason `urlopen` was unsafe
    here is that it replays that header to whatever host a 302 names. A gateway
    of ours has no legitimate reason to redirect, so the safe rule is the strict
    one: a redirect is an error, not a hop.
    """
    return _fetch(
        url,
        require_public=False,
        method=method,
        headers=headers,
        body=body,
        data=data,
        params=params,
        timeout=timeout,
        max_bytes=max_bytes,
        max_redirects=0,
    )


def _fetch(
    url: str,
    *,
    require_public: bool,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | str | None = None,
    data: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
) -> SafeResponse:
    if timeout is None or timeout <= 0:
        raise SafeFetchError("invalid_timeout", "a timeout is mandatory")

    request_headers = dict(headers or {})
    payload = body.encode("utf-8") if isinstance(body, str) else body

    if data is not None:
        if payload is not None:
            raise SafeFetchError("invalid_request", "pass body or data, not both")
        payload = urlencode(data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    current = _with_params(url, params) if params else url
    for hop in range(max_redirects + 1):
        target = validate_url(current, require_public=require_public)

        conn: _PinnedHTTPConnection
        if target.scheme == "https":
            conn = _PinnedHTTPSConnection(target, timeout)
        else:
            conn = _PinnedHTTPConnection(target, timeout)

        try:
            conn.request(method, target.path, body=payload, headers=request_headers)
            resp = conn.getresponse()
            status = resp.status
            resp_headers = {k.lower(): v for k, v in resp.getheaders()}
            location = resp_headers.get("location")

            if status in (301, 302, 303, 307, 308) and location:
                if hop >= max_redirects:
                    raise SafeFetchError("too_many_redirects", f"limit={max_redirects}")
                resp.read(0)
                # Resolve relative Location against the hop we are on, then validate
                # it from scratch on the next iteration.
                origin = (target.scheme, target.host, target.port)
                current = urljoin(f"{target.scheme}://{target.host}:{target.port}{target.path}", location)

                # Drop credentials if the origin changed. See _CREDENTIAL_HEADERS.
                next_parts = urlparse(current)
                next_port = 443 if next_parts.scheme == "https" else 80
                try:
                    next_port = next_parts.port or next_port
                except ValueError:
                    pass
                if (next_parts.scheme, next_parts.hostname, next_port) != origin:
                    dropped = [h for h in request_headers if h.lower() in _CREDENTIAL_HEADERS]
                    for header in dropped:
                        del request_headers[header]
                    if dropped:
                        logger.warning(
                            "safe_fetch: dropped %s across a cross-origin redirect",
                            ", ".join(sorted(h.lower() for h in dropped)),
                        )

                # 303, and 301/302 in practice, become GET without a body.
                if status in (301, 302, 303) and method.upper() not in ("GET", "HEAD"):
                    method = "GET"
                    payload = None
                    request_headers.pop("Content-Type", None)
                    request_headers.pop("Content-Length", None)
                continue

            data, truncated = _read_capped(resp, max_bytes)
            return SafeResponse(
                status=status,
                body=data,
                final_url=current,
                headers=resp_headers,
                truncated=truncated,
            )
        except SafeFetchError:
            raise
        except (socket.timeout, TimeoutError) as exc:
            raise SafeFetchError("fetch_timeout", str(exc)) from exc
        except ssl.SSLError as exc:
            raise SafeFetchError("tls_error", str(exc)) from exc
        except (OSError, http.client.HTTPException) as exc:
            raise SafeFetchError("fetch_failed", str(exc)) from exc
        finally:
            conn.close()

    raise SafeFetchError("too_many_redirects", f"limit={max_redirects}")


def fetch_json(url: str, **kwargs) -> object:
    """Fetch and parse JSON, refusing a non-2xx status or a truncated body.

    Convenience for the discovery-document and agent-card callers, which all want
    exactly this and would otherwise each invent their own status check.

    Truncation is an error here rather than a flag, because a body cut at
    max_bytes is not partial JSON a caller can use - it is either a parse failure
    reported as bad upstream data, or, worse, a shorter document that happens to
    parse. Both read as "the upstream returned less than it did".
    """
    resp = fetch(url, **kwargs)
    if not (200 <= resp.status < 300):
        raise SafeFetchError("http_status_error", f"status={resp.status}")
    if resp.truncated:
        raise SafeFetchError("response_too_large", f"body exceeded the cap for {resp.final_url}")
    return resp.json()
