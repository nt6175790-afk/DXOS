# Chức năng của từng quyền DX-OS

Đối chiếu catalog và controller/service ngày 22/10/2026. Tổng cộng **91 permission key**. Đây là quyền của một người trong **một tổ chức**, không phải danh sách vai trò cố định.

## Cách phân quyền thực tế

- Tài khoản, tổ chức và membership phải ACTIVE. Vai trò phải ACTIVE và thuộc đúng tổ chức; quyền hiệu lực là hợp các quyền từ những vai trò đang được gán. Không xét tên “admin”, “HR” hoặc “nhân viên” để tự cho phép.
- Đăng nhập chưa có quyền nghiệp vụ không đồng nghĩa được xem mọi phân hệ. Thông báo riêng, lịch cá nhân và các lối self-service có policy chủ sở hữu riêng.
- Quyền xem không tự bao gồm tạo/sửa/xóa. Một thao tác có thể cần nhiều quyền: quyền guard, quyền đọc dữ liệu chọn trong form và điều kiện service đều phải đạt.
- Backend quyết định cuối cùng. Giao diện chỉ giúp người dùng thấy thao tác phù hợp; sửa localStorage hoặc gửi permission từ trình duyệt không cấp được quyền server.
- Seed admin demo là thao tác provisioning local chủ động, gán catalog hiện có. Thành viên demo thông thường không tự được cấp vai trò/quyền. Không phải magic-admin bypass.

## Danh sách đầy đủ

### Báo cáo

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `report:read` | Xem danh sách và chi tiết báo cáo | Đã có xử lý backend |
| `report:export` | Xuất báo cáo báo cáo | Đã có xử lý backend |

### Lịch sự kiện

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `calendar:read` | Xem danh sách và chi tiết lịch sự kiện | Đã có xử lý backend |
| `calendar:create` | Tạo mới lịch sự kiện | Đã có xử lý backend |
| `calendar:update` | Cập nhật lịch sự kiện | Đã có xử lý backend |

### Công việc

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `task:read` | Xem danh sách và chi tiết công việc | Đã có xử lý backend |
| `task:create` | Tạo mới công việc | Đã có xử lý backend |
| `task:update` | Sửa công việc, tiến độ, trạng thái, checklist/bình luận theo policy từng endpoint; không thay thế task:assign | Đã có xử lý backend |
| `task:assign` | Gán/gỡ người thực hiện, người kiểm tra theo API; các thao tác planning cần thêm quyền tương ứng | Đã có xử lý backend |

### Nhân sự

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `employee:read` | Xem danh sách và chi tiết nhân sự | Đã có xử lý backend |
| `employee:create` | Tạo mới nhân sự | Đã có xử lý backend |
| `employee:update` | Cập nhật nhân sự | Đã có xử lý backend |

### Phòng ban

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `department:read` | Xem danh sách và chi tiết phòng ban | Đã có xử lý backend |
| `department:create` | Tạo mới phòng ban | Đã có xử lý backend |
| `department:update` | Cập nhật phòng ban | Đã có xử lý backend |

### Trợ lý AI

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `ai:use` | Gửi yêu cầu sử dụng AI trợ lý ai | Đã có xử lý backend |

### Kho file

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `file:read` | Liệt kê, tìm kiếm, xem metadata và tải file AVAILABLE trong tổ chức; file gắn hồ sơ nhạy cảm vẫn bị kiểm tra chủ sở hữu/quyền nhạy cảm | Đã có xử lý backend |
| `file:upload` | Tải file lên kho file | Đã có xử lý backend |
| `file:delete` | Xóa hoặc gỡ bỏ theo API kho file | Đã có xử lý backend |

### Nhật ký

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `audit:read` | Đọc nhật ký hoạt động của tổ chức; không sửa/xóa nhật ký | Đã có xử lý backend |

### Tổ chức

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `organization:read` | Xem thông tin tổ chức đang tham gia; danh sách tổ chức của chính mình dùng membership ACTIVE | Đã có xử lý backend |
| `organization:update` | Cập nhật tổ chức | Đã có xử lý backend |

