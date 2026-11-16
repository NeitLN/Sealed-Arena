# ARCHITECTURE

Tài liệu này chỉ ghi các contract giữa các thành phần và các quyết định mà hai task có thể làm mâu thuẫn nhau.
Chi tiết bên trong mỗi thành phần do người code quyết định trong phạm vi phiếu việc.
Điều nào đánh dấu **[cần kiểm]** là thiết kế dự kiến, phải được xác nhận ở task nêu kèm; dấu chỉ được bỏ trong PR của task đó, kèm bằng chứng, sau khi người review kiểm.

## 1. Tổng quan

```
Fuji C-Chain                              L1 Sealed (Subnet-EVM đã sửa)
+------------------------+   ICTT   +--------------------------------------------+
| ERC20TokenHome (USDC)  | -------> | USDC là coin gốc (NativeTokenRemote)       |
| ReputationReceiver     | <------- | ArenaRecorder                              |
|   -> registry ERC-8004 |   ICM    | AgentPolicy (precompile, lưu uỷ quyền)     |
+------------------------+          | Quy tắc hợp lệ: preCheck + txpool          |
                                    | TxAllowList, ContractDeployerAllowList     |
                                    +--------------------------------------------+
Ngoài chain: facilitator x402, người bán mẫu, agent mua hàng, cổng RPC (ghi lượt thử), web (chủ ví, thử thách)
```

## 2. Bố cục repo

| Thư mục | Chứa gì | Công cụ |
|---|---|---|
| `chain/` | Bản vá lên avalanchego, precompile AgentPolicy, genesis, Dockerfile build node | Go, chạy trong Docker |
| `contracts/` | ArenaRecorder, ReputationReceiver, PolicyWallet (bậc 2), ví đối chứng O | Solidity, Foundry trong Docker |
| `services/facilitator/` | Facilitator x402 cho phương thức `signed-native-tx` | TypeScript |
| `services/seller/` | Người bán mẫu trả 402 | TypeScript |
| `services/agent/` | Agent mua hàng (vòng lặp LLM gọi công cụ) | TypeScript |
| `services/rpc-gateway/` | Cổng RPC công khai: lọc phương thức, giới hạn tốc độ, ghi lượt thử | TypeScript |
| `services/attacks/` | Bộ tấn công và trình chạy đánh giá | TypeScript |
| `packages/shared/` | ABI, địa chỉ, kiểu dữ liệu, hàm mã hoá dùng chung | TypeScript |
| `web/` | Dashboard chủ ví, trang thử thách, trang so sánh | Next.js |
| `infra/` | docker-compose, cấu hình relayer, reverse proxy | |
| `scripts/` | `check.sh` (bộ kiểm nhanh), script dựng mạng local | bash |

Quy tắc ranh giới:
- `chain/` không phụ thuộc gì ngoài avalanchego. Không có code TypeScript trong `chain/`.
- Mọi service và `web/` lấy ABI, địa chỉ, chain id từ `packages/shared/`. Không chép địa chỉ vào từng service.
- Bản vá avalanchego lưu dưới dạng file `.patch` trong `chain/patches/` áp lên một tag cố định, **không** chép cả cây mã nguồn avalanchego vào repo. Lý do: giám khảo đọc được đúng phần đội viết, repo nhỏ.

## 3. L1 Sealed

