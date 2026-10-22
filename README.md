# DX-OS — Hệ điều hành doanh nghiệp số

Ứng dụng quản lý doanh nghiệp đa tổ chức, giao diện tiếng Việt. Backend kiểm soát xác thực, quyền và phạm vi dữ liệu của từng tổ chức.

## Phần mềm mã nguồn mở — Giấy phép Apache-2.0

**DX-OS là phần mềm mã nguồn mở, được phát hành theo giấy phép Apache License, Version 2.0 (Apache-2.0).** Mã nguồn được công khai để người dùng có thể nghiên cứu, sử dụng, sửa đổi và phân phối theo các điều khoản của giấy phép.

- [LICENSE](LICENSE): toàn văn giấy phép Apache-2.0 áp dụng cho mã nguồn gốc của DX-OS.
- [NOTICE](NOTICE): thông tin bản quyền và ghi nhận đóng góp.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) và [licenses/](licenses/): giấy phép, ghi nhận và bằng chứng của các thành phần bên thứ ba. Các thành phần này giữ giấy phép riêng, không được đổi thành Apache-2.0 của DX-OS.

Khi phân phối lại, cần giữ các thông báo bản quyền/giấy phép và ghi rõ thay đổi theo điều khoản tương ứng. Windows, Docker Desktop và dịch vụ AI bên ngoài không thuộc phạm vi cấp phép Apache-2.0 của dự án; DX-OS có thể chạy với Linux, Docker Engine và AI mock mà không cần các dịch vụ AI thương mại.

## Bản phát hành và demo cho người chấm

