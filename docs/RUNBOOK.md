# RUNBOOK: build node và mạng local

Áp dụng cho Windows 11 + Git Bash + Docker Desktop. Linux và macOS chạy cùng lệnh. Mọi lệnh chạy từ thư mục gốc repo.

## Cần có
- Docker Desktop đang chạy (Linux containers).
- Git, bash (Git Bash trên Windows), `curl`.
- Không cần cài Go hay Foundry trên máy: Go chạy trong image `golang` khi build, `cast` chạy trong image Foundry khi kiểm khói.
- Cổng `127.0.0.1:9650` đang trống.

## 1. Lấy mã nguồn avalanchego
```bash
bash chain/scripts/fetch.sh
```
- Clone nông tag ghi trong `chain/UPSTREAM` (`v1.15.3`) vào `chain/.work/avalanchego` (đã gitignore). Thư mục cũ bị xoá trước khi clone.
- Dừng với lỗi nếu tag không trỏ đúng commit ghi trong `chain/UPSTREAM`.
- Áp mọi file `chain/patches/*.patch` theo thứ tự tên (`chain/scripts/apply-patches.sh`). Muốn áp lại bản vá sau khi sửa: chạy lại `fetch.sh` (luôn bắt đầu từ mã nguồn sạch).

## 2. Build image node
```bash
bash chain/scripts/build.sh              # tạo image sealed-node:dev
bash chain/scripts/build.sh --no-cache   # tham số thêm được chuyển cho docker build
SEALED_IMAGE=sealed-node:test bash chain/scripts/build.sh
```
Image chứa: `avalanchego`, plugin Subnet-EVM (VM ID mặc định `srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy`) và `sealed-localnet` (công cụ dựng mạng, mã trong `chain/localnet/`).
Thời gian đo ngày 15/11 trên máy phát triển: build lần đầu 126 giây; build `--no-cache` 147 giây; build lại sau khi sửa một file Go 16–21 giây (cache module và cache biên dịch của Go được giữ giữa các lần build).

## 3. Dựng, kiểm và hạ mạng local
```bash
bash scripts/localnet.sh up        # 3 validator trong container sealed-node, chờ chain Sealed trả eth_chainId (tối đa 600 giây)
bash chain/scripts/smoke.sh        # kiểm khói: chain id 261126, chuyển 1 coin, kiểm số dư
bash scripts/localnet.sh rpc       # in URL RPC của chain Sealed trên máy
bash scripts/localnet.sh status    # trạng thái container và eth_chainId
bash scripts/localnet.sh seed      # agent thử: TxAllowList, cấp coin, đăng ký, uỷ quyền mẫu
bash scripts/localnet.sh down      # xoá container, volume dữ liệu và network docker

bash scripts/check-localnet.sh     # mạng mới + smoke + seed + leaked-key + x402 + ArenaRecorder + chain/tests/rule/run.sh
```
- Mặc định 3 node (đổi bằng `SEALED_NODE_COUNT=1`). Các node cùng chạy trong một container; cổng HTTP `9650`, `9652`, `9654` đều được mở ra máy, đường dẫn RPC giống nhau.
- Genesis: `chain/genesis/sealed-local.json` (giải thích trong `chain/genesis/README.md`). Đổi file genesis bằng `SEALED_GENESIS_FILE=<tên file trong chain/genesis>`.
- TxAllowList đang bật: chỉ admin, người triển khai, relayer, facilitator, relayer ICM và các agent đã được admin thêm mới gửi được giao dịch.
- **Tắt 1 trong 3 node** (đo ngày 16/11): chain ngừng tạo block; giao dịch hợp lệ gửi lúc đó không vào block trong 120 giây và mất khỏi mempool khi khởi động lại. Bật lại đủ node (`docker restart sealed-node`, rồi `up`) thì cả 3 node cùng block và chain chạy tiếp. Với 3 validator ngang stake, mất 1 node là dừng.
- Đổi thời gian chờ: `SEALED_UP_TIMEOUT=900 bash scripts/localnet.sh up`.
- **Blockchain ID đổi sau mỗi lần `down` rồi `up`** (mạng mới). Luôn lấy URL bằng `bash scripts/localnet.sh rpc`, không chép cứng. Chain id EVM luôn là `261126`.
- Khởi động lại container (`docker restart sealed-node`) giữ nguyên dữ liệu và blockchain ID; chạy `bash scripts/localnet.sh up` để chờ chain sẵn sàng.
- Khoá dev của các vai (admin, người triển khai, relayer, facilitator, relayer ICM, agent thử, passkey thử) nằm trong `packages/shared/src/addresses.local.ts`. Đều là khoá công khai, chỉ dùng trên mạng local.

