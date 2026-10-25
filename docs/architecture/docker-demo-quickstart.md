# Dựng DX-OS từ source release bằng Docker

Dành cho giảng viên/người chấm: không cần cài MySQL host, không cần nhận .env hoặc dữ liệu từ máy tác giả. Cần Docker Engine/Desktop chạy **Linux containers**, Docker Compose v2 hỗ trợ --wait và Node.js 22.21.1 hoặc Node 22 mới hơn. Cần Internet khi build lần đầu, cổng 8090 trống và dung lượng trống cho image/build cache; nên dành ít nhất 8 GB RAM cho Docker và 10 GB ổ đĩa trống.

MySQL demo được build từ backend/deploy/mysql.Dockerfile: server giữ 8.0.44, cập nhật gói Oracle Linux, bỏ MySQL Shell không dùng và biên dịch lại gosu bằng Go đã vá. Container chạy user mysql; không nâng cấp MySQL host hoặc dữ liệu thật.

## Lấy đúng mã nguồn phát hành

Tại [Releases](https://github.com/nt6175790-afk/DXOS/releases), chọn **v0.2.0**, tải DXOS-v0.2.0-source.zip và SHA256SUMS.txt. Giải nén, mở terminal trong thư mục có package.json. Hoặc dùng:

```powershell
git clone --branch v0.2.0 --depth 1 https://github.com/nt6175790-afk/DXOS.git
cd DXOS
git describe --tags --exact-match
git rev-parse HEAD
```

So sánh commit với manifest/release notes. Trên PowerShell dùng Get-FileHash DXOS-v0.2.0-source.zip -Algorithm SHA256 rồi so với SHA256SUMS.txt. Source chính thức gắn tag, không dùng main để giả định mã nguồn release cũ. Archive chỉ chứa mã nguồn đã commit, migrations, lockfiles, legal notices, cấu hình build và tài liệu; không chứa node_modules, dữ liệu thật hoặc secret.

## Build và chạy

Không cần npm ci trên host cho các lệnh sau; dependency được cài theo lockfile trong Docker:

```powershell
npm.cmd run demo:init
npm.cmd run demo:build
npm.cmd run demo:up
npm.cmd run demo:status
npm.cmd run demo:test
```

Linux/macOS thay npm.cmd bằng npm. demo:up chỉ khởi động sau build; chờ MySQL healthy, bootstrap migrate/status/drift/seed hoàn thành, backend và proxy healthy. Bootstrap thoát mã 0 là bình thường. Sau lần chạy đầu, mở **http://localhost:8090**.

- Email: **admin.demo@dxos.local**.
- Mật khẩu: mở **.secrets/demo/compose.env** bằng trình soạn thảo local và lấy giá trị DEMO_ADMIN_PASSWORD. Không dùng mật khẩu trong README cũ, không có mật khẩu chung công khai.
- Tổ chức: **DX-OS Demo Organization**.

Mỗi máy có password/JWT/database password ngẫu nhiên riêng. demo:init chạy lại giữ nguyên cấu hình, không reset mật khẩu. Không xóa file secret trong khi giữ DB volume: mất mật khẩu sẽ làm cấu hình và DB không khớp. File này bị Git và Docker build context loại trừ; không upload, chia sẻ hoặc chạy compose config/inspect env ra log công khai. Quyền trên Windows theo ACL tài khoản hiện tại; công cụ không tự đổi ACL.

Nếu không có Node trên host, có thể tạo cấu hình bằng official Node image trong root source:

```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 node backend/scripts/init-demo-env.js
docker compose --env-file .secrets/demo/compose.env -f backend/deploy/compose.demo.yml build
docker compose --env-file .secrets/demo/compose.env -f backend/deploy/compose.demo.yml up -d --wait --wait-timeout 240
```

Chỉ dùng Docker trên Windows/macOS có directory mount cho source. Trên Linux, chạy generator bằng Node host với tài khoản của mình để file local không bị sở hữu bởi root. Để chạy smoke không có Node host, có thể dùng official Node container với network host trên Linux; đường đơn giản và đã kiểm chứng là có Node host như phần đầu.

## Tắt, khởi động lại và dữ liệu

```powershell
npm.cmd run demo:down
npm.cmd run demo:up
npm.cmd run demo:test
```

down dừng container nhưng giữ hai named volumes: demo_mysql và demo_files thuộc project dxos-demo. Lần up sau giữ dữ liệu; không dùng down -v nếu cần giữ demo. Không kết nối host MySQL dx_os, không thay backend/.env. Muốn đổi cổng trước lần up, sửa DEMO_HTTP_PORT trong file private local (1024-65535); frontend URL/CORS theo giá trị đó. Không mở MySQL/backend ra host. HTTP chỉ bind loopback, không cho máy khác truy cập.

Database chứa metadata còn volume file chứa bytes tài liệu: backup/restore phải giữ cả hai cùng thời điểm. Dừng ứng dụng trước khi sao lưu volume bằng công cụ Docker/backup riêng; giữ nguyên file cấu hình private trong nơi lưu an toàn. Không đưa dump/volume vào Git/Release. Không dùng migrate reset để rollback. Khi source không tương thích schema mới hơn, phục hồi backup đúng phiên bản trong môi trường riêng trước khi chạy tag cũ.

## Phân tách demo và production

Bản hardening kế tiếp v0.2.0 bổ sung [bốn vai trò nghiệp vụ](demo-business-permissions.md) trong bootstrap và kiểm thử từng tài khoản; tag v0.2.0 giữ nguyên hành vi lịch sử. Dùng đúng source/commit của bản mới để thử phần AI agent và ma trận mới. `demo:refresh` giữ quyền đã có, không tự ghi đè role do người vận hành chỉnh.

Compose này dùng NODE_ENV=development, AI mock và local demo seed hiện có. SSO/ClamAV/OpenBao tắt trong bộ demo đơn giản; upload tại đây không được quét virus. Không dùng dữ liệu thật, không public/tunnel bộ demo này. Muốn trình diễn đầy đủ các tích hợp, dùng [security stack hiện có](security-devsecops-setup.md).

Production cần HTTPS/domain, backup/restore đã diễn tập, identity service/database production, secret custody ngoài máy ứng dụng, shared rate-limit store và ClamAV fail-closed. Không coi local Compose là cấu hình production. Quyền vẫn kiểm tra ở backend cho từng actor/tổ chức; seed chỉ cấp quyền demo theo catalog hiện có, không có magic administrator bypass.

## Xử lý lỗi

| Lỗi | Kiểm tra |
| --- | --- |
| Docker daemon unavailable | Mở Docker Desktop, bật Linux containers, chạy docker version. |
| Cổng 8090 bận | Chọn DEMO_HTTP_PORT khác trong file private rồi up lại. |
| Build thiếu RAM/ổ đĩa | Tăng tài nguyên Docker/giải phóng dữ liệu của chính mình; không tắt security gate hoặc bỏ npm ci. |
| Bootstrap exit khác 0 | Xem nhãn bước trong docker compose logs bootstrap; không in file env. Không khởi động backend nếu migration/seed chưa đạt. |
| Database access denied sau khi sửa secret | Khôi phục cấu hình private tương ứng volume; không sửa password ngẫu nhiên để đoán. |
| Đăng nhập lỗi | Dùng email và DEMO_ADMIN_PASSWORD của chính bộ Docker demo; tài khoản local native/SSO có thể dùng password khác. |
| Trang 403 | Kiểm tra tổ chức đang chọn và quyền tài khoản, không bỏ kiểm tra RBAC. |

Các digest base image/lockfile giữ đầu vào chính xác; apk upgrade lấy bản vá tại thời điểm build. Đảm bảo truy xuất đúng source theo tag và kiểm tra build/run, không cam kết binary bit-for-bit hoặc package registry không thay đổi trong tương lai.

## Chấm công và lịch demo v0.2.0

Seed tạo ca 09:00–18:00 và lịch bảy ngày theo giờ Việt Nam, cuối tuần nghỉ; giữ các chỉnh sửa đã có. Chưa tự cấu hình vị trí công ty. Quản lý nhập địa chỉ, mở Google Maps và dán link ghim đầy đủ tại màn hình Chấm công. Bán kính 100 m được kiểm tra ở backend; cần GPS chính xác và quyền trình duyệt. Xem [cách chọn ghim](attendance-google-maps.md) và [giới hạn bản phát hành](../release/v0.2.0.md).

Docker: khi lịch đã cũ, chạy npm.cmd run demo:refresh (MySQL demo phải đang chạy). Native: chạy lại npm.cmd --workspace @dx-os/backend run seed:demo. Chỉ thêm lịch còn thiếu; không reset quyền, mật khẩu, địa điểm hoặc dữ liệu đã chỉnh.
