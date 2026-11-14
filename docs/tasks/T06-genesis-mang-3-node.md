# T06: Genesis, allow-list, mạng local 3 node, tấn công bằng key lộ
Mốc: M1 · Ngày mục tiêu: 18/11 · Nhánh: `task/T06-genesis-localnet` · Phụ thuộc: T05 (chặn bắt đầu), quyết định D3 · Mức: Standard

## Mục tiêu
Mạng L1 local 3 node chạy bản đã vá với genesis đúng `docs/ARCHITECTURE.md` mục 3, và một bộ script đóng vai người cầm private key của agent thử mọi đường rút tiền. Đây là bản chạy được đầu tiên của tín hiệu thành công số 1–3.

## Sở hữu
- `chain/genesis/sealed-local.json`, `chain/genesis/README.md` (giải thích từng mục cấu hình)
- `infra/local/` (mở rộng từ T01 lên 3 node)
- `scripts/localnet.sh` (thêm lệnh con `seed`: đăng ký agent thử, đặt uỷ quyền mẫu, cấp tiền)
- `services/attacks/leaked-key/` (bộ tấn công lớp 9) và `services/attacks/README.md`
- `packages/shared/src/addresses.local.ts`
- Bổ sung `docs/RUNBOOK.md`

## Việc phải làm
1. Genesis: chain id `261126`; bật TxAllowList, ContractDeployerAllowList, NativeMinter, Warp, AgentPolicy; phí cơ sở tối thiểu thấp; cấp coin cho admin và người triển khai. Vai trong allow-list đúng ARCHITECTURE mục 3 và mục 7.
2. Mạng 3 node, cả ba là validator, cùng một image. `scripts/localnet.sh up` dựng xong trong một lệnh.
3. `scripts/localnet.sh seed`: tạo một agent thử với khoá cố định dùng cho dev (ghi rõ là khoá công khai trong repo), đăng ký với một khoá P-256 thử thay cho passkey, đặt uỷ quyền mẫu (2 người nhận là ví thường, `perTxCap`, `dailyCap`, hạn 7 ngày), cấp tiền, thêm agent vào TxAllowList.
4. Bộ tấn công lớp 9, mỗi ca là một hàm trả `{tên, kỳ vọng, kết quả, lý do}`:
   - chuyển coin gốc tới địa chỉ ngoài danh sách (mọi loại giao dịch);
   - chuyển vượt `perTxCap`; chuyển nhiều lần vượt `dailyCap`; bắn 20 giao dịch song song;
   - tạo contract; gọi một contract có sẵn; gửi tới người nhận có code;
   - đặt phí gas cực cao để đốt tiền qua phí;
   - gọi `setMandate`, `freeze`, `register` của AgentPolicy bằng khoá agent;
   - gọi NativeMinter, TxAllowList, ContractDeployerAllowList bằng khoá agent;
   - gửi sau khi `freeze`; gửi sau khi hết hạn;
   - phát lại một giao dịch cũ; gửi cùng nonce với phí cao hơn;
   - gửi thẳng tới từng node trong 3 node, không qua cùng một RPC.
   Sau cả bộ: kiểm bất biến `balance ≥ funded − totalCharged` và kiểm 3 node có cùng hash block mới nhất.
5. Một ca đối chứng dương: chuyển trong uỷ quyền tới người nhận hợp lệ phải thành công, để chắc bộ tấn công không "xanh" vì mạng hỏng.

## Tiêu chí chấp nhận
- [ ] `scripts/localnet.sh up && scripts/localnet.sh seed` → mạng 3 node tạo block.
- [ ] `pnpm --filter attacks leaked-key` → mọi ca tấn công kết quả "bị chặn", ca đối chứng dương "thành công", bất biến giữ, 3 node không tách chain. In bảng kết quả.
- [ ] Tắt một node rồi chạy lại ca đối chứng dương. Ghi kết quả (chain còn chạy hay dừng) vào `docs/RUNBOOK.md`. Đây là thông tin, không phải điều kiện đạt.
- [ ] Mọi địa chỉ và ABI mà script dùng đều lấy từ `packages/shared`.
- [ ] `bash scripts/check.sh` → `PASS` (bộ kiểm nhanh không cần dựng mạng; thêm lệnh riêng `scripts/check-localnet.sh` cho phần cần mạng).

## Ngoài phạm vi
Fuji, ICTT, ICM (T12, T13). Passkey thật trên trình duyệt (T09).

## Bàn giao
(người code điền; nếu có ca tấn công nào không bị chặn, đó là phát hiện quan trọng nhất của task, ghi lên đầu)
