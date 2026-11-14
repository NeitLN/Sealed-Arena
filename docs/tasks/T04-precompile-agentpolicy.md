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
(người code điền; ghi rõ địa chỉ precompile cuối cùng và kết quả kiểm `0x100`)
