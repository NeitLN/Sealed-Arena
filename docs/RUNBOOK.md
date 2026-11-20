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
bash chain/tests/byzantine/run.sh  # node 3 chạy plugin không có quy tắc; node 1, 2 phải từ chối block nó đề xuất (cần image node mới)

# Trường hợp biên dưới luật v2 (docs/MEASUREMENTS.md); mạng dựng với SEALED_RULE_V2_AT=0
SEALED_RULE_V2_AT=0 bash scripts/localnet.sh up
pnpm --filter attacks edge                 # phí, đóng băng khi khoản trả còn trong pool, payee có code sau khi được liệt kê, đối chứng
pnpm --filter attacks edge --utc-boundary  # thêm ranh giới 00:00 UTC: chạy trong vòng 15 phút trước 00:00 UTC, script chờ thật
pnpm --filter attacks adaptive             # kẻ tấn công thử lần lượt 57 biến thể với khoá agent, ghi lý do node trả cho từng lần
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

**Dùng:** RPC `https://sealed-arena.duckdns.org/rpc` (chain id 261126), trang chào `https://sealed-arena.vercel.app`, trang chủ ví `https://sealed-arena.vercel.app/console`.

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
- Relayer ICM đọc log C-Chain 200 khối một lần và không có tham số đổi số này; `api.avax-test.network` chỉ cho tối đa 100, nên sau mỗi lần bị trễ relayer thoát rồi khởi động lại liên tục và không chuyển gì. `relayer-config` vì vậy đọc C-Chain qua `avalanche-fuji-c-chain-rpc.publicnode.com` (cho 200). Kiểm: `docker inspect -f '{{.RestartCount}}' icm-relayer` phải đứng yên. Đây không phải thay đổi về tin cậy: relayer chỉ lấy log từ nguồn đó; chain đích vẫn kiểm chữ ký Warp của validator nguồn trước khi nhận một thông điệp.
- Chạy các bộ kiểm trên Fuji: đặt `SEALED_NODE_URLS`, `SEALED_RPC_PATH`, `SEALED_ADMIN_KEY`, `SEALED_RELAYER_KEY`, `SEALED_DEPLOYER_KEY`, `SEALED_AGENT_KEY`, `SEALED_SEED_FUNDING` rồi `pnpm --filter attacks seed` và `leaked-key`. Cách gọn: `pnpm --filter attacks suite leaked-key --fuji` và `suite wallet S --fuji` (đọc `.env`, cần đường hầm tới node ở `127.0.0.1:19650`). `leaked-key` cần agent chưa tiêu gì trong ngày UTC; nếu đã tiêu, nó dừng với `NOT RUN`. Trang đã triển khai: `pnpm --filter web e2e:live`.

### 7.1 Bật luật agent v2 trên Fuji

Một chiều: qua T thì muốn quay lại phải phát hành thêm một lần nâng cấp. Chọn T cách lúc triển khai đủ để kiểm node mới và quay về bản cũ nếu cần; tránh đúng 00:00 UTC (lúc bộ đếm ngày quay về 0).
1. Trên máy node: `git pull`, `bash chain/scripts/fetch.sh`, `SEALED_IMAGE=sealed-node:<tag> bash chain/scripts/build.sh`.
2. Ghi lịch vào cấu hình nâng cấp của chain, trong volume dữ liệu node: `configs/chains/<blockchainID>/upgrade.json` với nội dung `{"precompileUpgrades":[{"agentRuleV2Config":{"blockTimestamp":<T>}}]}`.
3. `docker stop -t 60 sealed-fuji`, sao lưu volume (`tar` thư mục `_data`), `docker rm sealed-fuji`, chạy lại container với image mới và cùng lệnh khởi động.
4. Kiểm trước T: node khoẻ, RPC công khai trả lời, `ruleVersion()` còn lỗi (v1), trang chủ ví và relayer chạy. Sau T: `ruleVersion()` trả 2, relayer `/info` báo `ruleVersion: 2`, chạy lại các bộ kiểm trên Fuji.
5. Agent của thử thách mở: đặt lại uỷ quyền bằng `setMandateV2` để có hạn mức phí.
6. Relayer ICM (`icm-relayer` v1.8.4) đọc `eth_getChainConfig` lúc khởi động và giải mã mọi mục trong `upgrades.precompileUpgrades` bằng danh sách precompile gốc của Subnet-EVM; gặp `agentRuleV2Config` thì dừng với `failed to fetch chain config` và khởi động lại mãi. Chạy proxy `services/fuji-ops/src/chain-config-proxy.ts` (Node 24, không cần cài gói) trên cổng `127.0.0.1:9660` và đặt `rpc-endpoint` của L1 trong cấu hình relayer về cổng đó. Proxy chuyển nguyên mọi yêu cầu, chỉ bỏ các mục precompile riêng của dự án khỏi câu trả lời `eth_getChainConfig`; cấu hình Warp giữ nguyên. Kênh `ws-endpoint` vẫn nối thẳng vào node. Kiểm: `docker inspect -f '{{.RestartCount}}' icm-relayer` đứng yên.

