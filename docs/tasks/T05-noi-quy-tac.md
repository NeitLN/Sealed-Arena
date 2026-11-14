# T05: Nối quy tắc hợp lệ với AgentPolicy
Mốc: M1 · Ngày mục tiêu: 18/11 · Nhánh: `task/T05-noi-quy-tac` · Phụ thuộc: T02 và T04 (chặn bắt đầu), quyết định D1 đã chốt "được" · Mức: Full
Kết quả task này quyết định **D2** (giữ bậc 1 hay lùi bậc 2).

## Mục tiêu
Thay quy tắc viết cứng của T02 bằng quy tắc thật đọc uỷ quyền từ AgentPolicy, đúng bảy điều kiện ở `docs/ARCHITECTURE.md` mục 3.1, có bộ đếm ngân sách ngày và `totalCharged`.

## Sở hữu
- `chain/patches/0003-agent-rule.patch` (thay thế `0001-spike-agent-rule.patch`; xoá file 0001)
- Test Go của quy tắc trong cây avalanchego (nằm trong bản vá)
- `chain/tests/rule/` (script kiểm trên mạng local)

## Việc phải làm
1. Một hàm duy nhất `CheckAgentTx(state, rules/time, from, to, value, gasLimit, gasFeeCap) error` dùng chung cho cả `preCheck` và txpool, để hai nơi không thể lệch nhau.
2. `preCheck`: gọi `CheckAgentTx`; nếu qua thì gọi `ChargeSpend`. Thứ tự so với việc trừ tiền gas phải được lập luận rõ trong "Bàn giao": bộ đếm phải được ghi cả khi giao dịch sau đó revert lúc thực thi.
3. Txpool: gọi `CheckAgentTx` ở chế độ chỉ đọc. Không ghi gì.
4. Với giao dịch loại 1559: `gasFeeCap` là mức trần. Với giao dịch legacy: dùng `gasPrice`. Mọi loại giao dịch khác mà chain chấp nhận phải được xử lý tường minh hoặc từ chối cho agent.
5. Lỗi riêng cho từng điều kiện, tên đúng như ARCHITECTURE 3.1.
6. Điều kiện bật: precompile AgentPolicy đã kích hoạt tại thời điểm block. Trước thời điểm đó hành vi phải y như bản gốc.

## Tiêu chí chấp nhận
Mỗi dòng là ít nhất một test Go ở mức `core` (dựng block thật trên chain thử):
- [ ] Agent đã đăng ký, chưa có uỷ quyền: mọi giao dịch bị từ chối.
- [ ] Trong uỷ quyền, tới người nhận hợp lệ: vào block; `spentToday` và `totalCharged` tăng đúng bằng `value + gasLimit × gasFeeCap`.
- [ ] Từng điều kiện 1–7 có một test bị từ chối với đúng lỗi, và một test ngay sát ranh giới được chấp nhận (ví dụ `charge == perTxCap` qua, `charge == perTxCap + 1` bị loại).
- [ ] Người nhận có code: bị từ chối, kể cả khi địa chỉ đó nằm trong danh sách.
- [ ] Giao dịch được chấp nhận nhưng revert lúc thực thi (hết gas): bộ đếm vẫn tăng.
- [ ] Sang ngày mới (đẩy thời gian block): ngân sách ngày được đặt lại; `totalCharged` không đặt lại.
- [ ] `freeze` ở block N: mọi giao dịch của agent từ block N+1 bị từ chối. `unfreeze` thì chạy lại.
- [ ] Hết hạn: bị từ chối đúng từ block có `timestamp ≥ expiry`.
- [ ] **Đồng thời:** 20 giao dịch hợp lệ từng cái một, tổng vượt ngân sách ngày, cùng nằm trong pool. Sau khi dựng block: tổng `charge` của các giao dịch vào block ≤ `dailyCap`; các giao dịch còn lại không vào block nào; block vẫn hợp lệ.
- [ ] Một block dựng bằng tay chứa giao dịch vượt ngân sách: bị từ chối khi kiểm tra block.
- [ ] Bất biến: sau mọi kịch bản trên, `balance(agent) ≥ số dư ban đầu − totalCharged(agent)`.
- [ ] Địa chỉ không phải agent: hành vi không đổi so với bản gốc (chạy lại một phần bộ test có sẵn của `core` và `txpool` liên quan, không có test nào đang xanh chuyển đỏ).
- [ ] Trên mạng local một node: `chain/tests/rule/run.sh` lặp lại các kịch bản chính qua RPC → `PASS`.
- [ ] `bash scripts/check.sh` → `PASS`.

## Phải trả lời trong "Bàn giao"
- Có đường nào làm số dư coin gốc của một ví thường giảm mà không qua `preCheck` không (ví dụ lệnh tự huỷ của contract khác, precompile NativeMinter, phí). Liệt kê và nêu vì sao mỗi đường không áp dụng cho agent, hoặc đã được chặn.
- Chi phí thêm cho mỗi giao dịch (số lần đọc trạng thái) và ảnh hưởng tới giao dịch không phải của agent.

## Ngoài phạm vi
Genesis và mạng nhiều node (T06). Bất kỳ thay đổi nào ngoài hai điểm chèn và precompile.

## Bàn giao
(người code điền)
