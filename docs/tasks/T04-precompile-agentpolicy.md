# T04: Precompile AgentPolicy
Mốc: M1 · Ngày mục tiêu: 17/11 · Nhánh: `task/T04-agentpolicy` · Phụ thuộc: T01 (chặn bắt đầu) · Mức: Full
Trả lời quyết định **D4**. Có thể làm song song với T02 về mặt logic, nhưng chỉ một task `đang làm` mỗi lúc.

## Mục tiêu
Một precompile có trạng thái lưu uỷ quyền của từng agent và chỉ cho khoá passkey của chủ ví thay đổi nó. Task này **chưa** nối precompile vào quy tắc hợp lệ (đó là T05).

Contract phải theo: `docs/ARCHITECTURE.md` mục 3.2 và 3.3. Tên hàm, sự kiện, định dạng thông điệp ở đó là bắt buộc.

## Sở hữu
- `chain/patches/0002-agentpolicy-precompile.patch` (thư mục `precompile/contracts/agentpolicy/` trong cây avalanchego, và phần đăng ký module)
- `chain/abi/IAgentPolicy.sol`, `chain/abi/IAgentPolicy.json`
- `packages/shared/src/agentPolicy.ts` (ABI, hàm mã hoá challenge, hàm mã hoá `auth`) và test của nó
- `chain/testvectors/webauthn.json` (bộ vector dùng chung cho test Go và test TypeScript)

## Phải kiểm trước khi làm (ghi vào "Bàn giao")
1. Cách viết và đăng ký một precompile có trạng thái ở tag `v1.15.3`: lấy `txallowlist` và `nativeminter` làm mẫu; tìm công cụ sinh khung (nếu còn) và tài liệu trong `graft/subnet-evm/precompile/`.
2. Dải địa chỉ dành cho precompile tự định nghĩa. Xác nhận hoặc sửa địa chỉ `0x0300000000000000000000000000000000000001`.
3. Cách bật precompile trong genesis và cách gán tham số khởi tạo.
4. Cách tính gas cho precompile; đặt gas đủ cao cho kiểm P-256 và SHA-256.
5. ACP-204 (`0x100`) có trên Subnet-EVM ở tag này không. Dù có hay không, precompile này kiểm P-256 bằng thư viện chuẩn của Go, không gọi sang `0x100`. Ghi kết quả vì T09 và bậc 2 cần biết.

## Việc phải làm
1. Lưu trữ theo agent: `ownerX`, `ownerY`, `ownerNonce`, danh sách người nhận (tối đa 16), `perTxCap`, `dailyCap`, `expiry`, `frozen`, `spentToday`, `dayIndex`, `totalCharged`, cờ đã đăng ký.
2. Hàm ghi: `register`, `setMandate`, `freeze`, `unfreeze`. Hàm đọc: `isAgent`, `getMandate`, `getSpend`, `ownerNonce`, `ownerKey`.
3. Kiểm WebAuthn đúng mục 3.3: `type`, challenge, cờ User Present, chữ ký P-256 với `s` ở nửa thấp, điểm khoá công khai nằm trên đường cong.
4. Phân tích `clientDataJSON` phải chặt: tìm đúng trường `challenge` và `type`, không chấp nhận JSON có trường trùng tên.
5. Hàm nội bộ cho T05 dùng, không lộ ra ABI:
   - `GetMandateForRule(state, agent)` chỉ đọc;
   - `ChargeSpend(state, agent, charge, timestamp)` ghi bộ đếm.
   Ở task này chỉ viết và test, chưa ai gọi.
6. Bộ vector WebAuthn: sinh bằng một khoá P-256 thử, gồm trường hợp hợp lệ và từng trường hợp lỗi. Test Go và test TypeScript cùng đọc file này.

