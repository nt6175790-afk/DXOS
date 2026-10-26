# Đối chiếu yêu cầu giảng viên — 26/10/2026

## Nguồn

Đề HaUI 16 mục gửi ngày 01/10, Quick-guide, thể lệ, phiếu chấm và thông báo trong nhóm Olympic đã đọc. Không đưa tài liệu nội bộ/đăng ký cá nhân lên repo.

- [Đề quốc gia cập nhật](https://vfossa.vn/tin-tuc/de-thi-phan-mem-nguon-mo-olp-2026-798.html)
- [Thể lệ](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html)
- [SmartCity tham khảo](https://github.com/Haui-HIT-H2K/SmartCity-Platform): không phải dependency DX-OS, không sao chép code hoặc số đo.

## Đối chiếu mã nguồn trước khi sửa

| Yêu cầu | Đã có | Thiếu / xử lý đợt này |
| --- | --- | --- |
| Ba tầng, headless | React riêng, REST, IAM/RBAC, Prisma, workflow | Architecture cũ sai vì còn ghi module nghiệp vụ là tương lai: cập nhật sơ đồ và bằng chứng |
| H: con người | Auth, tổ chức, people, departments, files/documents | Sửa tài khoản trong hướng dẫn demo không khớp seed |
| P: luồng có người xử lý, trạng thái/lịch sử | Tasks/leave/approval/workflow/audit | Chặn xác nhận sau hủy, định nghĩa inactive; regression HTTP/MySQL |
| D: nguồn chuẩn, tìm/lọc/thống kê/API | MySQL, dashboard/search/reports/OpenAPI | Bổ sung provenance và tái tạo dữ liệu giả lập |
| I: phân tích và đánh giá | Agent chỉ đọc, 13 công cụ, eval, mock/Ollama | Giữ quyền công cụ và phân biệt mock/live, không quảng cáo AI tự sửa |
| Nghiệp vụ đơn vị đào tạo | Dùng lại hồ sơ nhân sự/công việc của một khoa | Kịch bản rõ người xác nhận, API, persistence, audit; không tạo CRUD trùng lặp |
| License OSI, ghi ở từng tệp | Apache-2.0, notices dependency | Thiếu SPDX: thêm header code, sidecar SQL/JSON giữ checksum, gate CI |
| Source build/install | Docker source-demo CI, seed và secret riêng mỗi máy | INSTALL root, tài khoản đúng; tar.gz cho packager |
| Release/version | v0.2.0 có sẵn, chưa có agent/hardening mới | Không sửa tag cũ; revision mới chỉ phát hành sau kiểm chứng |
| Changelog/issue/contribution | README/CONTRIBUTING, issue/PR template | Thêm CHANGELOG root và liên kết nghiệm thu |
| Bảo mật/hạ tầng, branch/PR | Security Compose/CI/tests; AdGuard đánh giá riêng | Kiểm tra runtime, không gọi docs-only là tích hợp; không giả đóng góp thành viên |
| Chạy máy khác | CI export Git archive rồi build/run trên MySQL sạch | Chạy lại kiểm thử bản sửa; không dùng số cũ ký PASS |

## Kế hoạch thực hiện

1. Sửa tài liệu sai, thêm ba tầng, H-P-D-I, provenance, INSTALL/CHANGELOG.
2. Sửa lỗi lifecycle workflow phát hiện khi rà soát; thêm test API/MySQL, giữ catalog và grants.
3. Thêm license header/gate, không sửa SQL lịch sử hay license bên thứ ba.
4. Targeted → full backend MySQL tạm → frontend → Prisma/build/lint → source/archive/publication.
5. Chỉ ghi PASS cho kiểm tra thực sự đạt. Không rewrite/backdate lịch sử để tạo bằng chứng giả.

## Giới hạn phải trình bày

- Modular monolith, không phải PaaS/microservice/no-code hoàn chỉnh; chứng minh headless bằng API.
- Workflow ACTION/TASK chỉ ghi nhận bước, không tự sửa hợp đồng/tạo task. Automation riêng mới có action nghiệp vụ. Demo HUMAN_CONFIRMATION thật.
- Demo đơn giản mock/reverse proxy; security stack riêng. Cloud không bảo đảm mạng/hạn mức và không bắt buộc để mở ứng dụng.
- Chưa có domain/máy chủ production hoặc benchmark tải lớn. GPS trình duyệt có thể giả mạo; 100 m không phải chống gian lận tuyệt đối.
- Báo cáo in, slide ≤12 trang và trình bày phải được đội rà soát trước buổi thi. DEMO_GUIDE không phải báo cáo/slide đã nộp. Video chỉ khuyến nghị.
- Không thể tái tạo lịch sử đóng góp theo tuần bằng cách backdate commit; giữ lịch sử thật.

Kết quả thực thi: [teacher-validation](teacher-validation.md). Tài liệu đối chiếu không tự chứng nhận đạt hội đồng/production.
