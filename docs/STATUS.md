# STATUS
Cập nhật: 15/11/2026. Người code cập nhật trong PR của từng task; người review kiểm.

## Đang ở đâu
- Mốc hiện tại: trước M0. Chưa có dòng code sản phẩm nào.
- Đã có: bộ tài liệu trong `docs/` (PROJECT, ARCHITECTURE, ROADMAP, REVIEW, REFERENCE, phiếu T01–T06, BACKLOG).
- Thư mục chưa phải repo git và repo GitHub chưa tồn tại. Người code tạo cả hai khi khởi động, sau khi chủ dự án xác nhận tên repo và chế độ public/private.
- Còn 6 ngày tới hạn nộp (21/11, 23:59).

## Bằng chứng gần nhất
| Kiểm gì | Kết quả | Ghi chú |
|---|---|---|
| Tag avalanchego mới nhất | `v1.15.3`, phát hành 05/11/2026 | Đọc từ GitHub API ngày 15/11 |
| Vị trí kiểm TxAllowList trong `preCheck` | dòng 254–257 của `graft/subnet-evm/core/state_transition.go` trên `master` | Phải kiểm lại trên đúng tag `v1.15.3` ở T02 |
| Vị trí kiểm TxAllowList trong txpool | dòng 281–284 của `graft/subnet-evm/core/txpool/validation.go` trên `master` | Như trên |
| Build node, chạy mạng, mọi test | `NOT RUN` | Chưa có code |

## Quyết định đang chờ
| Câu hỏi | Việc bị chặn | Phải chốt trước |
|---|---|---|
| D1: lỗi `preCheck` có loại giao dịch khỏi block không | T05 | 16/11 |
| D3: cách dựng L1 local | T06 | 16/11 |
| Các câu hỏi cho chủ dự án trong `docs/PROJECT.md` (VPS, API key LLM, phân vai) | T08, T12 | 17–18/11 |

## Bước tiếp theo
1. Người code: làm **T03** (khung repo), rồi **T01** (build node, mạng local). Hai task này không phụ thuộc nhau; làm T03 trước vì ngắn.
2. Người review: review PR của T03 và T01 theo `docs/REVIEW.md`. Quyết định D3 được ghi trong PR của T01.
3. Người code: làm **T02** (spike quy tắc). Đây là task quyết định bậc 1 có khả thi không.
4. Chủ dự án: bắt đầu H1, H2, H3 trong ROADMAP ngay, vì chúng chặn M2 và M3.

## Bộ kiểm nhanh (chạy đầu mỗi session)
Chưa có. T03 tạo `scripts/check.sh`. Sau T03, lệnh là:
```bash
bash scripts/check.sh
```
Trước khi T03 xong: chỉ `git status` (nếu đã init) và đọc phiếu việc.
