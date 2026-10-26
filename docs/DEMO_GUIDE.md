# Kịch bản demo DX-OS cho hội đồng

Đây là kịch bản thực hành, không phải báo cáo học thuật đã nộp hay kết quả chạy tự động. Chuẩn bị phần chính 10 phút và phần dự phòng hỏi đáp; thông báo nhóm ngày 25/10 dành 15–20 phút tổng cộng. Dùng dữ liệu hư cấu, không ghi hình password.

## Chuẩn bị và tài khoản đúng seed

Chạy theo [INSTALL](../INSTALL.md). Dữ liệu [provenance](DATA_SOURCES.md). Tìm organization có slug dxos-demo từ API hoặc bộ chọn, không hardcode UUID của máy tác giả.

| Người demo | Email | Quyền / giới hạn |
| --- | --- | --- |
| Admin demo | admin.demo@dxos.local | Quản trị trong tổ chức demo theo grants seed, không phải bypass toàn hệ thống |
| An — kinh doanh | an.demo@dxos.local | 13 quyền, xem/tạo task, không sửa/assign toàn tổ chức, không AI |
| Minh Anh — kỹ thuật | minh-anh.demo@dxos.local | 13 quyền, xem/tạo task và ai:use, không sửa/assign toàn tổ chức |
| Nam — kho vận | hoang-nam.demo@dxos.local | 12 quyền, không AI và không quyền HR rộng |
| Hà — nhân sự | thu-ha.demo@dxos.local | 32 quyền HR đã chốt, không tự cấp quyền duyệt chung/lương/AI |

Password seed lấy từ DEMO_ADMIN_PASSWORD trên máy cài; tài khoản đã đổi password dùng password riêng đã đặt. Không có hr.manager@dxos.local hay emp.demo@dxos.local trong bộ seed hiện tại. Xem [ma trận](architecture/demo-business-permissions.md). Không cấp quyền bổ sung để một vai trò xem được mọi màn hình.

## Tình huống: vận hành nhân sự/công việc của một đơn vị đào tạo

Một khoa/đơn vị có nhân sự, hồ sơ cần rà soát, lịch làm việc và các việc có hạn. Dùng chính các module hiện có; tên phòng ban seed là ví dụ doanh nghiệp, không khẳng định dữ liệu lấy từ trường. Luồng người dùng → core → quy trình → dữ liệu → phân tích → kết quả:

1. **H, 1 phút:** đăng nhập, chọn tổ chức, xem nhân sự/phòng ban/tài liệu. Chỉ ra tổ chức hiện tại và nguồn dữ liệu giả lập. Giải thích SSO tùy chọn liên kết danh tính, RBAC vẫn ở backend.
2. **P, 3 phút:** admin mở Quy trình, chọn quy trình bổ sung hồ sơ đang active, tạo một lượt rà soát cho tình huống đơn vị đào tạo. Thấy thông báo và bước HUMAN_CONFIRMATION chờ người thực hiện; đọc trạng thái, người tạo và thời gian. Xác nhận sau khi kiểm tra mẫu, xem COMPLETED và người xác nhận. ACTION/TASK engine chỉ ghi nhận bước: không tuyên bố hợp đồng/hồ sơ đã tự sửa. Nếu cần quản lý việc thật, tạo và cập nhật trong Công việc bằng tài khoản có quyền hiện tại.
3. **D, 2 phút:** mở Dashboard/Công việc, lọc trạng thái/hạn, xem số liệu và nguồn bản ghi; số liệu không cố định vì seed có thể được refresh. Mở audit để thấy sự kiện tạo/xác nhận/hoàn tất. Trình bày REST/OpenAPI để chứng minh React không giữ dữ liệu hay quyền chuẩn.
4. **I, 2 phút:** admin hoặc Minh Anh hỏi “Những công việc nào đang quá hạn?”; mở nguồn câu trả lời và đối chiếu danh sách. Hỏi tiếp tóm tắt dữ liệu vừa tìm. Chỉ gọi live khi đã test provider thật; Docker demo 8090 là mock. Có thể dùng native Ollama theo README để biểu diễn model thật. Không mô tả kiểm tra con số đơn giản là bảo đảm mọi suy luận đều đúng.
5. **An toàn và tái sử dụng, 2 phút:** chuyển An để thấy các quyền bị giới hạn; gọi API thiếu token phải 401, trái quyền/tenant phải 403/404. Chỉ ra core được gọi bởi HTTP client khi không cần React. Mở license, release/tag, INSTALL và CI của đúng revision.

## Khi không có mạng hoặc dịch vụ ngoài lỗi

Dựng/cài dependency cần Internet hoặc cache đã chuẩn bị trước. Khi đã dựng, demo 8090 dùng dữ liệu local + mock và không gọi cloud. Không giả câu trả lời mock thành Ollama thành công. Dùng fixture đã có cho đánh giá và giải thích khác biệt. Nếu provider thật lỗi/hết quota, giữ hiển thị lỗi, chuyển sang bản demo mock được ghi rõ.

Không tắt xác thực/RBAC, không giả GPS hoặc bỏ ca làm để làm đẹp demo. Nếu workflow không active hoặc đã hủy, tạo lượt mới; không sửa trực tiếp database để ép hoàn tất.

## Tự kiểm trước buổi trình bày

- Máy khác clone/export đúng revision, source build, migration và seed thành công.
- Test demo, targeted/full backend, frontend/build/lint và CI đạt; ghi revision và thời điểm.
- Password có trên máy cài, không xuất hiện trong slide/video/log.
- Provider mode đúng nhãn; source links và số liệu khớp bản ghi.
- Báo cáo in và slide tối đa 12 trang do đội rà nội dung; không dùng tài liệu lịch sử có nhãn 100% QA để mô tả revision mới.
