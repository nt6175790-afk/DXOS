# Workflow API hiện có — làm rõ lifecycle và validation

Prefix `/api/v1/organizations/:organizationId/workflows`. JWT, ACTIVE membership và quyền qua AuthorizationService hiện có. Không cấp thêm quyền hoặc tạo IAM/role thứ hai. `workflow:manage` là quyền bao hàm đã tồn tại, không suy từ tên vai trò.

| Method/path tương đối | Quyền | Thành công |
| --- | --- | --- |
| GET `/definitions` | workflow:read | 200, array definitions; hiện lazily tạo default nếu thiếu |
| GET `/` | workflow:read | 200, array mới nhất theo createdAt giảm; mặc định 50, limit nguyên 1–50, status trong RUNNING/WAITING/COMPLETED/FAILED/CANCELLED |
| GET `/:id` | workflow:read | 200, instance kèm definition và stepExecutions |
| POST `/` | workflow:create | 201, tạo từ workflowDefinitionId UUID v4 ACTIVE, title bắt buộc ≤255, entityType/entityId/data tùy chọn |
| POST `/:id/steps/:stepId/confirm` | workflow:update | 201, xác nhận bước HUMAN_CONFIRMATION hiện tại ở WAITING; comments ≤1000, resultPayload tùy chọn |
| POST `/:id/cancel` | workflow:cancel | 201, instance RUNNING/WAITING/FAILED; reason ≤1000 được lưu trong cancellation metadata |

Instance có id, organizationId, workflowDefinitionId, title, status, currentStepIndex, ownerUserId, startedAt/completedAt, timestamp, definition/steps khi service trả chúng. Step có trạng thái, thứ tự, người xác nhận và thời gian. Payload config/result/data là chuỗi JSON theo model hiện có. Không đưa credentials hoặc nội dung nhạy cảm vào các payload này. OpenAPI mô tả phần metadata chính, không đổi shape runtime.

401: thiếu/session không hợp lệ. 403: membership/tenant/quyền không đạt. 404: tài nguyên/definition/step không tồn tại trong tenant đã được phép. 400: input, định nghĩa inactive, bước sai trạng thái hoặc instance đã đóng. 409: trạng thái thay đổi đồng thời, client reload trước khi thử lại. Không trả dữ liệu của tenant khác.

Không có cursor/total cho danh sách workflow hiện tại: đây là recent list tối đa 50, không hứa liệt kê toàn bộ lịch sử. Default definitions là catalog tích hợp nhỏ. Không thay API để giả có pagination chưa triển khai.

Audit tạo/xác nhận/hủy/hoàn tất/thất bại/retry dùng catalog hiện có. ACTION/TASK thực thi handler allowlist theo các quy tắc giao dịch ở dưới.

Tương thích: không thay tên route, success status, schema hoặc grant. Invalid list query trước đây có thể gây lỗi Prisma 500 nay bị DTO từ chối 400. Định nghĩa inactive và xác nhận sau hủy/đóng nay bị từ chối; đây là sửa lifecycle, không nới quyền. Test `open-core-workflow.mysql-spec.ts` chạy HTTP + MySQL thật và audit.

## Thao tác nghiệp vụ có xác nhận

`TASK` chạy handler `CREATE_TASK`: DTO CreateTaskDto hiện có; `data.task` chứa title, description, priority, dueAt, departmentId và assigneeEmployeeId (các field tùy chọn). Nếu thiếu task thì dùng tên instance làm title. Cần workflow:create/update/read và quyền task:create; gán nhân viên cần task:assign; mọi reference kiểm tra tenant/ACTIVE bằng service Công việc hiện có. Không tự cấp quyền.

`ACTION` chỉ nhận handler allowlist `RENEW_CONTRACT` hoặc `ACTIVATE_DOCUMENT`. Cần một bước HUMAN_CONFIRMATION đã hoàn tất trong chính instance. Truyền `data.documentId` và `data.newExpiryDate` (YYYY-MM-DD) khi khởi chạy; ngày gia hạn phải hợp lệ, ở tương lai và kéo dài hạn cũ. Chỉ gia hạn LABOR_CONTRACT, dùng service tài liệu hiện có và quyền document:update/sensitive tương ứng. ACTIVATE_DOCUMENT không được làm sống lại hồ sơ đã hết hạn nếu chưa gia hạn. Handler/field lạ bị từ chối, không chạy script/SQL tùy ý.

Tác động task/document, kết quả step và audit nằm trong một transaction Serializable. Thất bại không ghi tác động một phần; instance/step FAILED với mã lỗi an toàn. `POST /workflows/{id}/retry` cần workflow:update/read và quyền nghiệp vụ hiện tại cho tác động chưa thực hiện; nhận FAILED hoặc RUNNING có toàn bộ step đã COMPLETED (phục hồi lỗi ghi hoàn tất/audit). Trường hợp phục hồi chỉ ghi hoàn tất, không chạy lại bước đã commit, không cần quyền task/document để ghi lại kết quả đã có. Khóa instance và kiểm tra trạng thái/quyền trong giao dịch; chỉ ghi một audit hoàn tất. RUNNING còn bước chưa xong, WAITING, CANCELLED và COMPLETED trả 409. Không sửa đầu vào của instance FAILED qua retry: hủy và tạo lại nếu nhập sai. Xác nhận trùng không tạo task trùng. Hủy lưu lý do, không hoàn tác tác động của các bước trước đã commit. Các bước notification vẫn best-effort và ghi đúng sent=true/false khi workflow chạy độc lập; khi nằm trong giao dịch Automation, lỗi notification làm rollback cả batch để tránh kết quả một phần.

Giao diện khởi chạy cho phép chọn hồ sơ từ danh sách được phân quyền, nhập hạn gia hạn hoặc tên công việc; kết quả step có link tới task/document. Không ghi password/secret vào data/resultPayload.
