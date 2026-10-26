# Quy trình nhánh, Pull Request và phát hành

GitHub dùng tên **Pull Request (PR)**; thao tác tương ứng trên GitLab gọi là Merge Request (MR). DX-OS hiện đặt trên GitHub, nên dùng PR vào main, không tạo thêm repository GitLab hoặc nhầm Dependabot PR với release review.

1. Tạo nhánh release/v0.3.0-readiness từ main sạch. Commit riêng phần setup hạ tầng, rà soát bảo mật, bằng chứng và docs. Không commit .env, dữ liệu thật, API key hoặc log chứa token.
2. Mở PR vào main với mục tiêu, phạm vi, validation thực tế và giới hạn. Người chấm có thể xem diff, commit và CI. Không tuyên bố đã có người khác review nếu chỉ có self-review/CI.
3. Yêu cầu ba job đạt trên đúng revision: verify (full backend/frontend, Prisma/build/lint/audit/legal), scan (source/runtime vulnerability/misconfiguration và SBOM), source-demo (git archive → build → fresh DB/seed/login/tenant test). Thất bại phải xử lý, không dùng continue-on-error để phát hành.
4. Sau merge, kiểm tra CI trên main. Tạo **annotated tag v0.3.0** trỏ đúng commit main, thông điệp ghi phạm vi local/demo. Không force-update tag đã public. Tag cũng kích hoạt cùng bộ CI.
5. Sau CI của tag đạt, chạy node backend/scripts/package-release.js v0.3.0 từ checkout sạch. Công cụ đóng gói git archive, kiểm tra đường dẫn private, module work/migration/lockfiles và tạo source zip và tar.gz, manifest SHA/lockfile hashes, SHA256SUMS.txt trong outputs/releases/v0.3.0 (ignored).
6. Tạo GitHub Release v0.3.0, mô tả source SHA, link PR/CI, lệnh dựng và known limitations; đính kèm archive ZIP/TAR.GZ, manifest và SHA256SUMS. Đối chiếu asset checksum sau tải lại trước bàn giao. Không upload image volume, env hay database.

Release không gắn với main đang thay đổi. Người dùng clone --branch v0.3.0 hoặc tải source archive của tag; manifest ghi commit đầy đủ. Người giữ repository tự chịu trách nhiệm quyền sửa/xóa tag; tag không được giả là chữ ký số nếu chưa ký bằng key tin cậy. Không thay lịch sử để che các commit sửa lỗi.

Nếu tìm thấy lỗi sau release, tạo nhánh fix/..., PR và phát hành patch version mới. Giữ nguyên tag/asset cũ để người dùng tái lập; công khai vấn đề security theo SECURITY.md và ngừng khuyến nghị release có rủi ro chưa xử lý.
