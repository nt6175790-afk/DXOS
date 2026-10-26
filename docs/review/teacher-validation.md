# Kiểm chứng yêu cầu HaUI — 26/10/2026

Phạm vi: bản thay đổi trên PR #26, source được giữ cố định khi chạy bộ kiểm thử cuối. Đây là kết quả development/local và CI, không chứng nhận production hoặc bảo đảm điểm thi.

| Kiểm tra thực thi local | Kết quả |
| --- | --- |
| Targeted workflow HTTP + MySQL thật | 11/11 PASS: human pause/history/audit, 401/403/404, membership, inactive definition, hủy/đóng, query invalid và xác nhận đồng thời |
| Full backend disposable MySQL | 72 suite, 1.502/1.502 PASS, không skip |
| Frontend | 37 file, 325/325 PASS |
| Backend/frontend lint | PASS, zero ESLint warning |
| Backend/frontend build | PASS; Vite còn cảnh báo bundle lớn, không phải chứng nhận tối ưu hiệu năng |
| Script regression | 15/15 PASS: license, không sửa SQL/JSON, demo secret riêng, publication policy, bảo vệ header khi redirect |
| Prisma | generate/validate PASS, version 6.19.3 |
| Migration replay/status/drift | Replay đủ 25 migration MySQL trên database tạm, up to date, không khác schema |
| Database local hiện có | Chỉ status/drift trên dx_os; up to date, không drift; không migrate/reset hoặc đổi dữ liệu |
| Source licenses | Header SPDX cho mã gốc; SQL/JSON/migration lock dùng sidecar, không đổi checksum; không tái cấp phép third-party |
| Publication scan | Không phát hiện đường private/generated, credential đã biết hoặc pattern high-confidence trong phạm vi công cụ; không bảo đảm nhận diện mọi secret |
| Khôi phục security runtime local | OpenBao đã initialized nhưng sealed sau restart; unseal bằng material gốc, không init/đổi key/grant. Native và WAF health 200 |

## Bằng chứng CI và source archive

[PR #26 và checks](https://github.com/nt6175790-afk/DXOS/pull/26), [workflow verification](../../.github/workflows/security.yml). Phải xem SHA/checks của revision cuối trước khi merge/tag; kết quả một revision cũ không tự áp dụng cho commit mới.

CI có ba gate: verify (backend/frontend/Prisma/licenses/audit), scan (source + runtime SBOM/security) và source-demo (git archive chính revision → compile → MySQL sạch → seed → HTTP smoke). AdGuard rebuild riêng không thay thế ba gate này. Không bypass check hoặc hạ severity để có PASS.

Đóng gói bằng package-release.js chỉ chấp nhận checkout sạch và annotated tag, từ git archive, có ZIP và TAR.GZ, manifest SHA commit/lockfile cùng SHA256SUMS. Không đổi tag/asset cũ. Release chỉ tồn tại khi trang Releases thực sự công bố; một changelog hoặc local tag không được gọi là đã phát hành trên GitHub.

## Tính toàn vẹn và giới hạn

- Không sửa catalog hay seed grants nghiệp vụ. An/Minh Anh/Nam không có task:update/task:assign toàn tổ chức; không tự cấp approval/payroll/AI cho vai trò khác.
- Không đổi SQL migration lịch sử, không có migration mới; schema chỉ thêm license comment. Không đổi credentials/ACL hoặc Git history.
- 620 tệp trong diff đầu chỉ thêm license comment, không đổi hành vi. Frontend không đổi UI/chức năng trong đợt này; thay đổi là license và metadata version.
- Lượt full đầu phát hiện fixture workflow để lại notification; đã dọn dữ liệu theo tenant fixture. Lượt cuối 1.502/1.502 mới là kết quả nghiệm thu. Không giấu lượt thất bại hoặc bỏ assertion để làm xanh suite.
- Quy trình demo ACTION/TASK record-only, cloud có quota/mạng, demo Docker mock, chấm công GPS không chống giả mạo tuyệt đối. Xem [đối chiếu](teacher-requirements.md).
- Báo cáo in, slide và trình bày của đội chưa được coi là đã nộp chỉ vì code/tài liệu kỹ thuật đạt. Không tạo lịch sử đóng góp giả.
