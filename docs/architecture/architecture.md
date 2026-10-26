# DX-OS: ba tầng và ranh giới Open-Core

Cập nhật theo mã nguồn ngày 26/10/2026. NestJS modular monolith, React triển khai riêng. Ba tầng là ranh giới trách nhiệm; không tuyên bố microservices hay PaaS đa ngôn ngữ hoàn chỉnh.

~~~mermaid
flowchart TB
  subgraph L3["Tầng 3 — Ứng dụng nghiệp vụ"]
    UI["React: nhân sự, công việc, hồ sơ, lịch"]
    CLIENT["Ứng dụng khác / HTTP client"]
  end
  subgraph L2["Tầng 2 — H-P-D-I"]
    H["Human: tổ chức, nhân sự, tài liệu"]
    P["Process: công việc, phê duyệt, workflow"]
    D["Data: tìm kiếm, dashboard, báo cáo"]
    I["Intelligence: agent chỉ đọc theo quyền"]
  end
  subgraph L1["Tầng 1 — Lõi headless"]
    API["REST /api/v1, validation, lỗi chuẩn"]
    IAM["IAM / SSO / ACTIVE membership / RBAC"]
    WF["Workflow engine / audit / thông báo"]
    DB["Prisma / MySQL 8.0.44 / file storage"]
  end
  UI --> API
  CLIENT --> API
  API --> IAM
  IAM --> H & P & D & I
  P --> WF
  H & P & D --> DB
  I -->|"Công cụ định sẵn, không SQL tùy ý"| D
  WF --> DB
~~~

## Luồng gọi và bằng chứng

Backend không import frontend; HTTP client dùng API khi React không chạy. app.module.ts tập hợp các module, app.setup.ts cấu hình validation, prefix, CORS, security headers và lỗi. OpenAPI ghép ở modules/api-documentation, endpoint /api/v1/docs/openapi.json khi bật tài liệu. Chi tiết ở contracts/api/.

IAM dùng Argon2id, JWT ngắn hạn và refresh token luân chuyển. Keycloak/OIDC là SSO tùy chọn, không thay quyền DX-OS. Quyền bắt nguồn từ membership–role–permission trong tổ chức, không từ tên role. Xem [RBAC](rbac.md), [ma trận demo](demo-business-permissions.md).

Demo đơn giản dùng reverse proxy frontend chuyển /api/ tới backend; backend là lớp kiểm soát API. Security stack đầy đủ có APISIX và Coraza WAF phía trước. Không gọi reverse proxy đơn giản là APISIX và không khẳng định mọi security service đều bật trong demo:*.

MySQL là nguồn chuẩn, PrismaService là abstraction persistence. Tài nguyên tenant lọc theo organization context, không giao bảo mật cho frontend. Prisma 6.19.3, 25 migration MySQL; không sửa SQL lịch sử.

Workflow có thông báo, bước người xác nhận, trạng thái và lịch sử MySQL. ACTION/TASK trong engine hiện chỉ ghi nhận hoàn tất bước, không tự gia hạn hợp đồng, sửa hồ sơ hoặc tạo Task nghiệp vụ. Automation là module riêng có action tạo task theo rule và quyền riêng. Không trình diễn việc ghi nhận bước như giao dịch đã thực thi.

Agent chỉ đọc, công cụ định sẵn kiểm quyền qua service, không SQL tùy ý. Mock offline hoặc model qua provider hiện có; không RAG/vector và không AI tự duyệt/sửa. Cloud cần mạng/tài khoản riêng; phải phân biệt mock với live.

## Tái sử dụng và giới hạn

UI/client mới có thể dùng IAM, RBAC, REST, audit, file storage và workflow không phụ thuộc React. Thêm nghiệp vụ qua module NestJS với hợp đồng tương thích, không tạo IAM thứ hai. Chưa có hot-plug/no-code hoặc benchmark 100.000 người dùng.

Xem [đối chiếu yêu cầu](../review/teacher-requirements.md), [provenance](../DATA_SOURCES.md), [cài đặt](../../INSTALL.md), [security stack](security-devsecops-setup.md).
