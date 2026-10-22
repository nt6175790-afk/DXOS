# Rà soát quyền và giao diện — 22/10/2026

Phạm vi: đối chiếu quyền backend, menu, trang, nút thao tác, dữ liệu phụ thuộc và các giới hạn chủ sở hữu/trạng thái. Không cấp thêm quyền, không đổi tên vai trò thành quyền, không đổi schema hoặc migration.

## Các sửa đổi bảo mật cần thực hiện

- Lịch sử automation yêu cầu `automation:read`; chạy thủ công yêu cầu `automation:manage`, thành viên/tài khoản/tổ chức ACTIVE. Scheduler nội bộ tách khỏi lối gọi HTTP.
- Mọi thao tác hồ sơ nhân viên, kể cả chủ hồ sơ, phải kiểm tra thành viên ACTIVE. Bộ lọc SENSITIVE không được bỏ điều kiện chủ sở hữu khi thiếu `document:sensitive:read`.
- Tệp gắn với hồ sơ nhạy cảm phải giữ giới hạn này khi truy cập qua kho file, tìm kiếm hoặc đính kèm công việc. Không thay hình dạng response; danh sách loại các kết quả không được phép, truy cập ID bị từ chối.
- Compliance có thể tính tổng hợp theo quyền hiện có nhưng không trả nội dung hồ sơ nhạy cảm không được phép xem.

## Giao diện

Tách quyền nhân sự, lương, hồ sơ, công việc và lịch phân ca; không dùng `employee:update` thay các quyền chuyên môn. Lối tắt phải đáp ứng quyền xem trang đích. Nút phê duyệt phải đáp ứng cả guard và điều kiện nghiệp vụ, không cho tự duyệt. Rút gọn các dòng giải thích kỹ thuật và chữ lặp; giữ thông báo lỗi và hướng dẫn hành động.

## Kiểm chứng

Kết quả local: 64 suites / 1.338 backend test PASS; 37 files / 318 frontend test PASS. Các regression hồ sơ/automation/tài liệu quyền: 3 suites / 21 test PASS. Backend/frontend build và lint PASS; Prisma validate PASS; replay/status của 25 migration và drift disposable PASS.

## Trạng thái bàn giao

Đã đồng bộ 42 file khớp baseline vào checkout local, không ghi đè chỉnh sửa riêng; build backend checkout local cũng PASS. Không đổi schema, migration, credential, ACL hoặc dữ liệu dx_os; không tự cấp thêm permission. Có bảng hướng dẫn đủ 91 key, trong đó 7 key chỉ khai báo trong catalog. Không xem đây là release mới hoặc nghiệm thu UI thủ công mọi màn hình; bản v0.2.0 đã phát hành được giữ nguyên. CI của nhánh mới là bước xác nhận riêng, không được coi là đã PASS khi chưa chạy xong. Bundle frontend vẫn khoảng 1,02 MB trước gzip; còn cảnh báo act/jsdom từ test cũ.
