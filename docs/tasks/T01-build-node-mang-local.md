# T01: Build node và chạy mạng L1 local
Mốc: M0 · Ngày mục tiêu: 15/11 · Nhánh: `task/T01-build-node` · Phụ thuộc: không · Mức: Standard
Trả lời quyết định **D3** (cách dựng L1).

## Mục tiêu
Từ mã nguồn avalanchego ở tag `v1.15.3`, **chưa sửa gì**, build được node và plugin Subnet-EVM trong Docker, dựng một mạng L1 local một node, và gửi được một giao dịch chuyển coin gốc. Đây là nền để T02 chèn quy tắc.

## Sở hữu
- `chain/Dockerfile`, `chain/scripts/fetch.sh` (lấy mã nguồn đúng tag vào `chain/.work/`, thư mục này đã gitignore), `chain/scripts/build.sh`, `chain/scripts/apply-patches.sh` (áp mọi file trong `chain/patches/`; hiện chưa có bản vá nào)
- `chain/genesis/local.json` (genesis tối thiểu: chain id `261126`, một tài khoản dev có coin, chưa bật precompile nào ngoài mặc định)
- `infra/local/` (docker-compose hoặc script dựng mạng local một node)
- `scripts/localnet.sh` với các lệnh con `up`, `down`, `status`, `rpc` (in URL RPC)
- `docs/RUNBOOK.md` (tạo mới: cách build, cách dựng và hạ mạng local, cách xem log)

## Phải kiểm trước khi làm (ghi kết quả vào "Bàn giao")
1. Phiên bản Go mà tag `v1.15.3` yêu cầu (`go.mod`).
2. Cách build chính thức của `graft/subnet-evm` ở tag này (`scripts/build.sh`, `Taskfile.yml`, `Dockerfile` có sẵn).
3. Cách dựng một L1 local với VM tự build. Xét ít nhất hai cách và chọn một:
   - công cụ dòng lệnh chính thức đang được Builder Hub hướng dẫn (kiểm xem còn được hỗ trợ và có chạy trong container Linux không);
   - `scripts/run.sh` hoặc bộ dựng mạng thử có sẵn trong repo avalanchego (tmpnet);
   - tự chạy avalanchego ở chế độ mạng local và tạo L1 qua API P-Chain.
   Tiêu chí chọn: chạy được hoàn toàn trong Docker trên Windows, lặp lại được bằng một lệnh, và mở rộng lên 3 node được (T06 cần).

## Việc phải làm
1. `chain/scripts/fetch.sh`: clone nông đúng tag, kiểm hash commit khớp tag, ghi hash vào `chain/UPSTREAM` (file này commit).
2. Build node và plugin trong Docker; kết quả là một image có tên cố định, ví dụ `sealed-node:dev`.
3. Dựng mạng L1 local một node bằng cách đã chọn. `scripts/localnet.sh up` phải tự làm hết, không cần thao tác tay.
4. Một script kiểm khói `chain/scripts/smoke.sh`: đọc `eth_chainId` (phải là `0x3fc06`), gửi một giao dịch chuyển coin gốc từ tài khoản dev, chờ receipt, kiểm số dư người nhận.

## Tiêu chí chấp nhận
- [ ] Từ máy sạch (xoá `chain/.work/` và image): `bash chain/scripts/fetch.sh && bash chain/scripts/build.sh` thành công. Ghi thời gian build.
- [ ] `bash scripts/localnet.sh up` rồi `bash chain/scripts/smoke.sh` → `PASS`.
- [ ] `bash scripts/localnet.sh down` dọn sạch container và dữ liệu mạng.
- [ ] Chạy lại `up` sau `down` vẫn `PASS` (lặp lại được).
- [ ] `docs/RUNBOOK.md` đủ để người khác làm lại mà không hỏi.
- [ ] "Bàn giao" có đề xuất cho D3 kèm lý do, và ghi cách chọn có mở rộng lên 3 node được không.

## Ngoài phạm vi
Mọi thay đổi vào mã nguồn avalanchego (đó là T02). Fuji. Precompile.

## Lưu ý
- Không chạy được Go trên máy: mọi lệnh Go đi qua Docker.
- Build avalanchego tốn thời gian và dung lượng. Dùng cache build của Docker để lần build sau nhanh; T02 sẽ build lại nhiều lần.
- Nếu sau nửa ngày vẫn chưa dựng được mạng local theo cách nào, dừng và ghi rõ đã thử gì, lỗi gì. Không chuyển sang sửa mã nguồn để lách.

## Bàn giao
(người code điền)
