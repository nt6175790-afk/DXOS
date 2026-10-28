# Permission provisioning — DXOS-PERMISSION-001

The permission provisioning API manages existing organization memberships and roles. It never creates an implicit administrator and never accepts client supplied permissions. All routes require a valid Bearer session and an active membership in the route organization.

`GET /api/v1/organizations/{organizationId}/roles` requires `role:read` and returns a tenant-scoped keyset page of safe role metadata: `id`, `key`, `name` and `isActive`. Both active and inactive defined roles are returned so operators can distinguish lifecycle state; permission assignments and internal database fields are excluded. Results are ordered by role UUID ascending, with `limit` (1–100, default 25) and an optional `after` UUID cursor.

`GET /api/v1/organizations/{organizationId}/members` requires `role:read` and returns a tenant-scoped page of safe user, membership, employee and role summary fields. Password hashes, sessions, tokens, permission joins and storage secrets are excluded.

`POST /api/v1/organizations/{organizationId}/members/{membershipId}/roles` requires `role:assign` and a strict `{roleId}` body. The target and role must belong to the same organization and be active. An actor cannot assign a role to themself, and every permission on the role must already be effective for the actor. Assignment and `rbac.role.assigned` audit recording commit atomically.

`DELETE /api/v1/organizations/{organizationId}/members/{membershipId}/roles/{roleId}` uses the same actor permission and tenant checks. Self mutation is denied. Revocation and `rbac.role.revoked` audit recording commit atomically; revoking an absent assignment is an idempotent no-op.

Invalid or missing credentials return 401. An authenticated caller without the required grant, an inactive route organization, or a foreign route context returns 403. Missing same-tenant members or roles return 404; inactive targets and roles return 409. Unknown body/query fields and malformed UUIDs return 400. Authorization, target lookup, privilege-ceiling checks and uniqueness checks are repeated inside a serializable transaction.

Role discovery is a collection read and does not accept a role ID filter; therefore it does not return 404 for a missing role. Invalid or foreign organization context remains 403, while malformed pagination input is 400. A foreign role cannot appear in, or be used to select, the returned catalog.

## Quản trị tài khoản và vòng đời vai trò

Các API dưới đây dùng JWT, thành viên ACTIVE, tổ chức ACTIVE và permission rõ ràng; không thay đổi các quyền đã cấp cho tài khoản demo.

| API trong `/api/v1/organizations/{organizationId}` | Quyền | Dữ liệu / hành vi |
| --- | --- | --- |
| GET `/users`, GET `/users/{userId}` | user:read | id, email, displayName, accountStatus, membershipId, membershipStatus |
| POST `/users` | user:create | email, displayName, password write-only 16–128 ký tự; Argon2id; tạo membership, không tự gán role |
| PATCH `/users/{userId}` | user:update | displayName và/hoặc membershipStatus ACTIVE/INACTIVE/SUSPENDED |
| DELETE `/users/{userId}` | user:delete | REMOVED membership và gỡ role trong tổ chức; giữ user toàn cục và tổ chức khác |
| GET `/roles/permission-catalog` | role:read | `{items:[{key}]}` từ catalog có sẵn; không cấp quyền |
| GET `/roles/{roleId}` | role:read | id, key, name, isActive, permissionKeys |
| POST `/roles` | role:create | key, name, permissionKeys (có thể là mảng rỗng); không tự gán role |
| PATCH `/roles/{roleId}` | role:update | name, isActive, permissionKeys; key bất biến |
| DELETE `/roles/{roleId}` | role:delete | Chỉ role chưa được gán; role đang dùng trả 409 |

Danh sách users dùng `limit` 1–100 mặc định 25, `after` UUID user; `{items,nextCursor}` tăng dần theo user UUID. Không dùng offset. Cursor ngoài tenant bị 400. Danh sách role cũ giữ nguyên hợp đồng.

Không cho tự sửa/xóa tài khoản qua API quản trị hay sửa role đang gán cho chính mình. Không deactivate role đang được gán. Đổi permissionKeys cần thêm role:assign và mọi key mới phải nằm trong quyền hiệu lực của người thao tác; unknown key bị 400. Không tạo cơ chế superadmin theo tên role. Email tồn tại trả 409 chung, không tiết lộ tenant; không tự liên kết identity bằng email đoán. Đổi tên toàn cục của user đã có membership ở tenant khác bị 409; trạng thái membership vẫn chỉ ảnh hưởng tenant hiện tại. Không có reset password/email hoặc xóa user toàn cục qua các API này.

401 khi thiếu/sai session; 403 nếu thiếu quyền/inactive/foreign context hoặc tự thao tác bị cấm; 404 cho user/role không thuộc tenant sau khi đã được phân quyền; 409 cho xung đột vòng đời/unique/transaction. Mutation và audit commit cùng transaction Serializable. Không audit read catalog thành công. Không trả password/hash, session, JWT, refresh token hay storage secret.

### PATCH null validation — 28/10/2026

Optional fields in user and role PATCH requests distinguish omission from null. `displayName`, `membershipStatus`, `name`, `isActive` and `permissionKeys` are non-nullable: explicit null returns 400 before a write. Omitted fields remain unchanged; a permitted `permissionKeys: []` still clears grants under the existing privilege-ceiling/self-role rules. No new grants or administrator bypass.
