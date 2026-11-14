# REFERENCE: sự kiện, địa chỉ, nguồn

Mỗi mục ghi mức kiểm chứng:
- **ĐÃ KIỂM (ngày, cách):** có người đã mở nguồn hoặc gọi RPC.
- **CHƯA KIỂM:** thông tin từ nghiên cứu trước, chưa ai xác nhận trực tiếp. Task phụ thuộc vào nó phải kiểm trước.

Khi một task kiểm lại một mục, người code cập nhật mức kiểm chứng ở đây trong PR của task; người review kiểm bằng chứng.

## Avalanche: mã nguồn và phiên bản

| Sự kiện | Mức |
|---|---|
| Tag avalanchego mới nhất là `v1.15.3` (phát hành 05/11/2026). Dự án cố định ở tag này | ĐÃ KIỂM 15/11, GitHub API |
| Subnet-EVM nằm trong repo avalanchego tại `graft/subnet-evm/`. Có `Dockerfile`, `scripts/build.sh`, `scripts/run.sh`, `Taskfile.yml`, `plugin/` | ĐÃ KIỂM 15/11, GitHub API |
| Precompile có sẵn trong `graft/subnet-evm/precompile/contracts/`: `deployerallowlist`, `feemanager`, `gaspricemanager`, `nativeminter`, `rewardmanager`, `txallowlist`, `warp` | ĐÃ KIỂM 15/11, GitHub API |
| `(*StateTransition).preCheck()` ở dòng 230 của `core/state_transition.go`; kiểm TxAllowList ở dòng 254–257 qua `txallowlist.GetTxAllowListStatus(st.state, msg.From)`, trả `vmerrors.ErrSenderAddressNotAllowListed` | ĐÃ KIỂM 15/11 trên `master`. Phải kiểm lại trên tag `v1.15.3` |
| `ValidateTransactionWithState()` ở dòng 226 của `core/txpool/validation.go`; kiểm TxAllowList ở dòng 281–284 | ĐÃ KIỂM 15/11 trên `master`. Phải kiểm lại trên tag |
| Kho `ava-labs/precompile-evm` đã bị lưu trữ (10/2026). Precompile tự viết phải nằm trong bản fork avalanchego | CHƯA KIỂM lại |
| Kho `ava-labs/icm-contracts` đã lưu trữ (12/2025), chuyển vào `ava-labs/icm-services` (có `icm-contracts/avalanche/ictt`, gồm `ERC20TokenHome`, `NativeTokenRemote`, `ERC20TokenRemote`) | CHƯA KIỂM lại |
| `ContractDeployerAllowList` kiểm `tx.origin` trong `CanCreateContract`, nên agent không triển khai được contract kể cả qua factory | CHƯA KIỂM lại; T06 phải có test |
| Precompile có thể gọi `env.InvalidateExecution` để vô hiệu giao dịch từ bên trong lúc thực thi (`params/hooks_libevm.go`) | CHƯA KIỂM lại; là phương án thay thế nếu `preCheck` không dùng được |
| Phiên bản Go cần để build | CHƯA KIỂM. Đọc `go.mod` của tag ở T01 |
| Subnet-EVM ở tag này có áp ACP-194 (thực thi tách khỏi đồng thuận) không | CHƯA KIỂM. Là quyết định D1, T02 trả lời |
| Công cụ dòng lệnh dựng L1 local (Avalanche CLI hoặc công cụ thay thế trong Builder Hub) còn được hỗ trợ và chạy được với VM tự build | CHƯA KIỂM. Là quyết định D3, T01 trả lời |

## Avalanche: Fuji

| Sự kiện | Mức |
|---|---|
| RPC C-Chain Fuji: `https://api.avax-test.network/ext/bc/C/rpc`, chain id `43113` | Công khai, kiểm lại bằng `eth_chainId` ở T12 |
| EIP-7702 không dùng được trên Fuji và C-Chain: giao dịch loại `0x04` bị từ chối; ACP-209 còn ở trạng thái Proposed | ĐÃ KIỂM 14/11, gọi RPC |
| Precompile secp256r1 (ACP-204) ở `0x0000000000000000000000000000000000000100` trên Fuji C-Chain: vector thử RIP-7212 trả 1 | ĐÃ KIỂM 14/11, `eth_call` |
| ACP-204 có trên Subnet-EVM L1 ở tag `v1.15.3` | CHƯA KIỂM. D4 |
| USDC Fuji: `0x5425890298aed601595a70AB815c96711a31Bc65`, EIP-712 version `"2"`, có `transferWithAuthorization` nhận chữ ký `bytes` | ĐÃ KIỂM 14/11, `eth_call` |
| TeleporterMessenger có code trên Fuji tại địa chỉ bắt đầu `0x253b` và kết thúc `5fcf` | ĐÃ KIỂM 14/11 một phần. **Lấy địa chỉ đầy đủ từ tài liệu chính thức ở T13, không tự điền** |
| Registry ERC-8004 trên Fuji: Identity bắt đầu `0x8004A818`, Reputation bắt đầu `0x8004B663`, Validation bắt đầu `0x8004Cb1B`, đều có code | ĐÃ KIỂM 14/11 một phần. **Lấy địa chỉ đầy đủ và ABI từ nguồn chính thức ở T13** |
| EntryPoint v0.7 và v0.8, Permit2 có code trên Fuji | ĐÃ KIỂM 14/11 |
| Phí validator L1 trên Fuji khoảng 512 nAVAX/giây, tức khoảng 0,71 AVAX mỗi validator tới 30/11 | ĐÃ KIỂM 14/11, `platform.getValidatorFeeState`. Kiểm lại ở T12 |
| Node và relayer được quản lý của Builder Console tự tắt sau 3 ngày | CHƯA KIỂM lại. Dự án tự chạy node và relayer |
| Warp: validator chỉ ký sau khi block phát tin được chấp nhận; không bảo đảm giao, thứ tự hay chống phát lại; C-Chain kiểm tin từ L1 theo tập validator của L1 với ngưỡng 67% stake | CHƯA KIỂM lại. T13 phải tự chống phát lại ở ReputationReceiver |

