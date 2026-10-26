# Cài DX-OS từ mã nguồn

Mã nguồn gốc Apache-2.0. Đường demo không yêu cầu cloud: Linux + Docker Engine/Compose + Node.js 22.21.1 hoặc Node 22 tương thích mới hơn (npm ≥10). Windows có thể dùng Docker Desktop Linux containers; Docker Desktop có điều khoản riêng. Chạy docker info thành công trước khi dựng.

## Demo cô lập cho người chấm

Chạy tại thư mục package.json sau khi clone https://github.com/nt6175790-afk/DXOS.git. Để tái lập release, checkout đúng tag trên trang Releases và ghi lại git rev-parse HEAD; không dùng tag cũ cho chức năng mới.

~~~sh
node backend/scripts/init-demo-env.js
docker compose --env-file .secrets/demo/compose.env -f backend/deploy/compose.demo.yml build
docker compose --env-file .secrets/demo/compose.env -f backend/deploy/compose.demo.yml up -d --wait --wait-timeout 240
node backend/scripts/test-demo-live.js
~~~

Mở http://localhost:8090, email admin.demo@dxos.local. Mở file local .secrets/demo/compose.env để lấy DEMO_ADMIN_PASSWORD; không đưa toàn bộ file vào issue/chat. Password được sinh trên chính máy cài, không có mật khẩu chung trong Git. Các tài khoản khác và giới hạn quyền: [DEMO_GUIDE](docs/DEMO_GUIDE.md).

Docker build tự cài dependency và compile; không cần npm ci trên host cho đường demo này. MySQL 8.0.44 và dữ liệu giả lập ở volume riêng, không kết nối dx_os của host. Backend/data dùng mạng nội bộ; chỉ frontend publish loopback. AI mock, SSO/scanning/OpenBao không bật trong bộ demo đơn giản.

Làm mới ngày mẫu: npm run demo:refresh, giữ credential và quyền. Dừng: npm run demo:down; không thêm -v nếu cần giữ dữ liệu. Nếu cổng 8090 bận, đặt DEMO_HTTP_PORT=8091 trong file local vừa sinh trước khi up, rồi dùng cổng mới. Không bỏ health check hoặc migration để che lỗi mạng/tải image/đĩa đầy.

## Native và AI thật

Xem [README](README.md), [hướng dẫn người chấm](docs/architecture/teacher-demo-quickstart.md) và mục Ollama trong README. Native cần MySQL do người cài chuẩn bị; chỉ dùng database development riêng. Tài khoản Ollama và Internet không theo Git. Mock không phải bằng chứng model thật hoạt động.

## Kiểm chứng

~~~sh
npm ci
npm --prefix frontend ci
npm run db:generate
npm run db:validate
npm run lint:backend
npm run build:backend
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
node backend/scripts/check-source-licenses.js
~~~

Full backend: npm --workspace @dx-os/backend run test:rbac:mysql, cần DATABASE_URL local có quyền tạo/xóa database tạm. Runner replay migration, kiểm drift và chỉ xóa database có tên tạm riêng; không reset dx_os.

Nếu sai password: dùng đúng cài đặt, email không có dấu chấm cuối. Nếu 403: kiểm membership ACTIVE và quyền, không cấp admin để bỏ qua test. Demo 8090 không bật SSO. Chấm công cần ca làm và địa điểm công ty do quản trị cấu hình; không tạo GPS giả để vượt bán kính 100 m.
