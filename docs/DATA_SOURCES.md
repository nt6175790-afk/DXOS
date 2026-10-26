# Nguồn dữ liệu và provenance

Demo không chứa dữ liệu trường/sinh viên/nhân viên/doanh nghiệp thật. Không gọi bộ seed là open dataset do cơ quan nhà nước công bố.

| Dữ liệu | Cách tái tạo | Phạm vi |
| --- | --- | --- |
| Tổ chức, 5 nhân sự, phòng ban, task | backend/scripts/demo/demo-fixtures.ts và seed-demo-dataset.ts | Hư cấu do dự án tạo; mã sinh dữ liệu Apache-2.0 |
| Vai trò | backend/scripts/demo/seed-demo-roles.ts | Ma trận đã chốt, không mở quyền staff để làm đẹp demo |
| Hoạt động gần ngày chạy | backend/scripts/demo/seed-demo-activity.ts | Giả lập theo ngày, không thay dữ liệu production |
| PDF mẫu | Hàm demoPdf trong fixtures | Hư cấu, không sao chép hồ sơ người thật |
| Ca đánh giá AI | tests/backend/fixtures/ai-agent-eval.json và ai-agent.eval.ts | Fixture, không phải benchmark phổ quát |
| Người dùng nhập | API có xác thực/quyền, organization ID, timestamp và audit | Quyền sử dụng do người nhập chịu trách nhiệm, không mặc nhiên Apache-2.0 |

MySQL là nguồn chuẩn cho dashboard và công cụ AI. ID, tổ chức, timestamp, người thực hiện/audit giúp truy xuất nguồn. REST và CSV là cách tái sử dụng theo quyền. Agent dẫn về bản ghi hiện có, không bịa nguồn Internet.

Đề HaUI không bắt buộc đúng hai nguồn dữ liệu mở. Nếu bổ sung nguồn ngoài phải ghi URL, tác giả, license, ngày lấy, trường dữ liệu, cách làm sạch và snapshot có quyền phân phối. Không commit dump dx_os, dữ liệu cá nhân, key hoặc chat Zalo. Tài liệu của thầy chỉ được viện dẫn, không tự tái cấp phép.

Cloud AI chuyển câu hỏi và dữ liệu công cụ ra nhà cung cấp: chỉ dùng demo trong hướng dẫn này. Muốn giữ dữ liệu trong mạng nội bộ phải tự host model, đánh giá tài nguyên/chất lượng riêng. Mock luôn ghi rõ mock.
