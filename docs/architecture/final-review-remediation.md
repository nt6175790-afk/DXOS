# Final review remediation — 28 October 2026

Scope: repair the confirmed approval/payroll visibility, attendance cursor/date validation, role null validation, dark table contrast and misleading attendance label; remediate the runtime image findings and deploy the built images. Preserve the five demo roles/grants, MySQL 8.0.44, Prisma 6.19.3, stored business data, credentials and ACLs. No schema/migration change is planned.

Approval reads will consistently require payroll:read before selecting PAYROLL requests, including list/cursor/detail/summary/AI. Existing approval actions and their grants remain unchanged. Filters must not reveal a hidden payroll request through a cursor or count. Tenant guards remain in place. No grant is added to make a blocked operation succeed.

Attendance pagination will return the last visible item as cursor and verify cursor visibility in the current employee/filter scope. Date-only filters and month ranges will reject impossible dates and reversed ranges instead of normalizing them. The summary card will describe recorded attendance days, preserving the API's existing totalWorkDays/totalRecords meaning and historical attendance values.

Role PATCH fields that are optional but non-nullable will reject explicit null; undefined remains omitted. User PATCH input follows the same declared non-nullable API rule. No change to self-role protection, permission catalog or assignment ceilings.

UI repair will use existing theme tokens for table/tab backgrounds and foregrounds, including opacity variants and status labels, and verify computed contrast in the running app. No new UI dependency or module rewrite.

Runtime repair will pin and verify upstream fixed dependencies, rebuild the affected images and scan their immutable IDs before deployment. Persistent Keycloak/OpenBao state is retained; existing secret files stay local. JOSE v3 has no released upstream patch, so its remediation must be supported by a verifiable upstream source change/dependency migration and regression evidence. Do not rename a version or remove metadata merely to hide a vulnerability, ignore a CVE, lower the gate or silently replace security architecture. Keep licenses and source modification notices accurate.

Validation: add regressions for each confirmed defect; run targeted and complete disposable MySQL suites, frontend tests, build/lint, Prisma validation/status/replay/drift, source/credential/license checks, actual runtime scans, five demo account checks, live SSO/edge and real Ollama greeting. Retain the initial review evidence. Publish through the owner's existing PR workflow and merge only after all required CI gates pass on the final commit.

Runtime implementation: OpenBao is upgraded to upstream 2.7.2 (commit 9e0a0d3c3504a0a00b45e61355afac5e35c78379). Its pinned CAP 0.14.0 consumer is migrated to official JOSE 4.1.6 by a build-time AST adapter constrained to that module. Parser algorithm policies and signature verification remain in place; JWT builders use the equivalent v4 Serialize API. CAP JWT/OIDC tests and official v4 library tests gate the build. Binary module inspection must prove v4.1.6 and no linked v3.

WAF now uses the official Coraza net/http connector and the standard Go reverse proxy, retaining Coraza 3.8.1, OWASP CRS 4.25.0, the existing directives and fixed upstream routing. Caddy and its unused Smallstep/JOSE dependency chain are removed from this local HTTP edge. The incompatible trial migration is excluded. See [WAF remediation](waf-jose-remediation.md) for the explicit infrastructure boundary and acceptance tests. Raw HIGH/CRITICAL scans remain mandatory with no ignore/VEX exceptions.

Keycloak keeps the Quarkus-recorded Guava JAR path but receives verified 33.7.2-jre bytes and embedded metadata. Recovery checks immutable image IDs and refuses to silently start an older runtime than the reviewed local build. Recreate affected services with existing volumes and unseal using existing local material; no reinitialization, credential or ACL change.