## 4. Thanh toán x402 trên mạng local
Cần mạng local đang chạy và đã `seed`. Hai service đọc `SEALED_RPC_URL` (lấy bằng `bash scripts/localnet.sh rpc`); các biến khác xem `.env.example`.
```bash
export SEALED_RPC_URL=$(bash scripts/localnet.sh rpc)
pnpm --filter facilitator start    # http://127.0.0.1:4020: POST /verify, POST /settle, GET /supported
pnpm --filter seller start         # http://127.0.0.1:4021: /catalog, /free/hello, 3 tài nguyên trả phí dưới /data/
curl -i http://127.0.0.1:4021/data/weather   # 402, header PAYMENT-REQUIRED (base64) có requestId mới

pnpm --filter attacks x402         # tự dựng facilitator + 3 người bán, mua 1 lần, thử 8 cách trả sai, 1 ca mất câu trả lời settle
```
- Người bán mặc định nhận tiền ở người nhận đầu tiên của uỷ quyền mẫu (`SELLER_PAY_TO` để đổi).
- Mỗi 402 cấp một `requestId` mới, sống 5 phút, dùng một lần. Khởi động lại người bán thì 402 cũ hết hiệu lực.
- Facilitator không cần khoá: giao dịch do agent ký và agent trả gas.
- Định dạng trên dây: `docs/decisions/D5.md`.

## 5. ArenaRecorder trên mạng local
```bash
bash scripts/forge.sh build            # cần artifact contracts/out/ArenaRecorder.sol
pnpm --filter attacks arena            # triển khai, enroll + fund 50 coin cho agent mới, chạy leaked-key, checkpoint
```
- Người triển khai (khoá `deployer` trong `addresses.local.ts`) là admin của recorder.
- Bộ leaked-key nhận agent khác qua `SEALED_AGENT_KEY`; mặc định là agent của `seed`.

## 6. Trang chủ ví và relayer
```bash
export SEALED_RPC_URL=$(bash scripts/localnet.sh rpc)
pnpm --filter relayer start        # http://127.0.0.1:4040: POST /relay, GET /info
pnpm --filter web dev              # http://localhost:5173 (passkey cần localhost hoặc HTTPS, không dùng 127.0.0.1)

pnpm --filter web e2e              # build trang, tự bật relayer, Chromium với passkey giả lập: gắn agent, uỷ quyền, dừng/mở, passkey khác
```
- Web gọi relayer ở `VITE_RELAYER_URL` (mặc định `http://127.0.0.1:4040`), lấy URL RPC từ `/info` của relayer (`RELAYER_PUBLIC_RPC`, mặc định là `SEALED_RPC_URL`).
- Ngoài mạng local, relayer cần `RELAYER_PRIVATE_KEY` (địa chỉ phải có trong TxAllowList và có coin trả gas).
- E2E cần Chromium của Playwright: `pnpm --filter web exec playwright install chromium` nếu máy chưa có.

## 7. L1 Sealed trên Fuji
Mã định danh, địa chỉ hợp đồng và giao dịch: `services/fuji-ops/deployments/fuji.json`. Khoá chỉ nằm trong `.env` (không push) và trên máy chạy node.

**Dùng:** RPC `https://sealed-arena.duckdns.org/rpc` (chain id 261126), trang chủ ví `https://sealed-arena.vercel.app`.