### Tài khoản người dùng

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `user:read` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `user:create` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `user:update` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `user:delete` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |

### Vai trò

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `role:read` | Xem danh mục vai trò và danh sách thành viên trong tổ chức | Đã có xử lý backend |
| `role:create` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `role:update` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `role:delete` | Chưa có API thực thi tương ứng; không mô tả như tính năng đã dùng được | Chỉ khai báo trong catalog |
| `role:assign` | Gán/gỡ vai trò ACTIVE hiện có cho thành viên theo các ràng buộc trạng thái; không tạo vai trò mới | Đã có xử lý backend |

### Nghỉ phép

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `leave:read` | Xem danh sách và chi tiết nghỉ phép | Đã có xử lý backend |
| `leave:create` | Tạo mới nghỉ phép | Đã có xử lý backend |
| `leave:approve` | Duyệt/từ chối đơn theo trạng thái, không tự duyệt; nhánh hủy người khác còn cần leave:create ở guard | Đã có xử lý backend |
| `leave:cancel` | Cho phép hủy đơn người khác ở service khi endpoint cũng đã có leave:create; không tự bỏ điều kiện trạng thái | Đã có xử lý backend |

### Chấm công

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `attendance:read` | Xem danh sách và chi tiết chấm công | Đã có xử lý backend |
| `attendance:check-in` | Ghi nhận vào ca của chính mình chấm công | Đã có xử lý backend |
| `attendance:check-out` | Ghi nhận kết thúc ca của chính mình chấm công | Đã có xử lý backend |
| `attendance:manage` | Xem/quản lý phạm vi chấm công của tổ chức và cấu hình địa điểm; không bỏ qua GPS khi tự check-in/out | Đã có xử lý backend |

### Ca làm việc

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `shift:read` | Xem danh sách và chi tiết ca làm việc | Đã có xử lý backend |
| `shift:create` | Tạo mới ca làm việc | Đã có xử lý backend |
| `shift:update` | Cập nhật ca làm việc | Đã có xử lý backend |
| `shift:manage` | Quản lý theo các thao tác được module cho phép ca làm việc | Đã có xử lý backend |

### Phân ca

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `schedule:read` | Xem danh sách và chi tiết phân ca | Đã có xử lý backend |
| `schedule:create` | Tạo mới phân ca | Đã có xử lý backend |
| `schedule:update` | Cập nhật phân ca | Đã có xử lý backend |
| `schedule:manage` | Quản lý theo các thao tác được module cho phép phân ca | Đã có xử lý backend |

### Phê duyệt

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `approval:read` | Xem danh sách và chi tiết phê duyệt | Đã có xử lý backend |
| `approval:create` | Tạo mới phê duyệt | Đã có xử lý backend |
| `approval:approve` | Phê duyệt phê duyệt | Đã có xử lý backend |
| `approval:reject` | Từ chối phê duyệt | Đã có xử lý backend |
| `approval:manage` | Mở rộng phạm vi xem/xử lý trong service; guard vẫn yêu cầu approval:approve/reject/create cho endpoint tương ứng | Đã có xử lý backend |

### Lương cơ bản/phụ cấp

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `compensation:read` | Xem danh sách và chi tiết lương cơ bản/phụ cấp | Đã có xử lý backend |
| `compensation:create` | Tạo mới lương cơ bản/phụ cấp | Đã có xử lý backend |
| `compensation:update` | Cập nhật lương cơ bản/phụ cấp | Đã có xử lý backend |
| `compensation:manage` | Quản lý theo các thao tác được module cho phép lương cơ bản/phụ cấp | Đã có xử lý backend |

### Kỳ lương

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `payroll:read` | Xem danh sách và chi tiết kỳ lương | Đã có xử lý backend |
| `payroll:create` | Tạo mới kỳ lương | Đã có xử lý backend |
| `payroll:calculate` | Tính lại bảng lương kỳ lương | Đã có xử lý backend |
| `payroll:approve` | Phê duyệt kỳ lương | Đã có xử lý backend |
| `payroll:finalize` | Chốt bảng lương kỳ lương | Đã có xử lý backend |
| `payroll:manage` | Quản lý theo các thao tác được module cho phép kỳ lương | Đã có xử lý backend |

