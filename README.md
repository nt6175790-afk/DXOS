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

Chi tiết bản mới, quy trình kiểm chứng và giới hạn: [DX-OS v0.2.0](docs/release/v0.2.0.md). **Để dùng AI agent Ollama mới như bản demo hiện tại, lấy nhánh `main` và làm theo [hướng dẫn AI Ollama cho người chấm](#cài-ai-ollama-cho-giảng-viênngười-chấm-windows). Tag v0.2.0 cũ không chứa các cập nhật này và không được sửa lại.**

## Đối chiếu yêu cầu HaUI và cách kiểm chứng

[INSTALL](INSTALL.md) · [Kiến trúc ba tầng/H-P-D-I](docs/architecture/architecture.md) · [Bảng đối chiếu](docs/review/teacher-requirements.md) · [Kịch bản demo](docs/DEMO_GUIDE.md) · [Nguồn dữ liệu](docs/DATA_SOURCES.md) · [Changelog](CHANGELOG.md) · [Kết quả kiểm thử đợt mới](docs/review/teacher-validation.md). Các giới hạn và trạng thái phát hành được ghi rõ; không coi tài liệu lịch sử là chứng nhận hiện tại.

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

Keycloak giữ phiên bản 26.8.1, được đóng gói trên OpenJDK 21 đã vá thay lớp JVM/CA cũ; xem [runtime hardening và kiểm thử SSO](docs/architecture/keycloak-runtime-hardening.md). Security Compose và CI sử dụng cùng image build; không cần thay realm, client hoặc mật khẩu đang có.

### Trợ lý AI

Trợ lý là agent **chỉ đọc** tự viết, không dùng LangChain. Model chọn trong 13 công cụ tra cứu: công việc, phê duyệt, nghỉ phép, chấm công, lịch, hồ sơ giấy tờ, phòng ban, nhân sự, số liệu tổng hợp và `calculate` để tính toán. Trước mỗi lần chạy công cụ, backend kiểm lại quyền của người hỏi trong tổ chức và chỉ trả các trường được phép (không có số điện thoại, email, lương từng người). Câu trả lời có nút nguồn dẫn tới bản ghi và cảnh báo khi số liệu không khớp dữ liệu. Không lưu hội thoại phía server, không có RAG/vector. Thiết kế: [spec](docs/architecture/ai-agent-v1-spec.md), [HLD](docs/architecture/ai-agent-v1-hld.md), [API](contracts/api/ai.md).

Mặc định `AI_PROVIDER=mock`: chạy offline, không cần key, hiểu các câu hỏi mẫu và gọi cùng bộ công cụ. Để dùng model open-weight gpt-oss qua server tương thích OpenAI, chọn nơi chạy model:

#### Cài AI Ollama cho giảng viên/người chấm (Windows)

**Cách đã kiểm thử live ngày 26/10/2026:** DX-OS native → Ollama trên máy (`127.0.0.1:11434`) → Ollama Cloud, model `gpt-oss:120b-cloud`. Đây là model thật, không phải mock; model chạy trên Cloud, không phải tải 120B về laptop. Cần Internet và tài khoản Ollama còn hạn mức. Đăng nhập Ollama, cấu hình local và mật khẩu demo **không đi kèm Git**. Không cần API key OpenAI hoặc API key Ollama riêng khi dùng cách đăng nhập ứng dụng này.

**1. Chuẩn bị và lấy đúng mã nguồn**

Cài [Git](https://git-scm.com/downloads), Node.js 22.21.1 hoặc bản Node 22 mới hơn (npm ≥ 10), MySQL Community **8.0.44** và [Ollama cho Windows](https://ollama.com/download/windows). Các lệnh dưới đây chạy trong PowerShell; dùng `npm.cmd` để tránh lỗi chặn `npm.ps1`. Ollama cần đang chạy. Không cần GPU lớn cho model Cloud này.

```powershell
git clone --branch main https://github.com/nt6175790-afk/DXOS.git
cd DXOS
node --version
npm.cmd --version
ollama --version
npm.cmd ci
npm.cmd --prefix frontend ci
Copy-Item backend/.env.example backend/.env
```

Chỉ dùng `Copy-Item` khi chưa có `backend/.env`; không ghi đè cấu hình đang dùng. Nếu đã clone, cập nhật `main` trong checkout sạch thay vì tải lại tag v0.2.0. Khi dùng Download ZIP, chọn nhánh **main**, giải nén rồi mở PowerShell tại thư mục có `package.json`. Dừng và xử lý nếu bất kỳ lệnh nào lỗi.

**2. Đăng nhập và kết nối Ollama Cloud**

Mở ứng dụng **Ollama → Settings → Sign In**. Đăng nhập tài khoản của chính người chạy, nhập mã xác minh email trực tiếp vào trang Ollama, rồi bấm **Connect** để liên kết đúng máy. Chỉ xác minh email chưa hoàn tất kết nối: Settings phải hiển thị tài khoản đã kết nối thay cho **Not connected**. Giữ tùy chọn Cloud bật; không cần bật **Expose Ollama to the network** cho cách chạy native này.

Trong PowerShell, chuẩn bị model:

```powershell
ollama pull gpt-oss:120b-cloud
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/version
ollama run gpt-oss:120b-cloud "Chỉ trả lời: Xin chào DX-OS."
```

`pull` chỉ tải manifest Cloud nhỏ. Model phải xuất hiện trong danh sách và lệnh `run` phải trả lời thật. Nếu lệnh cuối mở chế độ chat tương tác, gõ `/bye` để thoát. Không dùng `gpt-oss:120b` không có hậu tố `-cloud` ở bước này: đó là lựa chọn tải model chạy tại máy, có yêu cầu tài nguyên khác. Xem [hướng dẫn Cloud chính thức](https://docs.ollama.com/cloud) và [cách đăng nhập qua Ollama local](https://docs.ollama.com/api/authentication).

**3. Cấu hình DX-OS trên chính máy người chạy**

Tạo database **mới/rỗng** `dx_os` trong MySQL local (không xóa/reset database có dữ liệu). Thực hiện trong MySQL Workbench hoặc MySQL client:

```sql
CREATE DATABASE dx_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Mở `backend/.env` bằng trình soạn thảo. Đặt `DATABASE_URL` theo tài khoản MySQL của máy này, dạng `mysql://USER:PASSWORD@localhost:3306/dx_os`; thay USER/PASSWORD và percent-encode mật khẩu nếu có ký tự đặc biệt. Tài khoản MySQL cần quyền tạo bảng/index/foreign key và đọc/ghi trong database demo. Thêm `DEMO_ADMIN_PASSWORD` riêng từ **16–1024 ký tự**; đây là mật khẩu đăng nhập DX-OS, không phải mật khẩu Ollama. Không có mật khẩu demo công khai cố định.

Đặt các biến không phải secret sau trong cùng file, mỗi biến chỉ có một dòng:

```dotenv
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
DEMO_ADMIN_EMAIL=admin.demo@dxos.local
SSO_ENABLED=false
FILE_SCAN_ENABLED=false
VAULT_ENABLED=false
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=gpt-oss:120b-cloud
AI_TIMEOUT_MS=30000
AI_AGENT_TOTAL_TIMEOUT_MS=45000
AI_REASONING_EFFORT=low
```

Giữ CORS theo `.env.example`. Tắt SSO/scanner/Vault ở đây chỉ dành cho **demo native cô lập trên máy**, không áp dụng cho production/security stack. Với kết nối Ollama local này, bỏ dòng `AI_API_KEY` đang dùng; không để dòng trống `AI_API_KEY=` và không gửi key OpenAI sang Ollama. Nếu cần giữ cấu hình cũ, sao lưu riêng ngoài Git.

**Quan trọng khi nâng cấp máy đã chạy trước đó:** nếu thư mục gốc còn có `.env`, đồng bộ các biến `AI_*` ở đó với `backend/.env` và bỏ key cũ cho kết nối local này. Kiểm tra cả biến môi trường terminal/hệ điều hành không giữ `AI_PROVIDER=openai` hoặc model cũ. Một file `.env` khác được nạp trước có thể khiến backend vẫn dùng OpenAI dù đã sửa `backend/.env`. Máy clone mới chỉ nên dùng `backend/.env`, không tạo thêm `.env` gốc.

Tạo JWT secret ngẫu nhiên và ghi thẳng vào file local, không in ra terminal:

```powershell
node -e "const fs=require('node:fs'); const p='backend/.env'; let s=fs.readFileSync(p,'utf8'); const v=require('node:crypto').randomBytes(48).toString('base64url'); s=s.replace(/^JWT_ACCESS_SECRET=.*$/m,'JWT_ACCESS_SECRET='+v); fs.writeFileSync(p,s);"
```

Chỉ chạy lệnh này khi thiết lập mới; thay secret trên hệ thống đã dùng sẽ làm access token cũ mất hiệu lực. Không commit `.env`, mật khẩu, API key hoặc thông tin đăng nhập Ollama.

**4. Tạo schema, tài khoản và dữ liệu demo**

Từ thư mục gốc DXOS, chạy lần lượt trên database demo local:

```powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate:deploy
npm.cmd run db:migrate:status
npm.cmd --workspace @dx-os/backend run seed:demo-admin
npm.cmd --workspace @dx-os/backend run seed:demo
npm.cmd --workspace @dx-os/backend run seed:demo-roles
# Tùy chọn: thêm dữ liệu hoạt động gần ngày hiện tại để hỏi AI
npm.cmd --workspace @dx-os/backend run seed:demo-activity
```

Migration status phải báo đã cập nhật; seed phải hoàn tất. `seed:demo-admin` đặt/cập nhật mật khẩu admin theo `DEMO_ADMIN_PASSWORD`; không chạy lại để xử lý lỗi AI. Seed role không tự ghi đè role/quyền đã chỉnh của người vận hành: nếu báo conflict, xem [ma trận và cách xử lý xung đột](docs/architecture/demo-business-permissions.md), không bỏ guard hoặc reset database.

**5. Chạy ứng dụng và đăng nhập**

Giữ Ollama chạy. Terminal 1 tại thư mục gốc DXOS:

```powershell
npm.cmd run dev:backend
```

Terminal 2 tại cùng thư mục:

```powershell
npm.cmd --prefix frontend run dev
```

Mở **http://localhost:5173**, đăng nhập **admin.demo@dxos.local** bằng `DEMO_ADMIN_PASSWORD` đã tự đặt ở bước 3, chọn **DX-OS Demo Organization → Trợ lý AI**. Nhãn model phải là **ollama:gpt-oss:120b-cloud**, không phải OpenAI hoặc mock. Sau mỗi lần đổi cấu hình, dừng/chạy lại backend rồi tải lại trang; chỉ refresh frontend không đủ.

**6. Kiểm tra AI thật**

- Hỏi: **“Hiện tổ chức có bao nhiêu phòng ban? Liệt kê tên các phòng ban.”** Với seed demo chưa chỉnh, kết quả là 5 phòng ban và có nguồn dẫn tới danh sách phòng ban.
- Hỏi tiếp: **“Bạn vừa liệt kê những phòng ban nào? Tóm tắt lại.”** để kiểm tra hội thoại nhiều lượt.
- Hỏi: **“Tuần này ai nghỉ phép?”** và đối chiếu màn hình Nghỉ phép theo thời gian/trạng thái tương ứng. Không có đơn phù hợp là kết quả hợp lệ; không phải lỗi và không được tạo câu trả lời giả.
- Chỉ admin và tài khoản kỹ thuật `minh-anh.demo@dxos.local` có `ai:use` trong ma trận demo đã chốt. Kinh doanh, kho vận và HR không được tự cấp quyền AI để vượt lỗi 403. Mỗi công cụ vẫn kiểm quyền đọc dữ liệu cụ thể.

**7. Xử lý lỗi thường gặp**

| Hiện tượng | Cách kiểm tra/xử lý |
| --- | --- |
| Không tìm thấy lệnh `ollama` | Cài từ trang chính thức, mở lại PowerShell để nhận PATH mới. |
| Không kết nối được cổng 11434 | Mở Ollama; thử lại lệnh `/api/version` ở bước 2. |
| 401 / Not connected / AI Provider chưa được cấu hình | Đăng nhập và bấm **Connect** trên đúng máy. Kiểm tra `ollama run` trực tiếp trước; không chỉ đổi tên provider trong DX-OS. |
| 404 / model not found | Chạy `ollama pull gpt-oss:120b-cloud`; kiểm tra model/config đúng cả hậu tố `-cloud`. |
| Giao diện vẫn ghi OpenAI hoặc mock | Kiểm tra `.env` gốc, `backend/.env`, biến môi trường; khởi động lại backend đúng checkout và tải lại trang. |
| 429 / hết hạn mức | Kiểm tra hạn mức/gói tài khoản Ollama; chờ hạn mức hồi phục hoặc dùng model tự host phù hợp. Không cam kết Cloud miễn phí không giới hạn. |
| Timeout / dịch vụ AI chưa sẵn sàng | Thử `ollama run`, kiểm tra Internet và trạng thái dịch vụ. Giữ timeout cấu hình trên trước khi thử lại, không bỏ giới hạn bảo vệ. |
| DX-OS trả 403 | Kiểm tra tổ chức đang chọn, membership ACTIVE và `ai:use`; quyền tên chức danh không thay cho permission. |
| Login báo sai email/mật khẩu | Dùng mật khẩu local đã đặt khi seed. Tài khoản Ollama và DX-OS là hai hệ thống đăng nhập khác nhau. |

**Phân biệt Docker và native:** `npm.cmd run demo:up` tại cổng **8090** cố định **mock** và có mạng nội bộ; không tự dùng Ollama host khi sửa `backend/.env`. Muốn tái hiện AI thật theo hướng dẫn này, dùng **native cổng 5173**. Security stack cổng **8088** có cấu hình riêng bên dưới; trong container, `127.0.0.1` là container, không phải máy host. Không mở mạng/cổng hoặc sửa Compose chỉ để làm theo hướng dẫn native.

**Phạm vi đã xác minh:** trên máy phát triển ngày 26/10/2026, 3 yêu cầu DX-OS → Ollama Cloud trả HTTP 200 (khoảng 0,8–1,6 giây), hội thoại nhiều lượt hoạt động, 0 đơn nghỉ phép trong tuần và 5 phòng ban khớp dữ liệu demo. Đây là bằng chứng ở thời điểm thử, không bảo đảm mạng/hạn mức hay dữ liệu trên máy khác giống hệt. Cloud gửi câu hỏi và kết quả công cụ ra dịch vụ bên ngoài; chỉ dùng dữ liệu demo trong quy trình này.

#### Các cách triển khai AI khác

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