Mạng local: `SEALED_RULE_V2_AT=0 bash scripts/check-localnet.sh` (v2 từ đầu) hoặc `SEALED_RULE_V2_AT=+90 bash scripts/localnet.sh up` (chuyển sau 90 giây).

## 8. Cổng RPC và thử thách mở
```bash
GATEWAY_IP_SALT=<chuỗi bí mật ≥ 16 ký tự> SEALED_RPC_URL=<RPC của node> pnpm --filter rpc-gateway start   # cổng 4050
pnpm --filter rpc-gateway localnet-check        # trên mạng local: giao dịch bị cấm được ghi đúng lý do, không lưu IP
```
- Trên Fuji: Caddy chuyển `POST /rpc` vào cổng, mở `GET /attempts/summary`, `/attempts/recent` và `/state` (bản cấu hình: `infra/fuji/Caddyfile`).
- `GET /state`: trạng thái thử thách trong một câu trả lời (đăng ký, uỷ quyền, chi tiêu, số dư, ArenaRecorder, tóm tắt và 15 lần thử gần nhất), bật khi đặt `GATEWAY_ARENA_AGENT` và `GATEWAY_ARENA_RECORDER`. Một câu trả lời được dùng lại 3 giây cho mọi tab, nên số tab đang mở không đổi số lần đọc node; node không trả lời thì trả bản tốt gần nhất kèm `stale: true`, chưa có bản nào thì 503.
- Mỗi lần thử có nhãn `source`: giá trị header `X-Sealed-Source` của client (chữ thường, số, `:` và `-`, tối đa 32 ký tự, ví dụ `web:arena`), không có thì `rpc`. Nhãn do client tự khai, chỉ để đọc nhật ký, không phải bằng chứng. `GET /attempts/recent?from=<agent>&result=rejected&since=<ms>` trả các lần bị từ chối của một agent từ một thời điểm (trang chủ ví dùng để báo "bị từ chối từ lần bạn vào trước").
- Kiểm từ bên ngoài: `bash scripts/public-health.sh` (RPC, block mới nhất, relayer, thử thách, trang). Workflow `.github/workflows/health.yml` chạy nó mỗi 30 phút; lần chạy lỗi là cảnh báo (thông báo của GitHub).
- **Node kiểm độc lập** (không phải validator, ai cũng chạy được): `bash chain/scripts/verifier.sh up` rồi `pnpm --filter fuji-ops verify-agree` (so hash block và state root với RPC công khai). Cách chạy, cấu hình nâng cấp bắt buộc và kết quả đã ghi: [`docs/VERIFY.md`](VERIFY.md).
- **Canary agent** (`services/fuji-ops/src/canary.ts`, cần đường hầm tới node ở `127.0.0.1:19650` hoặc `CANARY_NODE_URL`): một agent riêng, uỷ quyền rất nhỏ (một payee của dự án, perTx 0,001, ngày 0,01, phí ngày 0,005, hết hạn 01/03/2027). Mỗi lần chạy: (a) khoản trả tới một địa chỉ lạ mới phải bị RPC từ chối với `agent: payee not allowed`, (b) 1 wei tới payee phải vào block, (c) `balance ≥ funded − totalCharged`. In `PASS`/`FAIL`, thoát khác 0 khi có `FAIL`.
  - Dựng một lần: `pnpm --filter fuji-ops canary setup` (tạo khoá, chỉ ghi vào `.env`: `FUJI_CANARY_PRIVATE_KEY`, `FUJI_CANARY_PAYEE_PRIVATE_KEY`, địa chỉ và `FUJI_CANARY_FUNDED` (coin đã nạp, nạp thêm thì sửa số này); admin bật TxAllowList và nạp 0,2 coin; đăng ký với `FUJI_SUITE_OWNER_P256_KEY`; đặt uỷ quyền). Chạy lại được: bước nào đã xong thì bỏ qua, uỷ quyền được đặt lại.
  - Đã dựng 20/11/2026 13:29 UTC: canary `0xDbd4d8c127978762d2AE08b5F1F60F373f3fBD26`, payee `0xc4853b2e5311FfF3871eeAF30FA66C66C6BDf942`; TxAllowList `0xff51de00…4ee5`, nạp 0,2 coin `0x805ac335…41d7`, uỷ quyền `0x65614638…2c20`. Lần chạy đầu qua đường hầm (13:30:04 UTC): `PASS` cả ba (stranger bị từ chối `agent: payee not allowed`; 1 wei vào block 556; `balance 0.199979 ≥ 0.2 − 0.0000252`). Lần hai qua node kiểm độc lập (13:35:00 UTC, `CANARY_NODE_URL=http://127.0.0.1:19750`): `PASS` cả ba, 1 wei vào block 557.
  - Chạy: `pnpm --filter fuji-ops canary`. Mỗi lần tốn khoảng 0,000021 coin phí + 1 wei; 0,2 coin đủ cho vài nghìn lần.
  - Lên lịch trên máy của đội (máy có `.env` và đường hầm), không cài gì lên VM. Gửi qua đường hầm chứ không qua RPC công khai, để lần thử của canary không cộng vào số lần thử công khai của cổng.
    ```bash
    # crontab -e (Linux/macOS), mỗi giờ, phút 17, ghi log:
    # 17 * * * * cd /path/to/Sealed-Arena && pnpm --filter fuji-ops --silent canary >> ~/sealed-canary.log 2>&1 || echo "canary FAIL $(date -u)" >> ~/sealed-canary.log
    # Windows (Task Scheduler), mỗi giờ:
    # schtasks /Create /SC HOURLY /TN SealedCanary /TR "\"C:\Program Files\Git\bin\bash.exe\" -lc 'cd \"/c/path/to/Sealed-Arena\" && pnpm --filter fuji-ops --silent canary >> ~/sealed-canary.log 2>&1'"
    ```
