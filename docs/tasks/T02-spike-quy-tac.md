# T02: Spike quy tắc hợp lệ viết cứng
Mốc: M0 · Ngày mục tiêu: 16/11 · Nhánh: `task/T02-spike-quy-tac` · Phụ thuộc: T01 (chặn bắt đầu) · Mức: Full
Trả lời quyết định **D1**. Đây là task quyết định bậc 1 có khả thi không.

## Mục tiêu
Chứng minh bằng test và bằng mạng chạy thật rằng một kiểm tra đặt trong `preCheck` và trong txpool làm cho giao dịch bị cấm **không vào được block nào**, và tìm ra mọi trường hợp điều đó không đúng.

Quy tắc ở task này viết cứng, chưa có precompile: "địa chỉ `SPIKE_AGENT` chỉ được gửi tới địa chỉ `SPIKE_PAYEE`". Hai địa chỉ là hằng số trong bản vá. Bản vá này sẽ bị thay bằng bản thật ở T05.

## Sở hữu
- `chain/patches/0001-spike-agent-rule.patch`
- `chain/scripts/test.sh` (chạy test Go của phần đã vá, trong Docker)
- `chain/scripts/make-patch.sh` (sinh file bản vá từ cây làm việc trong `chain/.work/`)
- `chain/tests/spike/` (script kiểm trên mạng local)
- `docs/decisions/D1.md` (người code viết kèm bằng chứng; người review kiểm; kết quả "không được" thì chủ dự án quyết định)

## Phải kiểm trước khi làm (ghi vào "Bàn giao")
1. Trên **đúng tag `v1.15.3`**: vị trí kiểm TxAllowList trong `core/state_transition.go` (`preCheck`) và `core/txpool/validation.go` (`ValidateTransactionWithState`). Ghi số dòng.
2. Mọi nơi gọi `preCheck` và mọi đường một giao dịch đi vào block: người dựng block (`miner/`), kiểm tra block nhận từ node khác, `eth_call`, `eth_estimateGas`. Lập bảng: đường nào đi qua `preCheck`, đường nào không.
3. Subnet-EVM ở tag này có áp cơ chế thực thi tách khỏi đồng thuận (ACP-194) không. Nếu có: một giao dịch có thể được chấp nhận vào block trước khi thực thi, và khi đó lỗi ở `preCheck` có ý nghĩa gì. Trả lời bằng mã nguồn và tài liệu của tag, không bằng suy đoán.
4. Khi `preCheck` trả lỗi cho một giao dịch trong lúc dựng block, người dựng block làm gì với giao dịch đó (bỏ qua, loại khỏi pool, hay dừng dựng block).
5. Có cơ chế `InvalidateExecution` trong hook của precompile không, và nó khác gì so với lỗi ở `preCheck`.

## Việc phải làm
1. Thêm kiểm tra viết cứng vào cả hai chỗ, ngay sau kiểm TxAllowList. Lỗi trả về là một biến lỗi mới, có tên rõ.
2. Test Go mức đơn vị và mức `core` (dùng bộ dựng chain thử có sẵn trong repo):
   - giao dịch `SPIKE_AGENT → SPIKE_PAYEE`: vào block, thành công;
   - giao dịch `SPIKE_AGENT → địa chỉ khác`: txpool từ chối với đúng lỗi;
   - **một block được dựng bằng tay chứa giao dịch bị cấm: bị từ chối khi kiểm tra block.** Đây là test quan trọng nhất;
   - giao dịch tạo contract từ `SPIKE_AGENT`: bị từ chối;
   - giao dịch từ địa chỉ khác: không bị ảnh hưởng.
3. Trên mạng local (`scripts/localnet.sh up` với image đã vá): script gửi giao dịch bị cấm qua RPC, xác nhận RPC trả lỗi, chờ vài block, xác nhận không có giao dịch đó trong block nào và số dư không đổi.
4. Thử lách: gửi giao dịch bị cấm bằng mọi loại giao dịch mà chain chấp nhận (legacy, 2930, 1559, và loại khác nếu có); gửi với phí cực cao; gửi nhiều bản cùng nonce.
5. Viết `docs/decisions/D1.md`: kết luận "được" hoặc "không được" cho từng câu ở mục "Phải kiểm", kèm đường dẫn file và số dòng làm bằng chứng. Nếu "không được", đề xuất điểm chèn thay thế hoặc khuyến nghị lùi bậc 2.

## Tiêu chí chấp nhận
- [ ] `bash chain/scripts/test.sh` → `PASS`, gồm test "block chứa giao dịch bị cấm bị từ chối".
- [ ] `bash chain/scripts/apply-patches.sh` áp sạch lên cây mã nguồn vừa `fetch` (không xung đột).
- [ ] Script trên mạng local → `PASS` cho mọi loại giao dịch.
- [ ] Bản vá chỉ đụng tối thiểu số file cần; mỗi file bị đụng được liệt kê trong "Bàn giao" kèm lý do.
- [ ] `docs/decisions/D1.md` trả lời đủ năm câu, mỗi câu có bằng chứng.
- [ ] `scripts/check.sh` gọi `chain/scripts/test.sh` và xanh.

## Ngoài phạm vi
Precompile, uỷ quyền, bộ đếm ngân sách, passkey (T04, T05).

## Khi kết quả là "không được"
Không cố sửa cho được bằng cách thay đổi sâu vào đồng thuận. Ghi rõ lý do, đề xuất phương án, dừng. Người review và chủ dự án quyết định D1 và D2.

## Bàn giao
(người code điền)