**Dựng lại từ đầu** (tiêu AVAX trên Fuji; đổi L1 không đảo ngược):
```bash
node chain/genesis/make-fuji.mjs                       # genesis từ bản local + địa chỉ vai trong .env
platform subnet create --network fuji                  # Platform CLI v2.4.0, khoá qua AVALANCHE_PRIVATE_KEY
pnpm --filter fuji-ops deploy-vmc <subnetID>           # ValidatorManager trên C-Chain, initialize cùng lúc
platform chain create --network fuji --subnet-id <subnetID> --genesis sealed-fuji.json --name sealed
# node: --network-id=fuji --partial-sync-primary-network=true --track-subnets=<subnetID>
platform subnet convert-to-l1 --network fuji --subnet-id <subnetID> \
  --chain-id <Fuji C-Chain ID> --manager <ValidatorManager> --validators 127.0.0.1:9650 --validator-balance 0.4
pnpm --filter fuji-ops ictt contracts                  # rồi: relayer-config (chạy icm-relayer v1.8.4), register, collateral
pnpm --filter fuji-ops ictt send <USDC> <địa chỉ trên L1>
```
- Genesis local đặt Warp từ 2020; trên Fuji như vậy chain không khởi động ("warp cannot be activated before Durango"). `make-fuji.mjs` đặt Warp từ 1709740800 và tự kiểm.
- Số dư validator giảm khoảng 0,044 AVAX/ngày; nạp thêm: `platform l1 increase-validator-balance --validation-id <id> --balance <AVAX>`.
- Chạy các bộ kiểm trên Fuji: đặt `SEALED_NODE_URLS`, `SEALED_RPC_PATH`, `SEALED_ADMIN_KEY`, `SEALED_RELAYER_KEY`, `SEALED_DEPLOYER_KEY`, `SEALED_AGENT_KEY`, `SEALED_SEED_FUNDING` rồi `pnpm --filter attacks seed` và `leaked-key`. Trang đã triển khai: `pnpm --filter web e2e:live`.

## 8. Cổng RPC và thử thách mở
```bash
GATEWAY_IP_SALT=<chuỗi bí mật ≥ 16 ký tự> SEALED_RPC_URL=<RPC của node> pnpm --filter rpc-gateway start   # cổng 4050
pnpm --filter rpc-gateway localnet-check        # trên mạng local: giao dịch bị cấm được ghi đúng lý do, không lưu IP
```
- Trên Fuji: Caddy chuyển `POST /rpc` vào cổng, mở `GET /attempts/summary` và `/attempts/recent`.
- Mở thử thách (chạy lại được): `pnpm --filter attacks arena-open` với `SEALED_*` của mạng đích, `SEALED_OWNER_P256_KEY` (bí mật), `ARENA_RECORDER`, `ARENA_PAYEES`, `ARENA_FUNDING`, `ARENA_EXPIRY`. Script từ chối chạy nếu thiếu khoá chủ ví bí mật.
- Trang: `/arena`, `/arena/rules`. Relayer cần `RELAYER_ARENA_RECORDER` để bật `/arena`.

## 9. Xem log
```bash
docker logs -f sealed-node                       # log dựng mạng và log node đầu tiên
docker exec sealed-node cat /data/sealed.json    # thư mục mạng, subnet ID, blockchain ID, URI các node
docker exec sealed-node sh -c 'ls /data/networks/*/'                          # thư mục từng node
docker exec sealed-node sh -c 'tail -n 100 /data/networks/*/NodeID-*/logs/main.log'
docker exec sealed-node sh -c 'ls /data/networks/*/NodeID-*/logs/'            # log của từng chain (theo blockchain ID)
```

## 10. Sự cố thường gặp
| Triệu chứng | Cách xử lý |
|---|---|
| `failed to connect to the docker API` | Mở Docker Desktop, chờ nó báo đang chạy |
| `localnet: timed out` hoặc `container stopped` | Xem log in kèm; chạy `down` rồi `up` lại |
| Cổng 9650 bị chiếm | Tắt tiến trình đang dùng cổng, hoặc chạy `down` nếu là container cũ |
| `$'\r': command not found` khi chạy script | File bị chuyển CRLF. Repo có `.gitattributes` ép LF; chạy `git add --renormalize .` hoặc clone lại |
| `fetch: tag ... resolves to ...` | Tag upstream đã bị đổi. Không sửa `chain/UPSTREAM` để lách; báo người review |