- Nền: avalanchego tag `v1.15.3`, VM là `graft/subnet-evm` trong chính repo đó (kho `precompile-evm` đã bị lưu trữ, không dùng).
- Chain id: `261126`. Tên: `Sealed`. Ký hiệu coin gốc: `USDC` (18 chữ số thập phân ở tầng EVM).
- Precompile bật từ genesis: TxAllowList, ContractDeployerAllowList, NativeMinter, Warp, AgentPolicy. secp256r1 (ACP-204, `0x100`) có sẵn trên Subnet-EVM ở tag này từ nâng cấp Granite: đã kiểm ở T04 bằng `eth_call` trên mạng local (`docs/decisions/D4.md`). AgentPolicy không gọi sang `0x100`; nó kiểm P-256 bằng thư viện chuẩn của Go.
- TxAllowList: chỉ các địa chỉ sau được gửi giao dịch: admin, người triển khai contract, relayer (gửi hộ thao tác passkey của chủ ví), facilitator, relayer ICM, và mỗi địa chỉ agent đã đăng ký.
- ContractDeployerAllowList: chỉ admin và người triển khai. Agent không bao giờ có trong danh sách này.
- Phí: phí cơ sở tối thiểu đặt thấp. Người gửi trả gas bằng coin gốc.
- Không bật bất kỳ cơ chế uỷ quyền tài khoản nào (không EIP-7702).

### 3.1 Quy tắc hợp lệ (phần lõi)

Chèn ở đúng hai chỗ, ngay cạnh kiểm tra TxAllowList có sẵn (đã xác nhận vị trí trên tag `v1.15.3` ở T02, `docs/decisions/D1.md`):

| File (trong `graft/subnet-evm/`) | Hàm | Dòng tham chiếu | Việc phải làm |
|---|---|---|---|
| `core/state_transition.go` | `(*StateTransition).preCheck()` | kiểm TxAllowList ở dòng 254–258 (trong khối `if !msg.SkipAccountChecks`, dòng 233) | Kiểm quy tắc. Lỗi trả về ở đây làm giao dịch không hợp lệ. Nếu qua, ghi bộ đếm |
| `core/txpool/validation.go` | `ValidateTransactionWithState()` | kiểm TxAllowList ở dòng 281–286 | Kiểm quy tắc ở chế độ chỉ đọc, không ghi bộ đếm |

Điều kiện bật: `IsPrecompileEnabled(agentpolicy.ContractAddress, time)`, giống hệt cách TxAllowList làm, để mọi node bật ở cùng một block.

Với giao dịch có `from` là agent đã đăng ký, giao dịch hợp lệ khi **tất cả** điều sau đúng:
1. `to` khác rỗng (không tạo contract).
2. `to` nằm trong danh sách người nhận của uỷ quyền.
3. `to` không có code.
4. Agent không bị dừng (`frozen == false`).
5. `block.timestamp < expiry`.
6. `charge = value + gasLimit × gasFeeCap`. `charge ≤ perTxCap`.
7. `spentToday + charge ≤ dailyCap`, với `spentToday` về 0 khi `block.timestamp / 86400` đổi.

Khi qua (chỉ ở `preCheck`): `spentToday += charge`, `totalCharged += charge`. Tính theo mức tối đa, không hoàn lại phần gas không dùng. Đây là chủ ý: bộ đếm luôn lớn hơn hoặc bằng số tiền thực sự rời tài khoản.

`from` không phải agent đã đăng ký: quy tắc không áp, chỉ còn TxAllowList.

Lỗi trả về dùng các biến lỗi riêng (`ErrAgentPayeeNotAllowed`, `ErrAgentBudgetExceeded`, `ErrAgentFrozen`, `ErrAgentMandateExpired`, `ErrAgentContractCreation`, `ErrAgentPayeeHasCode`, `ErrAgentTxTypeNotAllowed`) để cổng RPC và giao diện hiển thị đúng lý do.
Chuỗi lỗi qua RPC có tiền tố `agent:` (ví dụ `agent: payee not allowed: 0x…`, `agent: budget exceeded: …`, `agent: frozen`). Agent chỉ được gửi giao dịch loại 0, 1, 2; loại khác trả `ErrAgentTxTypeNotAllowed` (T05).

