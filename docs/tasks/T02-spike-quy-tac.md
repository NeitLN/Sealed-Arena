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

### Kết quả "Phải kiểm trước khi làm"
Cả năm câu được trả lời trong `docs/decisions/D1.md`, có file và số dòng trên tag `v1.15.3`. Tóm tắt:
1. Vị trí TxAllowList khớp `master`: `state_transition.go:254–258` (trong `if !msg.SkipAccountChecks`), `txpool/validation.go:281–286`.
2. Mọi đường đưa giao dịch vào block (xác minh block, người dựng block) đi qua `preCheck` với `SkipAccountChecks == false`; `eth_call`/`eth_estimateGas` thì không (không ghi trạng thái).
3. ACP-194 (`vms/saevm`) chỉ dùng cho C-Chain; Subnet-EVM không import.
4. Người dựng block gặp lỗi thì bỏ giao dịch (và các giao dịch sau của cùng người gửi), dựng tiếp.
5. `InvalidateExecution` có, nhưng chỉ hoàn trạng thái; giao dịch vẫn vào block. Không dùng.

### Đã làm
- `chain/patches/0001-spike-agent-rule.patch`. File bị đụng trong `graft/subnet-evm/`:
  - `core/spike_agent_rule.go` (mới): hằng `SpikeAgentAddress`, `SpikePayeeAddress`, lỗi `ErrSpikeAgentPayeeNotAllowed`, hàm `CheckSpikeAgentRule(from, to)`. Để ở gói `core` vì `core/txpool` đã import `core`, nên hai chỗ dùng chung một hàm.
  - `core/state_transition.go` (+5 dòng): gọi quy tắc ngay sau kiểm TxAllowList, trong khối `!SkipAccountChecks`.
  - `core/txpool/validation.go` (+5 dòng): gọi quy tắc ngay sau kiểm TxAllowList.
  - `core/spike_agent_rule_test.go`, `core/txpool/legacypool/spike_agent_rule_test.go` (mới): test.
- `chain/scripts/test.sh`: kiểm `.work` không có sửa đổi ngoài bản vá, fetch sạch, áp bản vá, chạy `go test -run Spike` trong `golang:1.26.10-bookworm` với volume cache module và cache biên dịch. `SEALED_TEST_NO_FETCH=1` để test cây đang sửa; `SEALED_TEST_RUN=<mẫu>` để đổi mẫu test. `scripts/check.sh` tự gọi nó (bước chain-test).
- `chain/scripts/make-patch.sh`: ghi toàn bộ diff của `.work` so với commit upstream vào một file bản vá; `--check` để biết bản vá có khớp cây không.
- `chain/tests/spike/run.sh`: kiểm trên mạng local đã vá (mô tả ở đầu file).

### Kết quả kiểm
Môi trường: Windows 11, Git Bash, Docker 29.5.3, Go 1.26.10 trong Docker, ngày 15/11/2026, nhánh `task/T02-spike-quy-tac`.

| Tiêu chí | Lệnh | Kết quả |
|---|---|---|
| Test Go, gồm "block chứa giao dịch bị cấm bị từ chối" | `bash chain/scripts/test.sh` | `PASS` (`TestSpikeAgentBlockWithForbiddenTxIsRejected`: 3 loại × 2 kiểu; `TestSpikeAgentForbiddenTxAfterAllowedTxRejectsBlock`; chiều được phép; người gửi khác; txpool local và remote, kể cả phí rất cao) |
| Test có thể đỏ | chỉ có hàm quy tắc, chưa nối | `FAIL` đúng các test block và txpool, test chiều được phép vẫn `PASS` (đã thấy trước khi nối) |
| Không hồi quy | `SEALED_TEST_NO_FETCH=1 SEALED_TEST_RUN=. bash chain/scripts/test.sh` | `PASS` toàn bộ `./core/` (46 giây) và `./core/txpool/legacypool/` (14 giây) |
| Bản vá áp sạch | `bash chain/scripts/fetch.sh` (gọi `apply-patches.sh` trên cây vừa clone) | `PASS` |
| Script mạng local, mọi loại giao dịch | `bash chain/scripts/build.sh && bash scripts/localnet.sh up && bash chain/tests/spike/run.sh` | `PASS` (chi tiết trong D1) |
| Script mạng local có thể đỏ | cùng script trên image build không có bản vá | `FAIL`, 14 lỗi |
| Bản vá tối thiểu | xem danh sách file ở trên | 3 file nguồn (1 mới, 2 sửa +5 dòng mỗi file), 2 file test |
| `scripts/check.sh` gọi `chain/scripts/test.sh` và xanh | `bash scripts/check.sh` | ghi trong PR |

### Ghi chú, việc phát hiện thêm (không làm trong task này)
- Loại giao dịch: blob (EIP-4844) không dựng được với chain này; EIP-7702 bị RPC từ chối vì sai định dạng (`typed transaction too short`), không phải vì quy tắc. Cả hai không vào block. ARCHITECTURE đã ghi không bật EIP-7702.
- `cast publish` mặc định chờ receipt; script dùng `--async` để không treo khi RPC lỡ nhận giao dịch.
- Hành vi người dựng block chỉ kiểm bằng đọc mã; không có test ở mức `miner/`. Mạng local không chạm tới đường này vì RPC đã từ chối trước. T05 nên thêm test dựng block với nhiều giao dịch trong pool vượt ngân sách.
- Sau review PR #3: D1 ghi thêm state upgrade và genesis `alloc` là đường nằm ngoài quy tắc (người vận hành), ARCHITECTURE 3.1 có một dòng cạnh bất biến; README (T16) phải cam kết không có state upgrade đụng tới agent.
- Lưu ý state sync trong D1 (node đồng bộ trạng thái tin các validator) chưa đọc mã state sync.
- Kết luận D1 chưa được bên thứ ba ngoài người review rà lại.
- `make-patch.sh` gom mọi sửa đổi vào một file; T05 thay `0001-spike-agent-rule.patch` bằng bản thật.