### Đánh giá hiệu suất

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `performance:read` | Xem danh sách và chi tiết đánh giá hiệu suất | Đã có xử lý backend |
| `performance:create` | Tạo mới đánh giá hiệu suất | Đã có xử lý backend |
| `performance:update` | Cập nhật đánh giá hiệu suất | Đã có xử lý backend |
| `performance:review` | Chấm điểm/nhận xét hiệu suất đánh giá hiệu suất | Đã có xử lý backend |
| `performance:manage` | Quản lý theo các thao tác được module cho phép đánh giá hiệu suất | Đã có xử lý backend |

### Mục tiêu

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `goal:read` | Xem danh sách và chi tiết mục tiêu | Đã có xử lý backend |
| `goal:create` | Tạo mới mục tiêu | Đã có xử lý backend |
| `goal:update` | Cập nhật mục tiêu | Đã có xử lý backend |
| `goal:manage` | Quản lý theo các thao tác được module cho phép mục tiêu | Đã có xử lý backend |

### KPI

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `kpi:read` | Xem danh sách và chi tiết kpi | Đã có xử lý backend |
| `kpi:update` | Cập nhật kpi | Đã có xử lý backend |
| `kpi:manage` | Quản lý theo các thao tác được module cho phép kpi | Đã có xử lý backend |

### Hồ sơ nhân viên

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `document:read` | Xem hồ sơ NORMAL toàn tổ chức và thông tin tuân thủ; tải NORMAL cũng được service hiện tại chấp nhận | Đã có xử lý backend |
| `document:create` | Tạo mới hồ sơ nhân viên | Đã có xử lý backend |
| `document:update` | Cập nhật hồ sơ nhân viên | Đã có xử lý backend |
| `document:delete` | Xóa hoặc gỡ bỏ theo API hồ sơ nhân viên | Đã có xử lý backend |
| `document:download` | Tải bản hiện tại hoặc phiên bản hồ sơ; hồ sơ SENSITIVE của người khác vẫn cần document:sensitive:read | Đã có xử lý backend |
| `document:sensitive:read` | Xem hồ sơ nhạy cảm của người khác, kết hợp quyền đọc/tải tương ứng hồ sơ nhân viên | Đã có xử lý backend |
| `document:manage` | Quản lý yêu cầu hồ sơ và cấu hình tuân thủ; không tự thay thế document:create/update/delete hoặc sensitive:read | Đã có xử lý backend |

### Tự động hóa

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `automation:read` | Xem danh sách và chi tiết tự động hóa | Đã có xử lý backend |
| `automation:create` | Tạo mới tự động hóa | Đã có xử lý backend |
| `automation:update` | Cập nhật tự động hóa | Đã có xử lý backend |
| `automation:delete` | Xóa hoặc gỡ bỏ theo API tự động hóa | Đã có xử lý backend |
| `automation:manage` | Quản lý quy tắc theo fallback hiện có và chạy quét thủ công; xem lịch sử execution vẫn cần automation:read | Đã có xử lý backend |

### Quy trình

| Quyền | Cho phép làm gì | Trạng thái |
| --- | --- | --- |
| `workflow:read` | Xem danh sách và chi tiết quy trình | Đã có xử lý backend |
| `workflow:create` | Tạo mới quy trình | Đã có xử lý backend |
| `workflow:update` | Cập nhật quy trình | Đã có xử lý backend |
| `workflow:cancel` | Hủy quy trình | Đã có xử lý backend |
| `workflow:manage` | Thực hiện các quyền workflow theo fallback service hiện có, trong tổ chức ACTIVE | Đã có xử lý backend |

## Điều kiện cần hiểu thêm