Đã triển khai ở T05 (`chain/patches/0003-agent-rule.patch`): hàm chung `core.CheckAgentTx`. `preCheck` kiểm ngay sau TxAllowList và ghi bộ đếm ở bước cuối, sau `buyGas`. Txpool kiểm chỉ đọc theo `max(thời gian block đầu chain, đồng hồ máy)` (trường `Time` mới của `ValidationOptionsWithState`, hàm `txpool.PoolTime`), để sang ngày mới thì pool nhận lại thanh toán kể cả khi chain đứng yên; `preCheck` luôn dùng thời gian block.

Precompile có trạng thái (dải `0x02…`, `0x03…`, kể cả AgentPolicy) có code giữ chỗ, nên điều kiện 3 từ chối chúng. Precompile gốc của EVM (`0x01`–`0x0a`, `0x100`) không có code trong state: chủ ví có thể đưa chúng vào danh sách người nhận, và một lời gọi tới chúng có thể thất bại lúc thực thi. Khi đó giao dịch vẫn vào block với receipt thất bại và vẫn bị tính đủ `charge` (bộ đếm được ghi trong `preCheck`, trước khi thực thi). Coin gửi tới địa chỉ precompile thì không lấy lại được; giao diện chủ ví nên cảnh báo khi danh sách người nhận có địa chỉ precompile.

**Bất biến dùng để phát hiện vi phạm** (ArenaRecorder dựa vào đây):
`balance(agent) ≥ tổng tiền đã nạp cho agent − totalCharged(agent)`.
Mọi đường làm tiền rời tài khoản mà không qua quy tắc sẽ phá bất biến này.
Ngoài quy tắc (không phải giao dịch): state upgrade (`stateupgrade/state_upgrade.go:33–44`) và genesis `alloc` có thể đổi số dư hoặc code của agent. Đây là quyền của người vận hành; README phải cam kết không phát hành state upgrade nào đụng tới địa chỉ agent (D1).

Rủi ro đã biết phải có test:
- Txpool kiểm trên trạng thái hiện tại, nên nhiều giao dịch đang chờ có thể cùng qua txpool. Khi vào block, giao dịch vượt ngân sách phải bị `preCheck` loại và bị người dựng block bỏ qua, không làm hỏng block. Đã kiểm ở T02 bằng đọc mã: người dựng block gặp lỗi thì bỏ giao dịch và các giao dịch sau của cùng người gửi, dựng tiếp (`miner/worker.go:469–484`, D1 câu 4). Test 20 giao dịch đồng thời là việc của T05.
- Ở tag này Subnet-EVM **không** dùng cơ chế thực thi tách khỏi đồng thuận (ACP-194 chỉ dùng cho C-Chain qua `vms/saevm`). Lỗi ở `preCheck` làm block không hợp lệ: đã kiểm ở T02 (`docs/decisions/D1.md`).
- `eth_call` và `eth_estimateGas` chạy với `SkipAccountChecks: true` nên không áp quy tắc. Không dùng chúng để đoán giao dịch có hợp lệ không.
- Hai node chạy bản khác nhau sẽ tách chain. Mọi node dùng cùng một image.

### 3.2 Precompile AgentPolicy

Địa chỉ: `0x0300000000000000000000000000000000000001`, trong dải `0x0300…00–0x0300…ff` dành cho precompile tự định nghĩa (`precompile/modules/registerer.go:22–35`). Khoá cấu hình genesis: `"agentPolicyConfig": {"blockTimestamp": 0}` trong `config`. Đã kiểm ở T04 (`docs/decisions/D4.md`).

Giao diện (Solidity, dùng để sinh binding và để web gọi):

