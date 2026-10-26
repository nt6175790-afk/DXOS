# Hướng dẫn mở và test DX-OS trên máy mới

Link mã nguồn: https://github.com/nt6175790-afk/DXOS

Đây là hướng dẫn chạy local, chưa có website demo công khai. Link GitHub mở được để đọc/tải mã nguồn; để dùng ứng dụng, cần hoàn tất các bước dưới đây trên chính máy người chấm. Không cần tài khoản hay dữ liệu MySQL từ máy tác giả.

**Có Docker?** Dùng [bộ demo từ source release](docker-demo-quickstart.md) để tự dựng MySQL, migration và dữ liệu mẫu trong container, không cần cài MySQL trên host. Các bước bên dưới dành cho chạy native.

## 1. Chuẩn bị

- Git, Node.js 22.21.1 hoặc bản Node 22 mới hơn, npm 10 trở lên.
- MySQL Community 8.0.44 đang chạy ở localhost:3306.
- Cổng 3000 (backend) và 5173 (frontend) đang trống.

Demo cơ bản không cần Docker, API key AI, Keycloak, OpenBao hoặc ClamAV. Các tích hợp này có hướng dẫn riêng trong README; AI dùng mock offline trong lượt demo này.

Lệnh bên dưới dùng PowerShell trên Windows. Dùng npm.cmd để tránh lỗi chặn script npm.ps1. Với Linux/macOS, thay npm.cmd bằng npm và Copy-Item bằng cp.

```powershell
git clone --branch v0.2.0 --depth 1 https://github.com/nt6175790-afk/DXOS.git
cd DXOS
node --version
npm.cmd --version
npm.cmd ci
npm.cmd --prefix frontend ci
```

Dừng và xử lý nếu một lệnh lỗi; không bỏ qua rồi chạy bước tiếp theo.

## 2. Database và cấu hình riêng

Trong MySQL Workbench hoặc MySQL client, tạo database **mới/rỗng** tên dx_os:

