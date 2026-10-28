# WAF dependency removal — 28 October 2026

The remaining CVE-2026-116587 is linked through Caddy's Smallstep certificate-authority dependencies. Upstream JOSE v3 has no patched release; the attempted wholesale v4 consumer migration failed compatibility tests and is excluded. Do not ignore the advisory, alter package metadata or relax the HIGH/CRITICAL gate.

Replace only the edge HTTP proxy adapter with Go's standard reverse proxy and Coraza's official net/http connector. Retain Coraza 3.8.1, embedded OWASP CRS 4.25.0, the existing rule directives, the issuer-only SSO exclusion, request-body limit, no audit/request-body logging, Referrer-Policy and the same fixed upstream routing. `/api/*` goes to APISIX; other paths go to frontend; port 8088 remains loopback-only. JWT, sessions, RBAC, tenant isolation, backend/frontend/database contracts and grants do not change.

This intentionally removes Caddy's unused certificate management, admin API, automatic HTTPS and Caddyfile support from this HTTP-only local edge. It does not disable TLS validation anywhere else. Future public TLS termination requires a separate reviewed deployment configuration; do not expose this local HTTP stack directly to the Internet.

The adapter must fail startup on invalid rules; processing errors must not become empty HTTP 200 responses. Upstreams are fixed in code, client forwarding headers are replaced, transport errors return a generic 502 and no request content or secrets are logged. Timeouts permit existing AI requests, with a bounded header/body/idle lifetime. Preserve cookies, authorization, multipart uploads, streaming and WebSocket upgrades.

Acceptance requires Go adapter tests with real CRS (benign routing, SQLi/XSS/traversal, body limit, SSO exclusion scope, forwarding/header boundaries, generic upstream failure and protocol upgrades), official connector tests, module/build metadata checks proving no JOSE/Caddy/Smallstep linked, strict immutable-image scans with no suppression, and the existing live edge/SSO and application regression suites. Existing runtime images are retained until the replacement passes these checks.