```solidity
interface IAgentPolicy {
    struct Mandate {
        address[] payees;     // tối đa 16
        uint256 perTxCap;     // đơn vị wei của coin gốc
        uint256 dailyCap;
        uint64  expiry;       // unix giây
    }

    // Đăng ký một lần. agentSig là chữ ký secp256k1 của chính khoá agent trên
    // keccak256(abi.encode("SealedArena:register", chainId, agent, ownerX, ownerY)).
    function register(address agent, bytes32 ownerX, bytes32 ownerY, bytes calldata agentSig) external;

    // Chỉ khoá passkey của chủ ví đổi được. auth là bằng chứng WebAuthn (mục 3.3).
    function setMandate(address agent, Mandate calldata m, uint256 nonce, bytes calldata auth) external;
    function freeze(address agent, uint256 nonce, bytes calldata auth) external;
    function unfreeze(address agent, uint256 nonce, bytes calldata auth) external;

    function isAgent(address agent) external view returns (bool registered);
    function getMandate(address agent) external view returns (Mandate memory m, bool frozen);
    function getSpend(address agent) external view returns (uint256 spentToday, uint64 dayIndex, uint256 totalCharged);
    function ownerNonce(address agent) external view returns (uint256 nonce);
    function ownerKey(address agent) external view returns (bytes32 x, bytes32 y);

    event AgentRegistered(address indexed agent, bytes32 ownerX, bytes32 ownerY);
    event MandateSet(address indexed agent, uint256 perTxCap, uint256 dailyCap, uint64 expiry, uint256 payeeCount);
    event Frozen(address indexed agent);
    event Unfrozen(address indexed agent);
}
```

Quyết định đã chốt:
- `register` chỉ chạy được một lần cho mỗi agent, và cần chữ ký của chính khoá agent. Người cầm key công khai không đăng ký lại được vì agent đã đăng ký.
- Mọi thay đổi sau đó chỉ cần chữ ký passkey của chủ ví, ai gửi giao dịch cũng được (relayer gửi hộ). Khoá agent không đổi được uỷ quyền.
- `nonce` phải bằng `ownerNonce(agent)` và tăng 1 sau mỗi thao tác thành công, để chống phát lại.
- Một agent mới đăng ký chưa có uỷ quyền: mọi giao dịch của nó đều không hợp lệ cho tới khi `setMandate`.
- Không có hàm nào cho phép gỡ đăng ký.
- `register` ai đến trước thì được, chỉ cần khoá agent. Agent thử thách phải được đăng ký và đặt uỷ quyền **trước** khi khoá được công khai; nếu không, người cầm khoá đăng ký passkey của chính họ (T06, T11).
- Precompile không kiểm `rpIdHash` hay `origin` trong bằng chứng WebAuthn (đúng 3.3). Trang nào lừa được chủ ví ký đúng challenge của mình cũng tạo được bằng chứng hợp lệ. Ghi vào giới hạn ở T09.
- Tên giá trị trả về `registered` và `nonce` được thêm ở T04 cho công cụ sinh khung; selector và cách mã hoá không đổi.
- `getSpend` trả bộ đếm tính theo thời điểm block hiện tại: sang ngày UTC mới thì `spentToday` đọc là 0 và `dayIndex` là ngày hiện tại, khớp với cách quy tắc sẽ áp ở T05.
- `register` cần chữ ký 65 byte `r || s || v` (v là 0, 1, 27 hoặc 28), `s` ở nửa thấp.
- Lỗi của precompile (chuỗi trả về qua RPC, tiền tố `agentpolicy:`): `ErrNotRegistered`, `ErrAlreadyRegistered`, `ErrBadAgentSignature`, `ErrBadOwnerKey`, `ErrBadNonce`, `ErrBadAuthEncoding`, `ErrBadClientData`, `ErrBadClientDataType`, `ErrChallengeMismatch`, `ErrUserNotPresent`, `ErrHighS`, `ErrBadOwnerSignature`, `ErrTooManyPayees`, `ErrPerTxAboveDaily`, `ErrNonceExhausted`, `ErrAuthTooLarge` (`auth` tối đa 2048 byte).
- Hàm Go nội bộ cho T05 (không có trong ABI): `GetMandateForRule(state, agent)` chỉ đọc; `SpendForDay(state, agent, timestamp)` chỉ đọc; `ChargeSpend(state, agent, charge, timestamp)` ghi bộ đếm.