| Nghiệp vụ | Giới hạn thực tế |
| --- | --- |
| Nhân sự | employee:update không cấp quyền sửa lương, hồ sơ, KPI hoặc phân ca. Những thẻ này cần quyền riêng. |
| Nghỉ phép | Tạo/hủy đơn của mình cần hồ sơ nhân viên liên kết. Hủy đơn người khác phải qua cả leave:create ở guard và leave:approve hoặc leave:cancel ở service. Duyệt/từ chối không cho tự duyệt. |
| Phê duyệt | approval:approve/reject ở guard kết hợp quyền xử lý loại đơn ở service. payroll:approve một mình không mở được endpoint phê duyệt chung. approval:manage không thay guard. |
| Chấm công | attendance:read xem dữ liệu của mình; phạm vi quản lý cần attendance:manage. Check-in/out cần quyền riêng, nhân viên ACTIVE, ca hợp lệ, GPS mới/đủ chính xác trong 100 m. |
| Tiền lương | compensation:* xử lý cấu hình lương; payroll:* xử lý kỳ/bảng lương. Tính, duyệt, chốt là thao tác riêng và có thứ tự trạng thái. Chốt không được coi như nút sửa thông thường. |
| Hồ sơ | Chủ hồ sơ ACTIVE có lối self-service đọc/tạo/thêm phiên bản/tải của mình theo service. Quyền sửa metadata/archive/restore là document:update, xóa là document:delete. Hồ sơ người khác SENSITIVE cần sensitive:read ngoài quyền thao tác. |
| Tuân thủ | Số tổng hợp vẫn theo quyền document:read; nội dung hồ sơ nhạy cảm bị loại khỏi các response chi tiết nếu không được phép. |
| File | file:upload không tự cấp file:read; file:delete là xóa mềm theo API. File của tổ chức khác không được dùng để tạo liên kết. |
| Công việc | Bình luận, đính kèm, checklist, phụ thuộc, người kiểm tra có các tổ hợp quyền đọc/cập nhật/gán theo endpoint. Công việc DONE/CANCELLED có thể khóa thao tác. |
| Quy trình | workflow:manage là fallback được thiết kế trong service; không phải quyền quản trị toàn hệ thống. Không khởi chạy bằng ID nghiệp vụ giả. |
| Tự động hóa | Quản lý quy tắc không có nghĩa được đọc lịch sử nếu thiếu automation:read. Chạy thủ công cần automation:manage. Scheduler hệ thống không nhận quyền từ body client. |
| HTTP | Thiếu/không hợp lệ session: 401. Thiếu quyền hoặc membership không hợp lệ: 403. Tài nguyên không có trong phạm vi được phép có thể 404; trạng thái xung đột có thể 409; input sai 400. |

## Vai trò nên phân công thế nào?

Tên vai trò là nhãn do tổ chức quản lý; không tự sinh/gán những nhóm dưới đây trong database. Khi cấp thực tế phải chọn permission key phù hợp:

| Nhóm công việc | Chức năng dự kiến |
| --- | --- |
| Thành viên/nhân viên | Lịch và thông báo của mình; thêm quyền task/attendance/leave cần thiết cho công việc. Không mặc định đọc lương hoặc hồ sơ toàn tổ chức. |
| Quản lý công việc | Đọc/tạo/cập nhật/gán task; quyền đọc nhân sự/phòng ban nếu cần chọn người và bộ phận. Không tự có quyền payroll/document nhạy cảm. |
| Nhân sự | employee/department, ca/phân ca/nghỉ phép và hồ sơ theo chức trách; nhạy cảm phải cấp riêng. |
| Kế toán | compensation/payroll/report theo bước tạo, tính, duyệt, chốt được giao; không cần cấp role:assign để làm bảng lương. |
| Người kiểm tra | Các quyền read/report/audit cần thiết; không thêm create/update/delete nếu chỉ kiểm tra. |
| Quản trị quyền | role:read để xem và role:assign để gán/gỡ vai trò hiện có; không suy ra CRUD vai trò từ những key chưa có API. |

Không có lời hứa mọi vai trò mang các tên trên đều có sẵn hoặc đã được cấu hình trong database đang chạy.
