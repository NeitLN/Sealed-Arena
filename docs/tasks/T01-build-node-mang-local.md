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

### Kết quả "Phải kiểm trước khi làm"
1. Go: `go 1.26.10` (`go.mod` dòng 18 ở tag `v1.15.3`). Repo dùng `go.work` gồm module gốc, `graft/coreth`, `graft/evm`, `graft/subnet-evm`. Image build dùng `golang:1.26.10-bookworm`.
2. Build chính thức: `scripts/build.sh` ở gốc (avalanchego) và `graft/subnet-evm/scripts/build.sh <đường dẫn>` (plugin). Cả hai đọc commit từ biến `AVALANCHEGO_COMMIT` nếu có (`scripts/git_commit.sh`), nên build được khi không có thư mục `.git`. `graft/subnet-evm/Dockerfile` cần image node có sẵn và proxy module ngoại tuyến, nên không dùng trực tiếp.
3. Cách dựng mạng: xét tmpnet qua mã Go, `run.sh` + tự tạo subnet, và `avalanche-cli`. Chọn tmpnet. Lý do và bằng chứng ở `docs/decisions/D3.md`. Mở rộng lên 3 node: được, đã chạy thử.

### Đã làm
- `chain/UPSTREAM`: repo, tag `v1.15.3`, commit `983815fd993acf846a27749b598f0fea4d876a75`, phiên bản Go. Hash được ghi cố định trong file này; `fetch.sh` **kiểm** tag khớp hash và dừng nếu lệch (thay vì ghi lại hash mới mỗi lần), để tag bị đổi phía upstream không lọt vào build.
- `chain/scripts/fetch.sh`, `chain/scripts/apply-patches.sh` (chưa có bản vá; `chain/patches/.gitkeep`), `chain/scripts/build.sh`, `chain/Dockerfile`, `chain/.dockerignore`, `chain/entrypoint.sh`.
- `chain/localnet/main.go`: công cụ `sealed-localnet` dùng tmpnet. Tạo mạng mới với subnet `sealed` chạy Subnet-EVM và genesis `chain/genesis/local.json`; hoặc khởi động lại mạng đã có trong volume. Ghi `/data/sealed.json` (thư mục mạng, subnet ID, blockchain ID, URI node, đường dẫn RPC).
- `chain/genesis/local.json`: chain id `261126`, `feeConfig` với gasLimit 15.000.000 và minBaseFee 25 gwei, cấp coin cho tài khoản dev `0x8db9…52FC`. Không bật precompile nào.
- `infra/local/docker-compose.yml`, `scripts/localnet.sh` (`up`, `down`, `status`, `rpc`), `chain/scripts/smoke.sh`, `docs/RUNBOOK.md`, `docs/decisions/D3.md`.

### File ngoài mục "Sở hữu"
- `chain/localnet/main.go`, `chain/entrypoint.sh`, `chain/.dockerignore`, `chain/patches/.gitkeep`: cần cho cách dựng đã chọn.
- `chain/UPSTREAM` có dạng `KEY=VALUE` để script `source` được.
- `docs/decisions/D3.md`, `docs/REFERENCE.md`: theo quy trình khi task trả lời một quyết định D.

### Kết quả kiểm
Môi trường: Windows 11, Git Bash, Docker 29.5.3, ngày 15/11/2026, nhánh `task/T01-build-node`.

| Tiêu chí | Lệnh | Kết quả |
|---|---|---|
| Build từ máy sạch | xoá `chain/.work/` và image `sealed-node:dev`; `bash chain/scripts/fetch.sh && bash chain/scripts/build.sh --no-cache` | `PASS`: 154 giây tổng, `docker build` 147 giây. Build lần đầu trên máy (chưa có cache Go) 126 giây. Ghi chú: `--no-cache` bỏ cache tầng, còn cache module và cache biên dịch Go (cache mount) vẫn được giữ |
| `up` rồi smoke | `bash scripts/localnet.sh up && bash chain/scripts/smoke.sh` | `PASS`: mạng sẵn sàng sau khoảng 11 giây; `eth_chainId` `0x3fc06`; chuyển 10^18 wei, receipt `0x1`, số dư người nhận đúng |
| `down` dọn sạch | `bash scripts/localnet.sh down`, đếm container, volume, network | `PASS`: còn 0 container `sealed-node`, 0 volume, 0 network `sealed-localnet` |
| Lặp lại `up` sau `down` | hai vòng `up` → smoke → `down` | `PASS` cả hai vòng |
| Khởi động lại container | `docker restart sealed-node`, `up`, smoke | `PASS`, blockchain ID giữ nguyên |
| Ba node (cho T06) | `SEALED_NODE_COUNT=3 bash scripts/localnet.sh up`, smoke, `platform.getCurrentValidators`, `info.peers` | `PASS`: 3 validator của subnet, node 1 có 2 peer |
| `bash scripts/check.sh` | | ghi trong PR |

### Ghi chú, việc phát hiện thêm (không làm trong task này)
- Blockchain ID đổi mỗi lần dựng mạng mới. Service phải lấy URL bằng `scripts/localnet.sh rpc` hoặc đọc `/data/sealed.json`. Nếu T06 hay T07 cần ID cố định, có thể đặt alias chain cho node (cờ `chain-aliases` của avalanchego). Chưa kiểm.
- tmpnet tạo subnet có cấp quyền, không chuyển thành L1 theo ACP-77. Quy tắc hợp lệ không bị ảnh hưởng, nhưng T12 phải kiểm luồng L1 thật trên Fuji (đã ghi **[cần kiểm T12]** trong D3).
- Lỗi lúc làm: khi container khởi động lại, file `process.json` cũ khiến tmpnet tưởng node còn chạy. Đã xử lý bằng cách xoá các file này rồi gọi `StartNodes`. Có test thủ công ở dòng "Khởi động lại container".
- `smoke.sh` cố định cùng digest image Foundry với `scripts/forge.sh`. Khi nâng Foundry phải sửa cả hai chỗ.
- Gợi ý cho T06 (từ review PR #2): `tests/e2e/p/l1.go` gửi `ConvertSubnetToL1Tx` trên tmpnet; thử chuyển mạng local thành L1 để khớp với T12.
- Sau review: `PreFundedKey` của chain trỏ về khoá ewoq (tài khoản thật sự có coin trong genesis) thay cho khoá hardhat.
