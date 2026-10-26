# Vận hành local: SSO, bảo mật và quality gate mã nguồn mở

NestJS giữ modular monolith/RBAC/membership. Keycloak chỉ xác thực danh tính. Browser → Coraza/CRS → APISIX → backend. Frontend http://localhost:8088, native Vite :5173. IdP 8180/OpenBao 8200 bind loopback; backend/gateway/Valkey không publish port. ClamAV 3310 loopback dành kiểm thử native.

## Khởi động tại repository root

```powershell
node backend/scripts/init-security-env.js
node backend/scripts/init-container-env.js
node backend/scripts/init-openbao-tls.js
docker compose --env-file .security.local.env -f backend/deploy/compose.security.yml build
docker compose --env-file .security.local.env -f backend/deploy/compose.security.yml up -d keycloak clamav redis openbao
node backend/scripts/init-openbao-local.js
node backend/scripts/publish-openbao-local-secrets.js
docker compose --env-file .security.local.env -f backend/deploy/compose.security.yml --profile app up -d --build
```

Trợ lý AI với model thật: đặt `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` trong `backend/.env` trước `init-container-env.js`; với stack đã dựng, thêm cấu hình vào `.security.backend.env` và nạp hoặc đổi key bằng `node backend/scripts/set-openbao-ai-key.js` (check-and-set, không in key), rồi tạo lại container backend. Chi tiết: mục Trợ lý AI trong README.

Sau restart OpenBao bị seal: chạy init-openbao-local trước agent/backend. Không initialize lại volume có dữ liệu. File store đã chuyển sang Raft: xem openbao-raft-migration.md. Không mount file store vào 2.7.1. backup-security-state.js xác định mount đang dùng, dừng dịch vụ để backup nhất quán và giữ chúng dừng; sau đó restart/unseal theo trình tự trên. Không đưa backup/seal shares/TLS private key vào Git.

## SSO

Code + PKCE S256, state/nonce/challenge một lần, RS256/JWKS/issuer/audience/expiry. Mapping issuer+subject tường minh; không nối email/tin IdP role. enable-local-security.js/provision-demo-sso.js dành setup local; demo identity lưu riêng .secrets/demo-sso-account.json, không in password. configure-keycloak-local.js cập nhật client logout redirect, giữ users/roles/password.

GET /api/v1/auth/sso/logout-url yêu cầu JWT/session ACTIVE; URL chỉ từ discovery cùng issuer, redirect /login do server cấu hình. SSO logout thu hồi session DX-OS rồi chuyển IdP xác nhận; password login chỉ logout DX-OS. Discovery lỗi vẫn thu hồi local, cần logout IdP lại. Không lưu/đưa id_token_hint ra frontend.

## OpenBao / ClamAV

OpenBao 2.7.1+dxos.1 build source cố định, API/CLI only (ui=false), Raft một node local giữ KV-v2. TLS CA riêng không cài OS trust. Backend dùng read-only AppRole agent token sink, không root; quyền read secret/data/dxos-container + lookup/renew-self. Native test token riêng; root/seal shares ignored .secrets để bootstrap local. Không đưa secret vào source/log/compose environment.

ClamAV 1.4.4 không libunrar: AVAILABLE chỉ sau scan OK; timeout/infection chặn và dọn bytes. Không bảo đảm scan RAR. Theo dõi freshness/giới hạn kích thước/nesting trước production.

## Kiểm tra

```powershell
node backend/scripts/run-quality-local.js --tests
node backend/scripts/test-oidc-protocol.js
node backend/scripts/test-keycloak-live.js
node backend/scripts/test-clamav-live.js
node backend/scripts/test-openbao-live.js
node backend/scripts/test-openbao-agent-live.js
node backend/scripts/test-edge-live.js
node backend/scripts/run-trivy-local.js
node backend/scripts/scan-runtime-images.js
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate:status
npm.cmd run build:backend
```

Evidence JSON/HTML/CycloneDX ở ignored security-artifacts/. Bỏ Sonar/SonarJS khỏi runtime/CI theo yêu cầu OSS. ESLint zero warnings, Jest/Vitest, npm audit, strict legal evidence và Trivy là gate riêng. Coverage có timestamp, không bịa threshold. CI remote có kết quả riêng theo từng commit tại GitHub Actions; không suy diễn kết quả đó từ kiểm thử local. CI build/quét cả image hạ tầng. scan-runtime-images --images-only dành CI, mặc định local inspect immutable image ID container đang chạy.

## Giấy phép, database, production

Apache-2.0 theo chủ dự án; NOTICE/THIRD_PARTY_NOTICES và licenses/ giữ giấy phép riêng. Snapshot Windows 936/936 evidence, gồm 12 publisher declarations phân biệt với standalone LICENSE; 110 optional lock entries cần thu thập đúng nền tảng release. Dockerfiles/source provenance OpenBao/Coraza giữ để tái tạo; binary distribution có nghĩa vụ khác source-only.

MySQL 8.0.44 dx_os, Prisma 6.19.3, 24 migration; không sửa history. Domain/HTTPS, Keycloak DB/HA, custody/rotation production chưa thực hiện vì chủ dự án chọn local. Không commit/push/thay ACL. Báo cáo học thuật/slide ngoài phạm vi.
