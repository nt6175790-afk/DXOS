# Changelog

Các mục ghi thay đổi thật theo phiên bản; không phải chứng nhận production hoặc lịch sử phát triển được tái tạo.

## Unreleased — đối chiếu yêu cầu HaUI (26/10/2026)

- Bổ sung kiến trúc ba tầng/H-P-D-I, nguồn dữ liệu, INSTALL và kịch bản demo đúng seed.
- Bổ sung SPDX cho mã gốc và sidecar cho SQL/JSON; không đổi migration lịch sử hoặc license dependency.
- Workflow từ chối định nghĩa inactive, xác nhận sau hủy và xác nhận lặp; kiểm thử HTTP với database tạm.
- Cập nhật công cụ đóng gói với source tar.gz và manifest checksum.
- Trạng thái kiểm thử/release của revision mới xem docs/review/teacher-validation.md; chưa phát hành chỉ vì có mục changelog.

## Thay đổi trên main sau v0.2.0

- AI agent chỉ đọc và hardening, quyền nghiệp vụ đã chốt, hướng dẫn Ollama cho người chấm.
- Không sửa lại nội dung tag v0.2.0; tag đó chưa có các thay đổi mới.

## v0.2.0

Bản demo và hướng dẫn phát hành trước đợt agent mới; xem [release notes](docs/release/v0.2.0.md). Giữ nguyên tag/assets lịch sử để truy xuất.