- Tải: `MSYS_NO_PATHCONV=1 docker run --rm -i grafana/k6:0.57.0 run - < infra/load/arena.k6.js` (50 tab đọc `/state` và tóm tắt mỗi 5 giây trong 2 phút; chỉ đọc).
- Mở thử thách (chạy lại được): `pnpm --filter attacks arena-open` với `SEALED_*` của mạng đích, `SEALED_OWNER_P256_KEY` (bí mật), `ARENA_RECORDER`, `ARENA_PAYEES`, `ARENA_FUNDING`, `ARENA_EXPIRY`. Script từ chối chạy nếu thiếu khoá chủ ví bí mật.
- Trang: `/arena`, `/arena/rules`. Relayer cần `RELAYER_ARENA_RECORDER` để bật `/arena`. Mỗi hành động (`checkpoint`, `reportBreach`) cho một agent được gửi tối đa một lần mỗi 60 giây, bất kể ai gọi (429 `cooldown`). Cổng RPC tính mỗi lệnh trong một batch là một lượt khi giới hạn tần suất.
- Agent demo cho trang chủ ví: relayer bật `POST /demo/claim` khi có `RELAYER_DEMO_MANAGER_KEY`. Mỗi lần: tạo key mới, đăng ký agent với passkey của khách **trước**, rồi key quản lý (vai trò manager của TxAllowList, không phải admin) mới cho phép gửi và nạp 0,05 USDC thử; key trả về cho người nhận, relayer không giữ. Mỗi IP 1 agent mỗi 10 phút, tối đa 40 agent mỗi ngày (`RELAYER_DEMO_PER_DAY`). Key quản lý: `pnpm --filter fuji-ops demo-manager grant`, nạp `demo-manager fund <coin>`, xem `demo-manager status`.
- Kiểm nhanh trước demo: `pnpm --filter fuji-ops health` (RPC công khai, số dư validator đủ tới 05/12, khoá manager đủ 40 agent demo, gas relayer, agent thử thách, relayer ICM khi đặt `HEALTH_SSH`). Dòng nào `FAIL` thì nạp: validator bằng lệnh ở §7, khoá manager bằng `demo-manager fund <coin>`.
- **Khi nghi máy relayer bị chiếm:** `demo-manager audit` (mọi địa chỉ khoá manager đã cho phép gửi phải là agent đã đăng ký; địa chỉ nào không phải là dấu hiệu bị dùng sai) → `demo-manager revoke` (relayer trả 503 `demo-disabled`) → admin gọi `setNone` cho từng địa chỉ lạ → tạo khoá manager mới, đổi `RELAYER_DEMO_MANAGER_KEY` trên máy và tạo lại container relayer → `demo-manager grant`. Agent demo đã cấp vẫn chạy. `audit` đọc log qua đường hầm tới node.
- **Sau mỗi lần chạy leaked-key trên Fuji:** USDC thử nằm ở hai payee của mandate mẫu; chuyển về khoá manager nếu cần dùng tiếp.
- So sánh P, O, S trên Fuji (tiêu USDC thử): `pnpm --filter attacks compare setup` rồi `compare run`; kết quả ở `services/attacks/compare/results/` và trang `/compare` (`services/attacks/compare/README.md`).