## Tiêu chí chấp nhận
Mỗi dòng là ít nhất một test Go:
- [ ] `register` với chữ ký agent đúng: thành công, phát `AgentRegistered`. Chữ ký sai: từ chối. Đăng ký lần hai: từ chối.
- [ ] `register` với điểm `(ownerX, ownerY)` không nằm trên đường cong: từ chối.
- [ ] `setMandate` với bằng chứng passkey đúng: thành công, `ownerNonce` tăng 1.
- [ ] `setMandate` bị từ chối khi: sai khoá; sai challenge; nonce cũ (phát lại); nonce tương lai; bằng chứng của agent A dùng cho agent B; chain id khác; `type` không phải `webauthn.get`; cờ User Present tắt; `s` ở nửa cao; hơn 16 người nhận; `perTxCap > dailyCap`.
- [ ] `freeze` và `unfreeze`: đúng khoá thì chạy, sai thì từ chối; bằng chứng `freeze` không dùng được cho `unfreeze`.
- [ ] Không hàm nào cho khoá agent đổi được uỷ quyền.
- [ ] `ChargeSpend`: cộng dồn trong ngày; sang ngày mới `spentToday` về 0 còn `totalCharged` giữ nguyên.
- [ ] Hàm đọc gọi được ở chế độ chỉ đọc; hàm ghi bị từ chối ở chế độ chỉ đọc.
- [ ] Test TypeScript: challenge và `auth` do `packages/shared` sinh ra khớp từng byte với vector mà test Go chấp nhận.
- [ ] `bash chain/scripts/test.sh` và `bash scripts/check.sh` → `PASS`.

## Ngoài phạm vi
Nối vào `preCheck` (T05). Genesis thật (T06). Giao diện (T09).

## Bàn giao

**Địa chỉ precompile cuối cùng: `0x0300000000000000000000000000000000000001`. `0x100`: có trên L1 ở tag này (từ Granite).** Chi tiết và bằng chứng: `docs/decisions/D4.md`.

### Kết quả "Phải kiểm trước khi làm"
1. Cách viết: thư mục `precompile/contracts/<tên>/` với `module.go` (đăng ký trong `init()`), `config.go`, `contract.go`; import trong `precompile/registry/registry.go`. Có công cụ sinh khung `cmd/precompilegen --abi --type --pkg --out` (đã dùng; nó đòi mọi giá trị trả về trong ABI phải có tên).
2. Dải địa chỉ: `0x0300…00–0x0300…ff` dành cho precompile tự định nghĩa (`precompile/modules/registerer.go:22–35`). Xác nhận `0x0300…01`.
3. Bật trong genesis: `"agentPolicyConfig": {"blockTimestamp": 0}` trong `config` (khoá `ConfigKey` ở `module.go`). Không có tham số khởi tạo nào khác. Đã thử bật tạm trên mạng local (D4).
4. Gas: mỗi hàm một hằng số trong `contract.go`, trừ trước khi chạy (`contract.DeductGas`), cộng gas sự kiện. Đặt: `setMandate` 500.000 (P-256, SHA-256, tới 21 ô lưu trữ), `register` 80.000, `freeze`/`unfreeze` 60.000, `getMandate` 30.000, `getSpend` 5.000, `ownerKey` 3.000, `isAgent`/`ownerNonce` 2.000. Chưa đo bằng benchmark; số này cố ý cao.
5. ACP-204 (`0x100`) có trên Subnet-EVM ở tag này từ Granite; AgentPolicy không gọi sang nó mà dùng `crypto/ecdsa`.

### Đã làm
- `chain/patches/0002-agentpolicy-precompile.patch` (xếp chồng lên `0001`), trong `graft/subnet-evm/precompile/`:
  - `contracts/agentpolicy/` (mới): khung do `precompilegen` sinh (`contract.go`, `event.go`, `config.go`, `module.go`, `contract.abi`, `config_test.go`), cộng `storage.go` (bố cục lưu trữ theo `keccak256(agent ‖ trường)`, `GetMandateForRule`, `SpendForDay`, `ChargeSpend`), `webauthn.go` (hàm challenge, kiểm chữ ký agent, phân tích `clientDataJSON` chặt, kiểm WebAuthn), `logic.go` (nghiệp vụ của từng hàm), `contract_test.go` (thay test sinh sẵn).
  - `registry/registry.go` (+3 dòng): import module.
