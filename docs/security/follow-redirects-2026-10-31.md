# Bản vá dependency follow-redirects ngày 31/10/2026

Ngày 30/10/2026 (UTC), GitHub công bố advisory [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) mức HIGH cho follow-redirects 1.16.0 đến 1.16.1: mảng `sensitiveHeaders` tạo ở realm khác bị bỏ qua, nên header xác thực tùy chỉnh có thể đi theo redirect sang origin khác. Bản vá là 1.16.2. Lượt CI đầu tiên trên main sau thời điểm công bố dừng ở hai gate: `npm audit --omit=dev --audit-level=high` của frontend và Trivy quét source. Mã nguồn không đổi; cảnh báo mới là do cơ sở dữ liệu lỗ hổng được cập nhật.

Phạm vi sửa: nâng riêng lock entry follow-redirects trong `frontend/package-lock.json` từ 1.16.1 lên 1.16.2 theo range của Axios 1.20.0 (`npm update follow-redirects`). Không nâng Axios, không thêm direct dependency hay override, không đổi UI, auth, API contract, schema hay migration. Lockfile root không chứa follow-redirects bị ảnh hưởng.

Tarball npm 1.16.2 khớp SHA-512 trong lockfile. LICENSE trong tarball có SHA-256 `bfa8a54bb952ccda79f0f1889721d108f5b605babbb2b8a3705ffb52f4132eb7`, trùng nguyên byte với text MIT đang lưu, nên `licenses/npm-inventory.json` và `licenses/NPM-NOTICES.md` chỉ đổi số version; không thêm hay sửa text giấy phép.

Kiểm tra local trên revision vá: `npm audit --omit=dev --audit-level=high` của frontend báo 0 lỗ hổng; `backend/scripts/redirect-dependency-security.test.js` (3 case loại header nhạy cảm khi redirect chéo origin) PASS; frontend `npm ci`, lint, test và build theo đúng lệnh CI. Kết quả cuối cùng là lượt CI của commit trên main, không ghi trước PASS.

Như bản vá ngày 21/10 ([follow-redirects-2026-10-21.md](follow-redirects-2026-10-21.md)), đây là lỗi thư viện redirect trong môi trường Node; không suy diễn rằng adapter trình duyệt của DX-OS đã bị khai thác. Các tag đã phát hành giữ nguyên; dựng lại từ revision đã vá và đã qua CI.