## 9. Bản ghi sống sót sang ERC-8004
```bash
bash scripts/forge.sh build
pnpm --filter fuji-ops reputation deploy    # TeleporterPublisher (L1), danh tính ERC-8004, ReputationReceiver (Fuji); chạy lại được
pnpm --filter fuji-ops reputation publish   # ArenaRecorder.publish trên L1 (relayer ICM chuyển sang Fuji)
pnpm --filter fuji-ops reputation read      # đọc feedback do ReputationReceiver ghi
```
- Quyết định và bằng chứng: `docs/decisions/D7.md`.

## 10. Xem log
```bash
docker logs -f sealed-node                       # log dựng mạng và log node đầu tiên
docker exec sealed-node cat /data/sealed.json    # thư mục mạng, subnet ID, blockchain ID, URI các node
docker exec sealed-node sh -c 'ls /data/networks/*/'                          # thư mục từng node
docker exec sealed-node sh -c 'tail -n 100 /data/networks/*/NodeID-*/logs/main.log'
docker exec sealed-node sh -c 'ls /data/networks/*/NodeID-*/logs/'            # log của từng chain (theo blockchain ID)
```

## 11. Sự cố thường gặp
| Triệu chứng | Cách xử lý |
|---|---|
| `failed to connect to the docker API` | Mở Docker Desktop, chờ nó báo đang chạy |
| `localnet: timed out` hoặc `container stopped` | Xem log in kèm; chạy `down` rồi `up` lại |
| Cổng 9650 bị chiếm | Tắt tiến trình đang dùng cổng, hoặc chạy `down` nếu là container cũ |
| `$'\r': command not found` khi chạy script | File bị chuyển CRLF. Repo có `.gitattributes` ép LF; chạy `git add --renormalize .` hoặc clone lại |
| `fetch: tag ... resolves to ...` | Tag upstream đã bị đổi. Không sửa `chain/UPSTREAM` để lách; báo người review |

Run `pnpm --filter web e2e:landing` to check the built site in bundled Chromium at desktop and mobile widths (no localnet required).
