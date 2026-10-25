# AI agent hardening — 26/10/2026

This change integrates the read-only agent from PR #23 with the reviewed permission boundaries from PR #21. Original commits and authors are retained. No production permission semantics, schema or migration is changed.

## Corrected behavior

- The opt-in demo role seed uses the agreed sales/engineering/warehouse/HR matrix (13/13/12/32 grants). Only engineering and the existing admin have ai:use. No global task editing/assignment, generic approval, payroll/compensation or sensitive-document grants are added to staff.
- Provisioning checks the active admin's actual permissions and existing catalog, audits grants, preserves exact matches, and rolls back on conflicting existing roles/assignments rather than accumulating privileges. Admin/passwords/other tenants remain unchanged. Fresh isolated Docker demos provision the same roles; refresh does not overwrite grants.
- Missing-document queries distinguish no configuration from configured requirements that are all disabled; reads do not seed defaults.
- Attendance aggregates traverse all matching records/schedules using 500-row keyset pages in a consistent read transaction, instead of treating 2,000 rows as the full dataset. Returned lists remain bounded. Regression data includes 2,001 attendance rows and 2,002 schedules.
- Numeric PASS is explicitly described as number-presence matching, not semantic/factual verification. The UI explains this for numeric answers, even without citations. Model hallucinations are not claimed to be eliminated.
- body-parser/multer are pinned to patched 2.4.0/2.5.0 through root overrides; Zod/resolver are updated compatibly to 4.6.7/5.2.2. No forced NestJS downgrade. Lockfiles and legal notices are updated.
- The source-demo scan resolves the running MySQL container's complete sha256 image ID, avoiding Trivy/Docker's bare 64-character image reference error. Security gates remain enabled.
- Offline AI evaluation seeds only its own disposable database when using the MySQL runner. Expectations follow the agreed roles, check denied requests before tool execution, and fail on unexpected provider errors. CI runs this evaluation separately.

## Executed local validation

| Check | Result |
| --- | --- |
| Targeted MySQL/grounding/role regression | 38 tests, 3 suites PASS |
| Full backend on patched dependencies, disposable MySQL with coverage | 1,491 tests, 71 suites PASS |
| Full frontend | 325 tests, 37 files PASS |
| Offline agent evaluation | 30/30 applicable cases PASS; no forbidden-data hits or unexpected errors |
| Backend build/lint; frontend typecheck/build/lint | PASS |
| Prisma 6.19.3 generate/validate | PASS |
| Migration replay/status/schema drift in disposable database | 25 migrations, up to date, no drift |
| Production npm audit, backend and frontend | 0 vulnerabilities reported |
| OSS quality gate | PASS |
| Strict npm license inventory | 1,049 entries, all permissive; no missing installed-package legal texts |
| Publication policy, local secret generator, redirect security script tests | 14 PASS |
| Publication path/credential checks | PASS; no matching known local credentials in reachable history |

Commands: npm run test:rbac:mysql --workspace @dx-os/backend -- --coverage; npm run test:rbac:mysql --workspace @dx-os/backend -- --testRegex 'ai-agent[.]eval[.]ts$'; npm --prefix frontend test; npm run build:backend; npm --prefix frontend run build; npm run lint:backend; npm --prefix frontend run lint; npm run db:generate; npm run db:validate; node backend/scripts/run-quality-local.js.

## Independent remote checks and limits

GitHub Actions on the exact pushed commit is the source of truth for remote verify, runtime vulnerability scans, and build/run from the Git archive. Local test results do not substitute for those checks or claim they already completed. See the PR checks and attached runtime/source-demo artifacts for their final status.

No cloud model request, new API key or live OpenBao rotation was performed for this hardening. The author's earlier 40/40 Ollama result is historical, using an earlier permission matrix. Cloud billing and data handling remain provider-specific; mock evaluation is not live-model verification. Frontend bundle-size and existing jsdom test warnings remain non-failing limitations.

The operator's native dx_os database, credentials and ACLs were not modified. Existing v0.2.0 release/tag/assets remain unchanged; this is source hardening on a separate branch, not a relabeled old release.
