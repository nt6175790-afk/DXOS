# Runtime security remediation — 28 October 2026

The local WAF now uses Coraza 3.8.1 / embedded OWASP CRS 4.25.0 through the official HTTP connector and Go reverse proxy. Caddy's unused certificate-authority dependency chain, including vulnerable JOSE v3, is absent from both the production import graph and binary build metadata. Existing routes, rules, SSO issuer-only exclusion, body limit and loopback port are preserved. See [design and boundaries](../architecture/waf-jose-remediation.md).

OpenBao 2.7.2 uses tested CAP and Okta consumers of official JOSE 4.1.6. Its binary must contain no JOSE v3. Okta's original RSA-512 test fixture is upgraded to generated RSA-2048; test-only organization/token values are synthetic and requests use mocked responders. No cryptographic algorithm is reimplemented or weakened. Source adapter, locked versions, modified module manifests and upstream legal notices are included.

ClamAV normalizes shell/config line endings during image build and checks shell syntax; Git attributes preserve LF for those files when checked out on Windows. Existing signatures are retained. Keycloak uses the checksum-pinned patched Guava artifact and updated Java/OS packages. Recovery verifies exact built-versus-running image IDs.

## Executed locally

| Check | Result |
| --- | --- |
| Full disposable MySQL backend suite | 1,555 passed / 76 suites; 0 failed |
| Targeted approval/attendance/account regressions | 49 passed |
| Frontend suite | 347 passed; 0 failed |
| WAF gateway + official connector, race detector | 114 test/subtest entries passed; go vet passed |
| Okta SDK mocked unit/query tests | 44 test/subtest entries passed |
| CAP JWT/OIDC and official JOSE v4 tests | Passed |
| Backend/frontend build and zero-warning lint | Passed |
| Prisma 6.19.3 generate/validate | Passed |
| 26-migration replay/status and live schema drift | Passed; no difference |
| Actual runtime image scans, all nine containers | 0 HIGH / 0 CRITICAL; no ignore or VEX exception |
| Live WAF/APISIX/SSO/session/tenant checks | 23 passed |
| Live antivirus | Clean accepted; inert EICAR test rejected |
| Five demo identities | Existing grants preserved; missing JWT 401, foreign tenant 403, staff task edit/assignment remain denied |
| Real Ollama generic greeting | HTTP 200; not mock |
| Source/license and known-local-secret publication checks | Passed |

[Immutable image identities and scan counts](runtime-remediation-2026-10-28.json) describe the local runtime snapshot, not a claim of byte-identical rebuilds on every machine. Full raw scans and CycloneDX SBOMs are produced by the repository's CI workflow. The final Git revision must pass all CI gates before merge; use the [PR checks](https://github.com/nt6175790-afk/DXOS/pull/31) for that result.

No schema/historical migration, granted permission, credential or ACL changes. Existing application records and secret-store policies/keys are preserved; verification logins/AI calls create normal session/audit records. This remains a local HTTP deployment; public TLS/domain/production operations require their own reviewed setup. A clean HIGH/CRITICAL scan is not a claim that no lower-severity or future vulnerability exists.