## x402

| Sự kiện | Mức |
|---|---|
| Starter của ban tổ chức dùng `@x402/*` 2.28, chuẩn `exact`, EIP-3009 trên USDC; facilitator mặc định `facilitator.ultravioletadao.xyz`, có sẵn facilitator tự chạy (`src/facilitator.mjs`) | ĐÃ KIỂM 13/11, đọc trang demo |
| Chuẩn `exact` trên EVM chỉ hỗ trợ eip3009, permit2, erc7710 | CHƯA KIỂM lại. T07 đọc đặc tả hiện hành trong repo `coinbase/x402` |
| `ERC20TokenRemote` của ICTT là ERC-20 thuần, không có EIP-3009 hay permit | CHƯA KIỂM lại |
| Facilitator `@x402/evm` hỗ trợ người trả là contract qua ERC-1271. `isValidSignature` được gọi bằng `staticcall` nên không cập nhật được bộ đếm: nhiều uỷ quyền đồng thời cùng qua kiểm tra | ĐÃ KIỂM 13/11 (đọc mã). Đây là cơ sở của nhóm đối chứng O ở T14 |

## Starter của ban tổ chức (để ghi nhận trong README và slide)

- `https://team1vn.xyz/demos/x402-pay-per-request/`
- `https://team1vn.xyz/demos/privy-agent-wallet/README.md`: mục "Watch out" tự nêu bốn điểm yếu: hạn mức theo từng giao dịch chứ không theo ngày; chính sách không nhìn thấy calldata; phải tin máy chủ; người giữ key agent đổi được chính sách.

Cách dùng: ghi nhận starter đã nêu rõ các điểm này và dự án xử lý chúng ở tầng chain. Không trình diễn rút tiền một agent dựng từ starter.

## Bảng mối đe doạ (số liệu cho slide)

Tất cả ở mức CHƯA KIỂM bởi đội. Việc H8 là mở lại từng nguồn trước khi đưa con số lên slide.

| Kiểu tấn công | Số liệu | Nguồn |
|---|---|---|
| Đầu độc bộ nhớ agent (ElizaOS) | Thành công 55,1% | https://arxiv.org/html/2503.16248v3 |
| Lỗi SDK x402 | 25 lỗ hổng, 3 nghiêm trọng | https://labs.cloudsecurityalliance.org/research/csa-research-note-x402-agent-payment-sdk-flaws-20261025-csa/ |
| Chữ ký x402 không gắn với món hàng | Tráo hàng 100/100; 38% trong 915 người bán | https://arxiv.org/abs/2605.30998 |
| Uy tín ERC-8004 bị làm giả | 90,6% người đánh giá trên Base là Sybil | https://arxiv.org/abs/2606.26028 |
| Đầu độc mô tả công cụ MCP | Thành công tới 72,8% | https://arxiv.org/abs/2508.14925 |
| Ví Grok/Bankr, 5/2026 | Mất khoảng 155–174 nghìn USD | https://cointelegraph.com/news/grok-bankr-wallet-free-nft-prompt-injection |

## Giải pháp đã có (để trả lời "khác gì")

| Tên | Điều đã biết | Mức |
|---|---|---|
| Kite Passport | L1 Avalanche cho thanh toán agent; tài liệu của họ mô tả session key và giới hạn do smart contract thực thi (ERC-4337, vault dạng proxy nâng cấp được). Tài liệu quảng bá cũng viết "enforced at protocol level" | CHƯA KIỂM: chỉ đọc qua trích đoạn. Xác minh trước khi nói trên sân khấu |
| 402Guard | SDK giới hạn chi tiêu x402 phía client, có registry trên Fuji; làm cho Hack2Build x402 | ĐÃ KIỂM 14/11, đọc tài liệu của họ |
| Coinbase Agentic Wallets, MetaMask ERC-7715, Privy, Turnkey | Hạn mức theo phiên hoặc theo thời gian, do máy chủ nhà cung cấp hoặc contract tài khoản thực thi | CHƯA KIỂM lại |
| Freysa, Gray Swan Arena, Zengo, Sonic jailbreak | Thử thách "phá ví này" dạng trò chơi hoặc cuộc thi một lần | CHƯA KIỂM lại |

## Pháp lý Việt Nam (cách đội tự đọc, không phải tư vấn pháp lý)

- Nghị quyết 05/2025/NQ-CP: giao dịch tài sản mã hoá trong phạm vi thí điểm dùng đồng Việt Nam. Hệ quả: mọi nơi ghi "tài sản testnet, không có giá trị quy đổi, không phải dịch vụ thanh toán".
- Thử thách mở: không thu phí, phần thưởng là tài sản testnet do đội bỏ ra, mục tiêu thuộc về đội và đội công khai uỷ quyền bằng trang luật.

## Cuộc thi

- Trang: https://team1vn.xyz · Nộp bài: https://team1vn.xyz/dashboard.html · Faucet: https://team1vn.xyz/faucet.html
- Builder Hub: https://build.avax.network · Tạo L1: https://build.avax.network/console/create-l1
- Nhóm hỗ trợ: https://t.me/Team1VNbuilders
- Bản đề xuất đầy đủ (kịch bản demo, câu hỏi khó của giám khảo): chủ dự án giữ link riêng.
