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
- Quản trị thành viên/vai trò.
- Trợ lý AI dạng agent **chỉ đọc**: hỏi đáp tiếng Việt trên dữ liệu của tổ chức theo đúng quyền người hỏi, có nguồn dẫn và kiểm tra số liệu; chạy mock offline hoặc model open-weight gpt-oss (xem [Trợ lý AI](#trợ-lý-ai)).
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

Sửa **file local `backend/.env`**: đặt DATABASE_URL trỏ tới database development `dx_os`, JWT_ACCESS_SECRET ngẫu nhiên riêng, và AI_PROVIDER=mock nếu chỉ demo offline (dùng model thật: xem [Trợ lý AI](#trợ-lý-ai)). Không đưa secret lên Git/chat hoặc dùng placeholder ngoài test. Tạo database rỗng và tài khoản MySQL phù hợp trước khi chạy migration. Không dùng database có dữ liệu quan trọng để thử seed/test.

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
npm --workspace @dx-os/backend run seed:demo-roles     # vai trò Kinh doanh / Kỹ thuật / Kho vận / Nhân sự đã chốt
npm --workspace @dx-os/backend run seed:demo-activity  # tùy chọn: chấm công, đơn nghỉ, lịch họp gần ngày hiện tại
```

Chỉ chạy trên database development/test. Đọc code seed trước khi chạy; seed không phải migration production. Email mặc định: `admin.demo@dxos.local`. Người clone tự đặt password, repository không chứa credential của máy chủ dự án.

### Security stack đầy đủ

Xem [hướng dẫn local](docs/architecture/security-devsecops-setup.md). Giao diện qua WAF: http://localhost:8088. Stack này dùng MySQL trên host, OpenBao TLS/KV-v2/Raft và AppRole agent; không chứa secret/volume của máy gốc. Keycloak chỉ liên kết danh tính, không tự cấp quyền DX-OS. Sonar/SonarJS đã thay bằng quality gate mã nguồn mở.

### Trợ lý AI

Trợ lý là agent **chỉ đọc** tự viết, không dùng LangChain. Model chọn trong 13 công cụ tra cứu: công việc, phê duyệt, nghỉ phép, chấm công, lịch, hồ sơ giấy tờ, phòng ban, nhân sự, số liệu tổng hợp và `calculate` để tính toán. Trước mỗi lần chạy công cụ, backend kiểm lại quyền của người hỏi trong tổ chức và chỉ trả các trường được phép (không có số điện thoại, email, lương từng người). Câu trả lời có nút nguồn dẫn tới bản ghi và cảnh báo khi số liệu không khớp dữ liệu. Không lưu hội thoại phía server, không có RAG/vector. Thiết kế: [spec](docs/architecture/ai-agent-v1-spec.md), [HLD](docs/architecture/ai-agent-v1-hld.md), [API](contracts/api/ai.md).

Mặc định `AI_PROVIDER=mock`: chạy offline, không cần key, hiểu các câu hỏi mẫu và gọi cùng bộ công cụ. Để dùng model open-weight gpt-oss qua server tương thích OpenAI, chọn nơi chạy model:

| Nơi chạy model | Cách có | `AI_PROVIDER` / `AI_BASE_URL` / `AI_MODEL` | `AI_API_KEY` |
| --- | --- | --- | --- |
| Ollama Cloud | Tạo key tại [ollama.com/settings/keys](https://ollama.com/settings/keys) | `ollama` / `https://ollama.com/v1` / `gpt-oss:120b` | Bắt buộc |
| Ollama tự host | Cài [Ollama](https://ollama.com/download), chạy `ollama pull gpt-oss:20b` (khoảng 16 GB bộ nhớ) hoặc `gpt-oss:120b` (GPU khoảng 80 GB) | `ollama` / `http://localhost:11434/v1` / `gpt-oss:20b` | Không cần |
| vLLM tự host | `vllm serve openai/gpt-oss-120b` | `vllm` / `http://<máy>:8000/v1` / `openai/gpt-oss-120b` | Không cần trong mạng nội bộ |

**Ollama Cloud gửi câu hỏi và kết quả công cụ ra ngoài máy, chỉ dùng với dữ liệu demo**; dữ liệu thật cần Ollama/vLLM tự host trong mạng nội bộ. Kết quả đánh giá ở dưới đo trên `gpt-oss:120b`; `gpt-oss:20b` nhẹ hơn nhưng chưa được đánh giá. Tùy chọn: `AI_REASONING_EFFORT` (`low`/`medium`/`high`, mặc định `low`), `AI_AGENT_MAX_STEPS` (số vòng gọi công cụ, mặc định 3), `AI_AGENT_TOTAL_TIMEOUT_MS` (mặc định 45000), `AI_TIMEOUT_MS` (mỗi lần gọi model, mặc định 30000).

Điền cấu hình theo cách chạy DX-OS:

- **Chạy dev** (`npm run dev:backend`): ghi các biến vào `backend/.env` rồi build/chạy lại backend.

  ```dotenv
  AI_PROVIDER=ollama
  AI_BASE_URL=https://ollama.com/v1
  AI_MODEL=gpt-oss:120b
  AI_API_KEY=<key riêng, không commit>
  ```

- **Security stack, dựng mới** (cổng 8088): ghi như trên vào `backend/.env` **trước** khi chạy các bước trong [hướng dẫn security stack](docs/architecture/security-devsecops-setup.md). `init-container-env.js` chép cấu hình AI sang `.security.backend.env` (địa chỉ `localhost` được đổi thành `host.docker.internal`), `publish-openbao-local-secrets.js` chuyển `AI_API_KEY` vào OpenBao.
- **Security stack đã dựng trước đó**: thêm `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL` (và biến tùy chọn) vào `.security.backend.env`; đặt `AI_API_KEY` trong `backend/.env` hoặc biến môi trường rồi chạy lệnh dưới. Lệnh này cũng dùng để đổi key.

  ```powershell
  node backend/scripts/set-openbao-ai-key.js
  docker compose --env-file .security.local.env -f backend/deploy/compose.security.yml --profile app up -d --force-recreate --no-deps backend
  ```

  Ollama tự host trên máy chạy Docker: Ollama mặc định chỉ nghe `127.0.0.1`, cần cho nó nghe trên địa chỉ container truy cập được (ví dụ `OLLAMA_HOST=0.0.0.0`) và chặn cổng 11434 với mạng ngoài bằng firewall.
- **Docker demo cho người chấm** (cổng 8090, `demo:*`): cố định mock, không cần key.

Phân quyền demo giữ đúng [ma trận nghiệp vụ](docs/architecture/demo-business-permissions.md): An (kinh doanh, 13 quyền), Minh Anh (kỹ thuật, 13 quyền), Nam (kho vận, 12 quyền), Hà (nhân sự, 32 quyền). Chỉ admin và Minh Anh có `ai:use`; ba tài khoản còn lại phải bị từ chối trước khi gọi model. Không cấp thêm quyền duyệt chung, lương hoặc hồ sơ nhạy cảm để trình diễn AI. Với native, chạy `seed:demo-roles` sau `seed:demo`; Docker demo mới tự chạy seed role trong bước bootstrap. Seed giữ nguyên admin/password/tổ chức khác và dừng nếu gặp role hoặc assignment xung đột. `seed:demo-activity` vẫn là bước tùy chọn, chỉ áp dụng local. Bộ đánh giá đã cập nhật theo ma trận này, gồm cả trường hợp phải trả 403:

```powershell
npm --workspace @dx-os/backend run ai:eval   # mock; đặt các biến AI_* ở trên để chạy trên model thật
```

Để kiểm thử mock mà không đụng dữ liệu demo đang dùng, đặt `DATABASE_URL` của MySQL local trong môi trường riêng và chạy `npm --workspace @dx-os/backend run test:rbac:mysql -- --testRegex 'ai-agent[.]eval[.]ts$'`. Runner tạo/hủy database tạm; role/data/password test được tạo riêng, không nới quyền trên `dx_os`.

`numericCheck=PASS` chỉ cho biết các con số đã xuất hiện trong ngữ cảnh, chưa xác minh đúng đối tượng/đơn vị/ý nghĩa; kiểm tra bản ghi qua nguồn dẫn. Ollama Cloud có credit/hạn mức theo [gói sử dụng](https://ollama.com/pricing), không cam kết gpt-oss:120b miễn phí không giới hạn.

Kết quả gần nhất ở [phụ lục C của spec](docs/architecture/ai-agent-v1-spec.md#phụ-lục-c-kết-quả-kiểm-thử-và-đánh-giá-25102026-máy-phát-triển).

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