[GitHub Releases](https://github.com/nt6175790-afk/DXOS/releases) lưu phiên bản gắn tag, source zip, commit manifest và SHA-256. Dùng tag **v0.2.0** để lấy đúng mã nguồn release; main có thể thay đổi sau này. Xem [quy trình PR/release](docs/architecture/release-process.md).

**Cập nhật bảo mật 21/10/2026:** v0.1.0 chứa follow-redirects 1.16.0 trong frontend lockfile, vừa được scanner báo hai HIGH. Bản vá 1.16.1 được xử lý trong [PR #15](https://github.com/nt6175790-afk/DXOS/pull/15); khi dựng bản mới, chọn revision đã vá và đã qua CI. Tag/asset v0.1.0 giữ nguyên để truy xuất; không coi bản cũ là đã có bản vá. Xem [chi tiết và phạm vi ảnh hưởng](docs/security/follow-redirects-2026-10-21.md).

Cách dựng nhanh từ source trên máy mới, có Docker Linux containers và Node 22:

```powershell
npm.cmd run demo:init
npm.cmd run demo:build
npm.cmd run demo:up
npm.cmd run demo:test
```

Mở **http://localhost:8090**, email **admin.demo@dxos.local**, mật khẩu tự sinh trong **.secrets/demo/compose.env** trên chính máy đó. Bộ này có MySQL riêng và dữ liệu giả lập, không dùng database/credential của máy tác giả. Xem [hướng dẫn Docker đầy đủ](docs/architecture/docker-demo-quickstart.md) trước khi chạy. Đây là demo loopback/offline, chưa có website public và chưa phải production.

Chi tiết bản mới, quy trình kiểm chứng và giới hạn: [DX-OS v0.2.0](docs/release/v0.2.0.md).

## Chức năng

- Tổng quan, phòng ban, nhân sự, công việc/Kanban, lịch và tìm kiếm.
- Chấm công, nghỉ phép, ca làm, tiền lương, hiệu suất và báo cáo.
- Tài liệu, thông báo, phê duyệt, workflow, automation và audit.
- Quản trị thành viên/vai trò và trợ lý AI (mock offline hoặc provider cấu hình riêng).
- Demo bảo mật: Keycloak SSO, APISIX, Coraza WAF, ClamAV, OpenBao và Valkey.

### Đánh giá AdGuard và phần hạ tầng bổ sung

[Đánh giá tích hợp AdGuard](docs/architecture/adguard-integration-assessment.md) gồm ranh giới DNS/ứng dụng, tenant isolation, giấy phép và quyết định GO/NO-GO. Có [runbook hạ tầng](docs/architecture/adguard-infrastructure-runbook.md), [security review](docs/architecture/adguard-security-review.md), [24 case nghiệm thu dự kiến](docs/architecture/adguard-validation-plan.md) và [bàn giao công việc](docs/team/adguard-work-plan.md). Đây là thiết kế/tài liệu, **chưa có AdGuard runtime hoặc API trong DX-OS**, là phần đánh giá riêng, không được bật trong bộ demo chính.

[Bản vá candidate AdGuard v0.107.79-dxos.1](docs/security/adguard-remediation.md) đã qua rebuild/test/scan riêng với 0 HIGH/CRITICAL, có binary Linux amd64 cùng corresponding source và SBOM. Còn 1 MEDIUM và 1 UNKNOWN được giữ hiển thị, chưa phê duyệt production hoặc kết nối tenant API. Bản chính thức cũ và bản rebuild có hash/provenance khác nhau; không dùng chữ ký upstream cho binary đã sửa.

## Công nghệ và cấu trúc

Node.js 22.21.1 trở lên · NestJS · React 18/Vite/TypeScript · MySQL Community 8.0.44 · Prisma 6.19.3.

| Thư mục | Nội dung |
| --- | --- |
| `backend/` | API, nghiệp vụ, RBAC và script vận hành |
| `frontend/` | Giao diện tiếng Việt |
| `database/` | Prisma schema và migration MySQL; PostgreSQL cũ được lưu riêng |
| `contracts/api/` | Hợp đồng API, gồm xác thực và SSO |
| `tests/backend/` | Unit/integration/security tests |
| `docs/architecture/` | Kiến trúc, hướng dẫn security stack và checklist kỹ thuật |
| `licenses/` | Bằng chứng giấy phép và notices bên thứ ba |
| `.github/` | CI, templates và Dependabot |

## Chạy từ bản clone mới

**Dành cho giảng viên/người chấm:** làm theo [hướng dẫn mở và test demo từ máy mới](docs/architecture/teacher-demo-quickstart.md), gồm cấu hình, tạo tài khoản và xử lý lỗi thường gặp. Repository này là mã nguồn; chưa có website demo công khai.

Cần Node/npm và MySQL đang chạy. Docker chỉ cần cho security stack đầy đủ.

```powershell
npm ci
npm --prefix frontend ci
Copy-Item backend/.env.example backend/.env
```

Sửa **file local `backend/.env`**: đặt DATABASE_URL trỏ tới database development `dx_os`, JWT_ACCESS_SECRET ngẫu nhiên riêng, và AI_PROVIDER=mock nếu chỉ demo offline. Không đưa secret lên Git/chat hoặc dùng placeholder ngoài test. Tạo database rỗng và tài khoản MySQL phù hợp trước khi chạy migration. Không dùng database có dữ liệu quan trọng để thử seed/test.

```powershell
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
npm run db:migrate:status
npm run dev:backend
```

Mở terminal thứ hai:

```powershell
npm --prefix frontend run dev
```

Frontend: http://localhost:5173 · Health: http://localhost:3000/api/v1/health · OpenAPI local: http://localhost:3000/api/v1/docs/openapi.json.

### Dữ liệu demo

Đặt DEMO_ADMIN_PASSWORD riêng (ít nhất 16 ký tự) trong `.env` local, không dùng mật khẩu mặc định công khai. Các script seed hiện có được gọi bằng:

```powershell
npm --workspace @dx-os/backend run seed:demo-admin
npm --workspace @dx-os/backend run seed:demo
```

Chỉ chạy trên database development/test. Đọc code seed trước khi chạy; seed không phải migration production. Email mặc định: `admin.demo@dxos.local`. Người clone tự đặt password, repository không chứa credential của máy chủ dự án.

### Security stack đầy đủ

Xem [hướng dẫn local](docs/architecture/security-devsecops-setup.md). Giao diện qua WAF: http://localhost:8088. Stack này dùng MySQL trên host, OpenBao TLS/KV-v2/Raft và AppRole agent; không chứa secret/volume của máy gốc. Keycloak chỉ liên kết danh tính, không tự cấp quyền DX-OS. Sonar/SonarJS đã thay bằng quality gate mã nguồn mở.

## Kiểm thử

```powershell
npm run lint:backend
npm run build:backend
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --workspace @dx-os/backend run test:rbac:mysql
```

Full backend suite tạo/replay/xóa database **tạm có tên riêng**; tài khoản chạy test cần quyền tạo/xóa database tạm. Không reset `dx_os`. Xem script `backend/scripts/test-rbac-mysql.js` trước khi dùng account ngoài local.

Kết quả local ngày 15/10/2026: **1.295 backend tests, 270 frontend tests PASS**, build/lint đạt (zero warnings), production npm audit không có lỗ hổng. Chín service đang chạy được quét Trivy: zero HIGH/CRITICAL và có CycloneDX SBOM. Live edge/SSO/logout: 23 checks; Keycloak: 10; OIDC fixture: 8; ClamAV/OpenBao/agent renewal/Valkey đã kiểm tra riêng. Đây là bằng chứng theo thời điểm, không bảo đảm không có lỗ hổng tương lai hoặc CI remote đã chạy.

## Giới hạn và giấy phép

Đã hoàn thiện local, **chưa phải triển khai production**. Chưa có domain/máy chủ; Keycloak start-dev/H2, Raft một node và seal custody cùng máy cần thay đổi khi triển khai. ClamAV image không chứa libunrar và không bảo đảm quét RAR. Không đưa database dump, dữ liệu cá nhân hoặc credential vào repository.

Mã nguồn gốc: [Apache-2.0](LICENSE), [NOTICE](NOTICE). Thư viện/font/image giữ giấy phép riêng: [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). Snapshot Windows: evidence 936/936 package đã cài, gồm 12 publisher declarations phân biệt với standalone LICENSE; 110 package optional cần rà đúng nền tảng nếu phân phối. Binary release cần source/notices tương ứng.

Xem [kết quả kiểm chứng local](docs/architecture/validation-status.md), [hướng dẫn đóng góp](CONTRIBUTING.md), [bảo mật](SECURITY.md) và [chuẩn bị Git](docs/architecture/git-publication.md).

## Hướng dẫn phân quyền

Xem [chức năng của toàn bộ 91 quyền và giới hạn nghiệp vụ](docs/architecture/permission-reference.md). Quyền áp dụng riêng từng tổ chức; tên vai trò không tự cấp quyền. Bảy key user/role CRUD hiện chỉ khai báo trong catalog, chưa phải API chức năng.
