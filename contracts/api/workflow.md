# Workflow API hiện có — làm rõ lifecycle và validation

Prefix `/api/v1/organizations/:organizationId/workflows`. JWT, ACTIVE membership và quyền qua AuthorizationService hiện có. Không cấp thêm quyền hoặc tạo IAM/role thứ hai. `workflow:manage` là quyền bao hàm đã tồn tại, không suy từ tên vai trò.

| Method/path tương đối | Quyền | Thành công |
| --- | --- | --- |
| GET `/definitions` | workflow:read | 200, array definitions; hiện lazily tạo default nếu thiếu |
| GET `/` | workflow:read | 200, array mới nhất theo createdAt giảm; mặc định 50, limit nguyên 1–50, status trong RUNNING/WAITING/COMPLETED/FAILED/CANCELLED |
| GET `/:id` | workflow:read | 200, instance kèm definition và stepExecutions |
| POST `/` | workflow:create | 201, tạo từ workflowDefinitionId UUID v4 ACTIVE, title bắt buộc ≤255, entityType/entityId/data tùy chọn |
| POST `/:id/steps/:stepId/confirm` | workflow:update | 201, xác nhận bước HUMAN_CONFIRMATION hiện tại ở WAITING; comments ≤1000, resultPayload tùy chọn |
| POST `/:id/cancel` | workflow:cancel | 201, chỉ instance RUNNING/WAITING; reason ≤1000 hiện chưa lưu |

Instance có id, organizationId, workflowDefinitionId, title, status, currentStepIndex, ownerUserId, startedAt/completedAt, timestamp, definition/steps khi service trả chúng. Step có trạng thái, thứ tự, người xác nhận và thời gian. Payload config/result/data là chuỗi JSON theo model hiện có. Không đưa credentials hoặc nội dung nhạy cảm vào các payload này. OpenAPI mô tả phần metadata chính, không đổi shape runtime.

401: thiếu/session không hợp lệ. 403: membership/tenant/quyền không đạt. 404: tài nguyên/definition/step không tồn tại trong tenant đã được phép. 400: input, định nghĩa inactive, bước sai trạng thái hoặc instance đã đóng. 409: trạng thái thay đổi đồng thời, client reload trước khi thử lại. Không trả dữ liệu của tenant khác.

Không có cursor/total cho danh sách workflow hiện tại: đây là recent list tối đa 50, không hứa liệt kê toàn bộ lịch sử. Default definitions là catalog tích hợp nhỏ. Không thay API để giả có pagination chưa triển khai.

Audit tạo/xác nhận/hủy/hoàn tất dùng catalog hiện có. ACTION/TASK engine chỉ đánh dấu bước, không thực thi cập nhật nghiệp vụ. Không quảng cáo đã gia hạn hợp đồng hoặc tạo task từ bước đó; action nghiệp vụ của Automation là module khác.

Tương thích: không thay tên route, success status, schema hoặc grant. Invalid list query trước đây có thể gây lỗi Prisma 500 nay bị DTO từ chối 400. Định nghĩa inactive và xác nhận sau hủy/đóng nay bị từ chối; đây là sửa lifecycle, không nới quyền. Test `open-core-workflow.mysql-spec.ts` chạy HTTP + MySQL thật và audit.