### 3.3 Bằng chứng WebAuthn (`auth`)

`auth = abi.encode(bytes authenticatorData, bytes clientDataJSON, bytes32 r, bytes32 s)`.

Thông điệp chủ ví ký (challenge), mã hoá base64url trong `clientDataJSON.challenge`:
- setMandate: `keccak256(abi.encode("SealedArena:setMandate", chainId, agent, keccak256(abi.encode(m)), nonce))`
- freeze: `keccak256(abi.encode("SealedArena:freeze", chainId, agent, nonce))`
- unfreeze: `keccak256(abi.encode("SealedArena:unfreeze", chainId, agent, nonce))`

Precompile kiểm: `auth` mã hoá đúng chuẩn (mã hoá lại phải ra đúng các byte đó), `clientDataJSON` là một object JSON duy nhất không có khoá trùng tên ở tầng đầu và có `type`, `challenge` là chuỗi, `clientDataJSON.type == "webauthn.get"`, challenge khớp, `authenticatorData` dài ít nhất 37 byte và cờ User Present bật, rồi kiểm chữ ký P-256 trên `sha256(authenticatorData || sha256(clientDataJSON))` với `(ownerX, ownerY)`. Bắt `s` ở nửa thấp để chống biến dạng chữ ký.

Hàm mã hoá challenge ở phía TypeScript đặt trong `packages/shared/` và phải có test đối chiếu với Go bằng cùng bộ vector.

### 3.4 Bản trên Fuji (T12)

Mã định danh và địa chỉ: `services/fuji-ops/deployments/fuji.json`.

