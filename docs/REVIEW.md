# Quy trình review và duyệt

Áp dụng cho mọi task. Mỗi task là một nhánh `task/<ID>-<slug>` và một pull request vào `main`.

## Vòng làm việc

1. **Người code mở task.** Kiểm phụ thuộc đã merge. Nếu task nằm trong `docs/tasks/BACKLOG.md`, việc đầu tiên trên nhánh là tách nó thành phiếu riêng theo mẫu các phiếu T01–T06, không đổi phạm vi.
2. **Người code làm**, chạy mọi lệnh trong "Tiêu chí chấp nhận" và `scripts/check.sh`, rồi trong cùng PR:
   - điền mục "Bàn giao" của phiếu;
   - cập nhật `docs/ROADMAP.md` (trạng thái task) và `docs/STATUS.md`;
   - nếu task trả lời một mục **[cần kiểm]** hoặc một quyết định D: cập nhật `ARCHITECTURE.md`, `REFERENCE.md` và viết `docs/decisions/D<n>.md` (bối cảnh, lựa chọn, quyết định, hệ quả, bằng chứng).
3. **Người review kiểm** theo danh sách dưới đây và đăng kết luận trên PR: approve hoặc request changes.
4. Request changes: người code sửa trên cùng nhánh, báo lại những gì đã sửa, quay lại bước 3. Approve chỉ có giá trị cho đúng commit đã xem.
5. Approve: người code cập nhật nhánh với `main`, chạy lại `scripts/check.sh`, merge (squash), rồi chạy `scripts/check.sh` trên `main`.

Người review không merge, không push, không sửa file của dự án.

## Danh sách kiểm

**Phạm vi**
- [ ] Diff chỉ đụng các file mà phiếu cho phép ở mục "Sở hữu", cộng các file tài liệu nêu ở bước 2.
- [ ] Không có thay đổi ngoài mục tiêu của phiếu. Phiếu tách từ BACKLOG không đổi phạm vi so với BACKLOG.

**Đúng với phiếu**
- [ ] Từng tiêu chí chấp nhận: tự chạy lệnh trong một worktree riêng của nhánh PR, ghi kết quả. Không chép kết quả từ "Bàn giao". Lệnh nào quá nặng để chạy lại thì ghi rõ là chưa chạy lại và vì sao.
- [ ] Test tồn tại cho cả chiều được phép và chiều bị cấm.
- [ ] Test có thể thất bại: với ít nhất một test của phần lõi, đảo một điều kiện trong code (trong worktree) xem test có đỏ không. Hoàn nguyên sau khi thử.

**Đúng với kiến trúc**
- [ ] Tên hàm, lỗi, sự kiện, định dạng thông điệp khớp `docs/ARCHITECTURE.md`. Lệch thì hoặc sửa code, hoặc PR phải cập nhật ARCHITECTURE kèm lý do.
- [ ] Địa chỉ, chain id, ABI lấy từ `packages/shared/`, không chép rải rác.

**Riêng cho code đụng tới tiền hoặc quyền** (T02, T04, T05, T06, T07, T10, T12, T13, T14)
- [ ] Mọi đường làm số dư agent giảm đều đi qua quy tắc, hoặc được nêu rõ là ngoài phạm vi.
- [ ] Chống phát lại: nonce, chain id, và địa chỉ agent có trong mọi thông điệp được ký.
- [ ] Số học: không tràn, không số thực, đơn vị wei nhất quán.
- [ ] Với Go trong đường đồng thuận: không dùng thời gian hệ thống, số ngẫu nhiên, thứ tự duyệt map, hay bất kỳ thứ gì khiến hai node cho kết quả khác nhau.
- [ ] Đường chỉ đọc (txpool) không ghi trạng thái.

**Tài liệu trong PR**
- [ ] Trạng thái trong ROADMAP và nội dung STATUS khớp với thực tế của PR.
- [ ] Mỗi mục **[cần kiểm]** được bỏ dấu, và mỗi quyết định D được ghi, đều có bằng chứng kiểm lại được (đường dẫn file và số dòng, lệnh và kết quả, hash giao dịch).
- [ ] Kết quả kiểm chỉ dùng `PASS`, `FAIL`, `NOT RUN` (kèm lý do), `N/A`.

**Vệ sinh**
- [ ] Không có secret trong diff. Không có `.env`.
- [ ] Không có câu nào nhắc tới việc dùng AI trong code, comment, tài liệu, thông điệp commit, nội dung PR.
- [ ] Không có câu nói quá trong README, giao diện, comment (xem "Không được nói" trong PROJECT).
- [ ] `git ls-files` không chứa file nào thuộc mục "Chỉ dùng trên máy" của `.gitignore`.
- [ ] `scripts/check.sh` xanh trên nhánh.

## Không approve, và báo chủ dự án
- PR đề xuất lùi bậc, cắt hoặc đổi phạm vi.
- Một quyết định trong bảng "Quyết định đắt nếu đổi" có kết quả "không được".
- Task vượt ngày mục tiêu hơn một ngày.
- Hai vòng request changes về cùng một điểm mà chưa thống nhất.

Các trường hợp này do chủ dự án quyết định.