```sql
CREATE DATABASE dx_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Nếu tên này đã tồn tại, kiểm tra trước; không xóa/reset database có dữ liệu. Dùng tài khoản MySQL local có quyền tạo bảng/index/foreign key và đọc/ghi trong database dx_os để chạy migration. Demo seed chỉ chấp nhận MySQL local và database dx_os ở chế độ development.

Tại thư mục gốc DXOS:

```powershell
Copy-Item backend/.env.example backend/.env
```

Mở backend/.env bằng trình soạn thảo local, sửa DATABASE_URL bằng thông tin MySQL của chính máy đang chạy. Chuỗi phải có dạng mysql://USER:PASSWORD@localhost:3306/dx_os; USER/PASSWORD là chỗ thay thế, không phải tài khoản có sẵn. Nếu mật khẩu có ký tự đặc biệt, percent-encode phần mật khẩu theo URL.

Đặt các giá trị sau trong cùng file:

```dotenv
NODE_ENV=development
PORT=3000
AI_PROVIDER=mock
AI_MODEL=mock-v1
SSO_ENABLED=false
FILE_SCAN_ENABLED=false
VAULT_ENABLED=false
DEMO_ADMIN_EMAIL=admin.demo@dxos.local
```

Thêm DEMO_ADMIN_PASSWORD với mật khẩu riêng từ 16 ký tự trở lên, tối đa 1024 ký tự. Đây là mật khẩu dùng để đăng nhập demo; không có mật khẩu mặc định công khai. Không gửi file .env cho người khác hoặc commit lên Git. Không đặt AI_API_KEY khi chỉ chạy mock.

Tạo JWT secret ngẫu nhiên và ghi thẳng vào file local, không in secret ra terminal:

```powershell
node -e "const fs=require('node:fs'); const p='backend/.env'; let s=fs.readFileSync(p,'utf8'); const v=require('node:crypto').randomBytes(48).toString('base64url'); s=s.replace(/^JWT_ACCESS_SECRET=.*$/m,'JWT_ACCESS_SECRET='+v); fs.writeFileSync(p,s);"
```

Giữ CORS_ORIGINS và API_PREFIX theo .env.example. Nếu đã từng đặt biến môi trường trong terminal/hệ điều hành, kiểm tra chúng không ghi đè cấu hình mới trong .env.

## 3. Tạo schema và dữ liệu demo

Chạy tại thư mục gốc DXOS, kiểm tra từng lệnh hoàn thành thành công:

```powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate:deploy
npm.cmd run db:migrate:status
npm.cmd --workspace @dx-os/backend run seed:demo-admin
npm.cmd --workspace @dx-os/backend run seed:demo
npm.cmd --workspace @dx-os/backend run seed:demo-roles
```

Migration status phải báo database đã cập nhật. Seed tạo tổ chức dxos-demo, thành viên ACTIVE và quyền theo cơ chế RBAC hiện có. seed:demo-admin đặt/cập nhật mật khẩu admin theo DEMO_ADMIN_PASSWORD; seed:demo dùng cùng mật khẩu cho thành viên demo mới, giữ mật khẩu thành viên đã tồn tại. Chỉ dùng các seed này trên database demo, không dùng production.

`seed:demo-roles` có trong nhánh hardening kế tiếp v0.2.0, xem [ma trận bốn tài khoản](demo-business-permissions.md). Nếu đang chạy tag v0.2.0 cũ, bỏ qua lệnh này; tag cũ không được thay đổi. Bản hardening tạo đúng vai trò kinh doanh/kỹ thuật/kho vận/nhân sự, không cấp quyền rộng chỉ để thử AI.

## 4. Khởi động và đăng nhập

Terminal 1, tại thư mục gốc DXOS:

```powershell
npm.cmd run dev:backend
```

Chờ backend khởi động; mở http://localhost:3000/api/v1/health và xác nhận HTTP 200.

Terminal 2, cũng tại thư mục gốc DXOS:

```powershell
npm.cmd --prefix frontend run dev
```

Mở **http://localhost:5173** trên chính máy này. Đăng nhập bằng:

- Email: **admin.demo@dxos.local** (trừ khi đã đổi DEMO_ADMIN_EMAIL).
- Mật khẩu: giá trị DEMO_ADMIN_PASSWORD đã tự đặt trong backend/.env.
- Chọn tổ chức **DX-OS Demo Organization** nếu giao diện yêu cầu.

Giữ cả hai terminal đang chạy. Dừng bằng Ctrl+C khi test xong. Những lần chạy sau chỉ cần khởi động lại MySQL và hai terminal; không cần cài/seed lại nếu cấu hình và dữ liệu vẫn còn.

## 5. Checklist người chấm

- Health trả 200; frontend mở được và đăng nhập thành công.
- Có tổ chức demo; các trang phòng ban, nhân sự, công việc, tài liệu và thông báo tải được.
- Xem vai trò/thành viên bằng tài khoản admin demo; quyền được kiểm tra theo tổ chức.
- Đăng xuất rồi truy cập trang cần đăng nhập: phải đăng nhập lại.
- Trợ lý AI chạy mock offline: hiểu câu hỏi mẫu (ví dụ "Có việc nào đang quá hạn không?", "Công ty có bao nhiêu phòng ban?", "Hôm nay tôi làm ca mấy giờ?") và trả lời từ dữ liệu thật qua cùng bộ công cụ chỉ đọc, kèm nút nguồn. Không coi kết quả này là kiểm thử model thật; cấu hình gpt-oss xem mục Trợ lý AI trong README.

## Lỗi thường gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| Không mở được localhost:5173 | Kiểm tra terminal frontend còn chạy, không báo lỗi; mở trên đúng máy đang chạy server. |
| API lỗi kết nối/proxy | Kiểm tra MySQL và backend; mở health trên cổng 3000. |
| Prisma P1000/P1001 | Kiểm tra account/password, quyền MySQL, host/port và DATABASE_URL trong backend/.env. |
| Bảng chưa tồn tại | Chạy lại migrate:deploy và migrate:status trên đúng database demo. |
| Invalid email or password | Chạy seed:demo-admin với đúng .env/mật khẩu vừa đặt; dùng đúng email. |
| 403/không có tổ chức | Chạy đủ cả hai seed, chọn tổ chức demo; không tự bỏ kiểm tra quyền. |
| EADDRINUSE hoặc Vite chuyển sang cổng khác | Giải phóng 3000/5173, rồi chạy lại. Đổi cổng cần sửa proxy/CORS tương ứng. |
| npm.ps1 bị chặn | Dùng npm.cmd như hướng dẫn; không cần đổi execution policy/ACL. |
| Prisma generate báo EPERM khi thay query_engine trên Windows | Dừng backend/test đang dùng Prisma của bản checkout này, rồi chạy lại generate trước khi khởi động backend. Không đổi ACL để khắc phục khóa file. |

Không dùng link localhost của máy tác giả để truy cập từ máy khác. Nếu muốn giảng viên mở một link web mà không cài đặt, cần triển khai một demo server riêng rồi cấp tài khoản demo; repository hiện chưa cung cấp server đó.

## Chấm công và lịch demo v0.2.0

Seed tạo ca 09:00–18:00 và lịch bảy ngày theo giờ Việt Nam, cuối tuần nghỉ; giữ các chỉnh sửa đã có. Chưa tự cấu hình vị trí công ty. Quản lý nhập địa chỉ, mở Google Maps và dán link ghim đầy đủ tại màn hình Chấm công. Bán kính 100 m được kiểm tra ở backend; cần GPS chính xác và quyền trình duyệt. Xem [cách chọn ghim](attendance-google-maps.md) và [giới hạn bản phát hành](../release/v0.2.0.md).

Docker: khi lịch đã cũ, chạy npm.cmd run demo:refresh (MySQL demo phải đang chạy). Native: chạy lại npm.cmd --workspace @dx-os/backend run seed:demo. Chỉ thêm lịch còn thiếu; không reset quyền, mật khẩu, địa điểm hoặc dữ liệu đã chỉnh.