- `chain/abi/IAgentPolicy.sol` (đúng ARCHITECTURE 3.2, thêm tên `registered` và `nonce` cho giá trị trả về), `chain/abi/IAgentPolicy.json` (sinh bằng `forge inspect` trong image Foundry đã cố định).
- `chain/testvectors/webauthn.json`, sinh bằng `packages/shared/scripts/gen-webauthn-vectors.mjs` (khoá thử P-256 và secp256k1 cố định, công khai có chủ đích). Có 1 bằng chứng hợp lệ và 9 bằng chứng lỗi cho `setMandate`, bằng chứng `freeze`, `unfreeze`, chữ ký `register`.
- `packages/shared/src/agentPolicy.ts`: địa chỉ, ABI, `registerDigest`, `mandateHash`, `setMandateChallenge`, `freezeChallenge`, `unfreezeChallenge`, `challengeToBase64Url`, `encodeAuth`, `normalizeLowS`. Dùng `viem@2.57.19` (dependency mới của `packages/shared`). `ADDRESSES.agentPolicy` trong `chain.ts` được điền.

### File ngoài mục "Sở hữu"
- `chain/scripts/apply-patches.sh`, `chain/scripts/make-patch.sh`: hỗ trợ bản vá xếp chồng. `apply-patches.sh` commit từng bản vá trong bản clone ở `.work` (tên commit `patch: <file>`). `make-patch.sh <tên>` sinh lại bản vá trên cùng, hoặc tạo bản vá mới trên cùng. `--check` giờ chỉ hỏi cây có sửa đổi chưa đưa vào bản vá không.
- `chain/scripts/test.sh`: thêm gói `./precompile/contracts/agentpolicy/`, mẫu test `Spike|AgentPolicy`, mount `chain/testvectors` vào `/vectors` và đặt `SEALED_TESTVECTORS`. Test AgentPolicy báo lỗi rõ nếu thiếu biến này.
- `packages/shared/src/agentPolicyAbi.ts` (ABI dạng `as const` cho viem, test so với `chain/abi/IAgentPolicy.json`), `packages/shared/scripts/gen-webauthn-vectors.mjs`, `packages/shared/package.json`, `pnpm-lock.yaml`, `packages/shared/src/index.ts`, `packages/shared/src/chain.ts`, `packages/shared/src/chain.test.ts`.
- `docs/decisions/D4.md`, `docs/ARCHITECTURE.md`, `docs/REFERENCE.md`.

### Kết quả kiểm
Môi trường: Windows 11, Git Bash, Docker 29.5.3, Go 1.26.10 trong Docker, Node 24.12.0, ngày 15/11/2026, nhánh `task/T04-agentpolicy`.