- Genesis `chain/genesis/sealed-fuji.json`, sinh từ bản local bằng `chain/genesis/make-fuji.mjs`: khoá vai riêng cho Fuji, cấp rất ít coin, TeleporterMessenger cài sẵn ở `0x253b…5fcf` (bytecode ghim bằng sha256), Warp bật sau Durango và nhận message từ C-Chain khi có chữ ký của validator mạng chính (`requirePrimaryNetworkSigners: true`). Chain id, các precompile và AgentPolicy giữ nguyên.
- L1 quản lý validator kiểu PoA. Hợp đồng ValidatorManager đặt trên Fuji C-Chain (không cần proxy trong genesis), khởi tạo ngay sau khi triển khai. Một validator; số dư validator do ví vận hành nạp qua P-Chain.
- Coin gốc là USDC của Fuji chuyển sang qua ICTT: ERC20TokenHome trên C-Chain giữ USDC, NativeTokenRemote trên L1 tạo coin qua NativeMinter. Coin trong genesis được thế chấp 1:1 bằng USDC trước khi cầu mở. Relayer ICM tự chạy.
- Ra Internet chỉ có: RPC của L1 (`POST /rpc`), relayer passkey (`/relayer/*`), qua HTTPS (Caddy, Let's Encrypt). Cổng RPC của node không mở. Trang chủ ví chạy trên Vercel; relayer chỉ nhận trình duyệt từ tên miền của trang.
- Relayer chỉ gửi `register` cho agent đã có quyền gửi giao dịch (TxAllowList), để không bị rút gas.

## 4. Thanh toán x402 trên L1

Chuẩn `exact` của x402 trên EVM chỉ có ba phương thức (EIP-3009, Permit2, ERC-7710); coin gốc không dùng được cả ba. Dự án thêm một phương thức mới.

- `scheme`: `exact`. `network`: `eip155:261126`. `asset`: `native`.
- `extra.assetTransferMethod`: `signed-native-tx`.
- `extra`: `{ assetTransferMethod: "signed-native-tx", paymentFlow: "upfront", requestId, resourceUrl }`. `requestId` (32 byte ngẫu nhiên) cấp mới cho mỗi phản hồi 402.
- Payload người mua gửi: `{ "signedTransaction": "0x..." }`, là giao dịch L1 (EIP-1559) đã ký bởi khoá agent với:
  - `to` = `payTo` của người bán, `value` = `amount`,
  - `data` = `keccak256(abi.encode(resourceUrl, requestId))` (32 byte), `requestId` do người bán cấp trong phản hồi 402.
- Facilitator `/verify`: giải mã, kiểm chain id, `to`, `value`, `data`, chữ ký; kiểm giao dịch chưa được phát và nonce đúng nonce kế tiếp; kiểm số dư đủ `value + gas × maxFeePerGas`; với agent đã đăng ký, đọc `getMandate`/`getSpend` (qua `eth_call`) và chạy lại quy tắc ở mục 3.1 theo đúng thứ tự (`precheckMandate` trong `packages/shared/src/x402.ts`) để báo trước lý do từ chối. Không giữ tiền, không giữ khoá của ai.
- Facilitator `/settle`: kiểm lại như `/verify`, `eth_sendRawTransaction`, chờ receipt, trả hash. Hai lần settle cùng một giao dịch cùng lúc chỉ một lần được phát.
- Người bán giữ điều khoản của chính mình theo `requestId` (không dùng bản người mua gửi lại), đánh dấu `requestId` đã dùng trước khi gọi facilitator, và chỉ giao hàng sau khi `/settle` thành công **và** tự đọc chain thấy receipt thành công với `to`, `value`, `data` đúng như đã cấp.
- Mã lý do, cách dùng SDK `@x402/core` (facilitator đăng ký qua `x402Facilitator.register`; người bán và client dùng hàm mã hoá header của SDK): xem `docs/decisions/D5.md`.

Hệ quả phải ghi trong README: người bán phải thêm mạng L1 và trỏ sang facilitator này.

## 5. ArenaRecorder (Solidity, trên L1)

- `enroll(agent)` (chỉ admin): đưa agent vào thử thách.
- `fund(agent)` payable: nạp coin gốc cho agent qua recorder để cộng `funded[agent]`. Tiền gửi thẳng cho agent không được tính.
- `checkpoint(agent)` (ai cũng gọi được): kiểm bất biến ở mục 3.1 dưới dạng `balance(agent) ≥ funded − (totalCharged − totalCharged lúc enroll)`; nếu giữ thì cộng `score += min(balance, funded − charged) × (now − lastCheckpoint)`. Bất biến vỡ thì ghi `breached = true`, `score = 0`, ghi người gọi là người tìm ra, phát `Breach`. Vi phạm là vĩnh viễn: sau đó `checkpoint` không đổi gì, `fund` bị từ chối.
- `reportBreach(agent)`: như `checkpoint`, tên dành cho người đi tìm vi phạm.
- `publish(agent)`: `checkpoint` rồi gửi `abi.encode(agent, score, breached, lastCheckpoint, block.chainid)` qua `IReputationPublisher` do admin đặt (`setPublisher`). Adapter Teleporter tới ReputationReceiver trên Fuji làm ở T13.
- `enroll` đòi agent đã đăng ký trong AgentPolicy. Số dư agent đang có lúc enroll được tính vào `funded` (để nó không che được khoản rò sau này); khoản đã tính trước khi enroll không được trừ.
- Giới hạn: tiền gửi thẳng cho agent sau khi enroll không tăng `funded` và không tăng điểm, nhưng làm tăng `balance`, nên một khoản rò nhỏ hơn số tiền gửi thẳng sẽ không lộ ra. Thử thách chỉ nạp tiền qua `fund`. Tương tự, quy tắc tính gas theo mức tối đa, nên phần gas không dùng tạo một độ hở nhỏ (khoảng 0,0034 coin sau toàn bộ bộ leaked-key): khoản rò nhỏ hơn độ hở này không lộ ra.
- Đã triển khai ở T10: `contracts/src/ArenaRecorder.sol`, ABI ở `packages/shared/src/arenaRecorderAbi.ts`.
- Số lượt thử không nằm trong contract (giao dịch bị từ chối không vào chain). Cổng RPC đếm ở ngoài chain và giao diện ghi rõ đó là số đo ngoài chain.

ReputationReceiver (Fuji C-Chain): chỉ nhận tin từ Teleporter với nguồn là đúng chain id và đúng địa chỉ ArenaRecorder; ghi vào registry ERC-8004. **[cần kiểm T13]** chữ ký hàm ghi của registry đang triển khai trên Fuji (reputation hay validation), đọc từ ABI thật, không viết theo trí nhớ.

Bản ghi sống sót chỉ đáng tin bằng địa chỉ ReputationReceiver. README phải nói điều này.

## 6. Cổng RPC

- Là điểm duy nhất người ngoài chạm vào L1. Node RPC đứng sau nó, không phải validator.
- Chỉ cho: `eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_getTransactionCount`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_getCode`, `eth_getLogs` (giới hạn dải block), `eth_sendRawTransaction`, `net_version`.
- Với `eth_sendRawTransaction`: giải mã người gửi; ghi một dòng `{thời điểm, from, to, value, kết quả, lý do}` vào kho lượt thử. Không ghi IP dạng rõ.
- Giới hạn tốc độ theo IP.
- API đọc: `GET /attempts/summary` trả tổng lượt thử, số bị từ chối theo lý do, số người gửi phân biệt (theo hash của IP).

Đã triển khai ở T11 (`services/rpc-gateway`): batch tối đa 20 yêu cầu, `eth_getLogs` tối đa 2048 block, 120 yêu cầu/phút và 20 `eth_sendRawTransaction`/phút cho mỗi khách; lượt thử lưu bằng `node:sqlite`; IP chỉ lưu dưới dạng HMAC-SHA256 có muối bí mật (`GATEWAY_IP_SALT`). `GET /attempts/recent` trả các lượt gần nhất (không có hash IP); cả hai API đọc nhận `?from=<địa chỉ>` để lọc theo agent.

Trang `/arena` và `/arena/rules` (web). Người chơi không có trong TxAllowList, nên `checkpoint` và `reportBreach` của ArenaRecorder đi qua relayer (`POST /relayer/arena`, relayer tự dựng calldata); trên chain người gọi là relayer. Agent thử thách được đăng ký dưới một khoá chủ ví P-256 bí mật (không dùng khoá thử công khai), uỷ quyền tới hai người nhận do đội giữ khoá.

## 7. Khoá và vai

| Khoá | Ở đâu | Dùng để |
|---|---|---|
| Admin L1 | `.env` trên máy vận hành | Quản lý allow-list, enroll agent |
| Người triển khai | `.env` | Triển khai contract |
| Relayer | `.env` của `services/relayer` (`RELAYER_PRIVATE_KEY`; trên mạng local mặc định là khoá dev) | Gửi hộ thao tác passkey của chủ ví |
| Facilitator | `.env` của facilitator | Phát giao dịch đã ký của agent (không cần tiền nếu chỉ `sendRawTransaction`) |
| Relayer ICM | cấu hình relayer | Chuyển tin ICM |
| Agent thử thách | **công khai có chủ đích** trên trang thử thách | Bị tấn công |
| Agent demo riêng | `.env` | Demo luồng mua hàng bình thường |
| Passkey chủ ví | thiết bị của chủ ví | Đặt uỷ quyền, dừng |

Không dùng lại khoá agent thử thách cho bất kỳ vai nào khác, trên bất kỳ chain nào.

### 7.1 Trang chủ ví và relayer (T09)

- `web/` (Vite, React, thư viện giao diện Astryx): chủ ví tạo passkey (WebAuthn, ES256), gắn agent, đặt uỷ quyền, dừng và mở lại. Trang đọc chain trực tiếp qua RPC. Giao diện song ngữ Anh/Việt.
- Passkey: `(x, y)` lấy từ `getPublicKey()` (SPKI P-256). Chữ ký DER của trình duyệt được đổi sang `(r, s)` với `s` ở nửa thấp, rồi thành `auth` theo mục 3.3 (`packages/shared/src/webauthn.ts`). RP ID là tên miền của trang, nên trang phải chạy trên tên miền (hoặc `localhost`), không chạy trên địa chỉ IP.
- Gắn agent: khoá agent ký `registerDigest` (hash thô, không tiền tố). Trên mạng local được dán private key của agent để ký ngay trong trình duyệt; khoá không được gửi đi.
- `services/relayer` (Hono): `POST /relay { data }` chỉ nhận `register`, `setMandate`, `freeze`, `unfreeze` tới `0x0300…01`; chạy thử bằng `eth_call` trước, nếu chain sẽ từ chối thì trả lý do và không gửi; giới hạn 10 yêu cầu/phút mỗi địa chỉ khách. `GET /info` trả địa chỉ relayer, chain id và URL RPC cho trang. Relayer không làm giả được thao tác (precompile kiểm passkey) nhưng có thể từ chối gửi; khi đó ai cũng có thể tự gửi cùng dữ liệu.

## 8. Quy ước

- Tiền: số nguyên wei của coin gốc (18 chữ số). Hiển thị quy đổi về USDC 6 chữ số chỉ ở giao diện. Không dùng số thực.
- Thời gian: unix giây, UTC. "Ngày" của ngân sách là `timestamp / 86400` theo UTC. Giao diện ghi rõ ngân sách đặt lại lúc 07:00 giờ Việt Nam.
- Cấu hình qua biến môi trường; mỗi service có `.env.example`.
- Mọi contract Solidity và mọi nhánh của quy tắc Go có test cho cả hai chiều: trường hợp được phép chạy được, trường hợp bị cấm bị chặn.
- Tên lỗi, tên sự kiện, tên trường trong tài liệu này là contract. Đổi tên phải qua người review và cập nhật tài liệu này.

## 9. Phương án lùi

| Bậc | Lớp thực thi | Còn giữ | Phải bỏ |
|---|---|---|---|
| 1 | Bản vá Subnet-EVM + AgentPolicy (mục 3) | Toàn bộ | Không |
| 2 | Subnet-EVM gốc. Contract `PolicyWallet` giữ coin gốc và áp cùng bộ quy tắc ở mục 3.1 khi agent gọi `pay(to, amount, ref)`. Ví agent chỉ nhận nhỏ giọt phí gas, có trong TxAllowList, không có trong ContractDeployerAllowList. Passkey kiểm bằng `0x100` hoặc thư viện Solidity | L1 riêng, ICTT, allow-list, ICM, thử thách key công khai, ERC-8004 | Câu "giao dịch không hợp lệ". Phải nói: "ví chính sách trên L1 riêng" |
| 3 | Ví hạn mức trên Fuji C-Chain theo cơ chế giữ chỗ rồi mới thanh toán, x402 chuẩn với USDC | Hạn mức giữ khi gửi đồng thời; người bán không sửa gì | L1 riêng là thành phần chịu lực |

Ở mọi bậc, giao diện giữa lớp thực thi và phần còn lại là: `getMandate`, `getSpend`, `setMandate/freeze` bằng passkey, và bất biến `balance ≥ funded − totalCharged`. Agent, người bán, facilitator, web, ArenaRecorder và bộ tấn công không phải viết lại khi đổi bậc; chỉ đổi adapter trong `packages/shared/`.

Điều kiện lùi xuống bậc 2: tới cuối ngày 19/11, T05 chưa có kết quả `PASS` trên mạng local nhiều node, hoặc T02 kết luận lỗi ở `preCheck` không làm giao dịch bị loại khỏi block.
