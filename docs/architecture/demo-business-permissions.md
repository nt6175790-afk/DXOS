# Phân quyền nghiệp vụ của tài khoản demo

Ma trận này thay thế các role `demo-employee`/`demo-manager` và role HR rộng trong bản thiết kế AI ban đầu. Backend vẫn dùng JWT, membership ACTIVE, role ACTIVE và permission catalog hiện có trong từng tổ chức. Không suy quyền từ chức danh/phòng ban và không có bypass theo tên Administrator.

| Tài khoản | Vai trò | Số quyền | Chức năng riêng |
| --- | --- | --- | --- |
| an.demo@dxos.local | Nhân viên kinh doanh | 13 | Tạo sự kiện và tải file lên |
| minh-anh.demo@dxos.local | Nhân viên kỹ thuật | 13 | Tải file lên, dùng AI trong phạm vi quyền hiện có |
| hoang-nam.demo@dxos.local | Nhân viên kho vận | 12 | Tải file lên |
| thu-ha.demo@dxos.local | Chuyên viên nhân sự | 32 | Xem/tạo/sửa hồ sơ nhân viên và tài liệu thường; quản lý chấm công, ca/lịch làm; duyệt nghỉ phép; xem/xuất báo cáo được phép; xem role/member, không gán quyền |
| admin.demo@dxos.local | Administrator | Catalog hiện tại (91) | Giữ nguyên bộ quyền đã có; mọi thao tác vẫn đi qua AuthorizationService |

## Quyền chung của bốn tài khoản nhân viên

11 key: `organization:read`, `department:read`, `task:read`, `task:create`, `calendar:read`, `attendance:read`, `attendance:check-in`, `attendance:check-out`, `leave:read`, `leave:create`, `file:read`.

`task:read` xem công việc toàn tổ chức, không chỉ việc được giao. `task:create` tạo việc chưa gán người khi không có `task:assign`. Không được sửa công việc toàn tổ chức hoặc đổi người thực hiện. Chấm công vẫn là của bản thân, cần ca và vị trí hợp lệ; nghỉ phép xem/tạo của mình trừ khi có quyền duyệt. Thông báo và lịch cá nhân giữ cơ chế tự phục vụ hiện có. File thường là tài nguyên chia sẻ trong tổ chức, không tự bị giới hạn theo phòng ban.

HR có thêm: `file:upload`, `employee:read/create/update`, `role:read`, `document:read/create/update/download/manage`, `attendance:manage`, `shift:read/create/update`, `schedule:read/create/update/manage`, `leave:approve`, `report:read/export`. Các nhóm viết gọn ở đây tương ứng từng key riêng trong catalog.

## Không được tự cấp

Cả bốn không có `task:update`, `task:assign`, `role:assign`, quyền CRUD role, `organization:update`, `file:delete`, `document:delete`, `document:sensitive:read`, quyền payroll/compensation, `approval:approve/reject/manage`, `workflow:manage`, `automation:manage`, `audit:read`. HR không có `ai:use`; quyền đó chỉ có ở kỹ thuật và admin. Không cấp quyền mới chỉ để bộ đánh giá AI chạy được.

Trong ApprovalService hiện tại, `approval:approve/reject` là quyền phê duyệt chung, có thể tác động cả payroll. Vì vậy nghiệp vụ HR sử dụng `leave:approve` và `attendance:manage`, không gán quyền phê duyệt chung thay thế.

## Provisioning và xử lý xung đột

Native: chạy `seed:demo-admin`, `seed:demo`, sau đó `seed:demo-roles` với cấu hình local riêng. Docker demo: bootstrap thực hiện các bước này trong database/volume cô lập; backend production thông thường không gọi seed. Mật khẩu giữ trong local env, không ghi trong tài liệu/Git.

Seed role chạy transaction Serializable, kiểm quyền active admin và catalog đã tồn tại, ghi audit cho role/grant/assignment. Role/grant/assignment đã khớp thì giữ nguyên. Role bị chỉnh sửa, inactive hoặc thành viên có role khác làm seed dừng và rollback; không tự xóa quyền của người vận hành và không cộng dồn role cũ. Với lỗi `EXISTING_DEMO_ROLE_POLICY_CONFLICT` / `EXISTING_DEMO_ASSIGNMENT_CONFLICT`, quản trị viên phải kiểm tra permission catalog/effective permissions và quyết định gỡ role cũ qua cơ chế quản trị có audit trước khi seed lại. Không bỏ guard hay reset database.

`demo:refresh` vẫn chỉ bổ sung dataset/lịch thiếu, không thay quyền hoặc mật khẩu. Các kết quả AI eval của ma trận cũ là lịch sử, không đại diện cho ma trận này. Runner MySQL disposable kiểm tra riêng ma trận, các quyền bị cấm, canary tổ chức khác và tính idempotent; không sửa dữ liệu `dx_os` đang dùng.