| Tiêu chí | Test | Kết quả |
|---|---|---|
| `register`: chữ ký đúng thành công và phát `AgentRegistered`; chữ ký sai từ chối; đăng ký lần hai từ chối | `TestAgentPolicyRegister` (thêm: chữ ký cho chain id khác bị từ chối) | `PASS` |
| `register` với điểm không nằm trên P-256 | `TestAgentPolicyRegister/owner_key_not_on_P-256` (đổi 1 bit của Y; điểm 0) | `PASS` |
| `setMandate` đúng: thành công, `ownerNonce` +1 | `TestAgentPolicySetMandate/valid_passkey_proof…` | `PASS` |
| `setMandate` từ chối: sai khoá, sai challenge, phát lại, nonce tương lai, bằng chứng của A cho B, chain id khác, `type` sai, UP tắt, `s` cao, >16 người nhận, `perTxCap > dailyCap` | `TestAgentPolicySetMandate` (9 vector lỗi + các ca riêng; thêm: khoá JSON trùng, chữ ký hỏng, agent chưa đăng ký) | `PASS` |
| `freeze`/`unfreeze`: đúng khoá chạy, sai khoá từ chối, bằng chứng `freeze` không dùng cho `unfreeze` | `TestAgentPolicyFreeze` | `PASS` |
| Khoá agent không đổi được uỷ quyền | `TestAgentPolicyAgentKeyCannotChangeMandate` (chữ ký secp256k1 của agent, passkey của kẻ tấn công, đăng ký lại) | `PASS` |
| `ChargeSpend`: cộng dồn trong ngày, sang ngày mới `spentToday` về 0, `totalCharged` giữ | `TestAgentPolicyChargeSpend` | `PASS` |
| Hàm đọc chạy ở chế độ chỉ đọc, hàm ghi bị từ chối | `TestAgentPolicyReadOnly` | `PASS` |
| TS: challenge và `auth` khớp từng byte với vector | `packages/shared/src/agentPolicy.test.ts` (13 test) | `PASS` |
| Test có thể đỏ | Đột biến từng cái rồi hoàn nguyên: bỏ kiểm `s` thấp, bỏ kiểm UP, bỏ kiểm `type`, bỏ kiểm challenge, không tăng nonce, cho đăng ký lại | `FAIL` đúng test ở cả 6 lần |
| Giới hạn sau khi rà lại | `TestAgentPolicyBounds`: `auth` lớn hơn `MaxAuthSize` (2048 byte) bị từ chối trước khi phân tích; nonce ở `2^64−1` trả `ErrNonceExhausted`; hết gas đúng lúc trừ gas sự kiện thì không ghi trạng thái | `PASS`; đột biến (bỏ giới hạn kích thước; ghi nonce trước khi trừ gas) đều bị bắt |
| Không hồi quy | `SEALED_TEST_RUN=. bash chain/scripts/test.sh`; `go test ./precompile/...` | `PASS` |
| Node build và chạy với cả hai bản vá | `build.sh`, `localnet.sh up`, `smoke.sh`, `chain/tests/spike/run.sh` | `PASS` |
| Precompile trên chain thật | xem D4 | `PASS` |
| `bash chain/scripts/test.sh` và `bash scripts/check.sh` | | ghi trong PR |

### Rà lại trước khi mở PR
Bản vá được rà lại độc lập trước khi mở PR (chỉ đọc mã, không chạy). Ba điểm nêu ra, người code đã tự kiểm lại bằng mã và test rồi sửa:
1. `auth` không bị giới hạn kích thước: bằng chứng lỗi vẫn bắt node giải mã ABI và phân tích JSON lớn mà không làm nonce tăng. Sửa: `MaxAuthSize = 2048`, kiểm trước khi giải mã. Phần giải mã calldata do khung sinh sẵn vẫn chạy trên cả input, nhưng chi phí calldata và bộ nhớ đã do người gọi trả.
2. Nonce lưu `uint64`, `current+1` có thể quấn về 0 khi tới `2^64−1`, làm bằng chứng cũ với nonce 0 dùng lại được. Sửa: trả `ErrNonceExhausted` khi nonce đã ở giá trị lớn nhất.
3. Trạng thái được ghi trước khi trừ gas sự kiện. Trong EVM, lỗi làm khung gọi bị hoàn nên không khai thác được, nhưng khi gọi `Run` trực tiếp thì để lại ghi dở. Sửa: trừ gas sự kiện trước, ghi trạng thái sau cùng (`checkOwner` không còn ghi; `bumpNonce` chạy sau `chargeEvent`).
Các phần khác (đăng ký một lần, chống biến dạng chữ ký, tách miền giữa các hàm, phân tích JSON, va chạm ô lưu trữ, tính tất định, chế độ chỉ đọc, cách lấy chain id) được báo là không có vấn đề.

### Ghi chú, việc phát hiện thêm (không làm trong task này)
- Bố cục lưu trữ là contract nội bộ giữa T04 và T05 (`storage.go`). Đổi bố cục sau khi chain chạy thật sẽ cần state upgrade.
- `writeMandate` xoá các ô người nhận thừa khi danh sách ngắn lại. Có test 16 người nhận rồi 1 người nhận.
- Gas chưa đo bằng benchmark.
- Bộ vector cố định (có chữ ký ECDSA ngẫu nhiên lúc sinh). Sinh lại thì file đổi, các test vẫn phải xanh.
- `eth_call` tới AgentPolicy chạy như giao dịch thường, không phải chế độ chỉ đọc. Chỉ `staticcall` mới là chỉ đọc.
