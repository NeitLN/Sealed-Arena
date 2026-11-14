# T03: Khung repo
Mốc: M0 · Ngày mục tiêu: 15/11 · Nhánh: `task/T03-khung-repo` · Phụ thuộc: không · Mức: Mini

## Mục tiêu
Có một repo git với bố cục thư mục đúng `docs/ARCHITECTURE.md` mục 2, và một lệnh kiểm nhanh duy nhất chạy được trên Windows (Git Bash) với Docker.

## Sở hữu (task này được tạo hoặc sửa)
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` ở gốc
- `packages/shared/` (khung: `src/index.ts`, `src/chain.ts` chứa chain id `261126` và chỗ để địa chỉ)
- `contracts/` (khung Foundry: `foundry.toml`, một contract và một test mẫu sẽ bị xoá ở T10)
- `scripts/check.sh`, `scripts/forge.sh` (bọc lệnh `forge` chạy trong Docker)
- Thư mục rỗng có `.gitkeep`: `chain/`, `services/`, `web/`, `infra/`
- `README.md` (bản tối thiểu: tên dự án, một câu mô tả, dòng "đang phát triển")
- `.env.example` ở gốc

Không sửa: mọi thứ trong `docs/`, `.gitignore` (đã có; cần thêm dòng thì ghi vào "Bàn giao").

## Việc phải làm
1. `git init` với nhánh mặc định `main`. **Cần chủ dự án cho phép trước khi commit.** Kiểm `git config user.name` và `user.email` theo quy tắc toàn cục của chủ dự án.
2. Workspace pnpm với TypeScript strict. Chọn trình chạy test cho TypeScript (đề xuất: vitest) và trình lint/format (đề xuất: biome). Cố định phiên bản trong lockfile.
3. Foundry chạy qua image Docker chính thức của Foundry. `scripts/forge.sh <tham số>` chạy `forge` trong container với thư mục `contracts/` được gắn vào.
4. `scripts/check.sh` chạy lần lượt và dừng ở lỗi đầu tiên:
   - typecheck toàn workspace,
   - lint,
   - test TypeScript,
   - `forge build` và `forge test`,
   - nếu tồn tại `chain/scripts/test.sh` thì chạy nó (T02 sẽ thêm).
   Cuối cùng in một dòng tổng kết từng bước: `PASS` hoặc `FAIL`.

## Tiêu chí chấp nhận
- [ ] `bash scripts/check.sh` thoát mã 0 và in mọi bước `PASS` trên máy Windows có Docker đang chạy.
- [ ] Cố ý làm hỏng test mẫu thì `scripts/check.sh` thoát mã khác 0.
- [ ] `git status` sạch sau khi chạy kiểm (không sinh file ngoài `.gitignore`).
- [ ] `git ls-files` không chứa file nào thuộc mục "Chỉ dùng trên máy" và mục "Secret" của `.gitignore`.

## Ngoài phạm vi
CI trên GitHub, hook git, mọi code sản phẩm.

## Bàn giao

### Đã làm
- Repo git nhánh `main`, đẩy lên `https://github.com/NeitLN/Sealed-Arena` (public, chủ dự án chọn 15/11).
- Workspace pnpm 11.21.0 (`packageManager` cố định), TypeScript 5.9.3 strict (`tsconfig.base.json` bật thêm `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest 5.1.0, biome 2.6.7. Phiên bản cố định chính xác trong `package.json` và `pnpm-lock.yaml`.
  TypeScript 7.0.2 đã có nhưng mới ra; chọn 5.9.3 để tránh lỗi tương thích. Đổi sau nếu cần.
- `packages/shared/src/chain.ts`: `CHAIN_ID = 261126`, `CHAIN_NAME = "Sealed"`, `NATIVE_SYMBOL = "USDC"`, đối tượng `ADDRESSES` (agentPolicy, arenaRecorder, reputationReceiver) để `undefined` cho tới task triển khai hoặc kiểm địa chỉ. Test viết trước (`chain.test.ts`, đã thấy đỏ trước khi có `chain.ts`).
- `contracts/`: Foundry, solc `0.8.38`, `evm_version = "cancun"`, forge-std `v1.17.0` dạng git submodule (`contracts/lib/forge-std`). Contract mẫu `Placeholder.sol` và test hai chiều (được phép / revert), xoá ở T10.
- `scripts/forge.sh`: chạy `forge` trong image `ghcr.io/foundry-rs/foundry:v1.9.0` cố định bằng digest `sha256:3a392c18…7d39`. Volume tên `sealed-arena-foundry-home` giữ solc đã tải giữa các lần chạy.
- `scripts/check.sh`: typecheck → lint → test TS → forge build → forge test → `chain/scripts/test.sh` (nếu có). Dừng ở lỗi đầu tiên; bảng tổng kết in mỗi bước một dòng `PASS`/`FAIL`, bước bị bỏ qua in `NOT RUN (...)`, bước chain chưa có in `N/A (...)`. Tự chạy `pnpm install --frozen-lockfile` và `git submodule update --init` nếu thiếu.
- `chain/`, `services/`, `web/`, `infra/` có `.gitkeep`. `README.md` tối thiểu, `.env.example` ở gốc.

### File ngoài mục "Sở hữu" (cần người review đồng ý)
- `.gitattributes`: ép `eol=lf`. Máy có `core.autocrlf=true`; không có file này thì `.sh` bị chuyển CRLF khi checkout và bash báo lỗi `$'\r'`.
- `biome.json`: cấu hình lint/format, bỏ qua `docs/` và `contracts/lib/`.
- `.gitmodules`, `contracts/lib/forge-std` (submodule), `contracts/remappings.txt`: cách cài forge-std.
- `.gitignore` không sửa; không cần thêm dòng (`contracts/out/`, `contracts/cache/`, `node_modules/` đã khớp mẫu `out/`, `cache/`, `node_modules/`).

### Kết quả kiểm
Môi trường: Windows 11, Git Bash, Node 24.12.0, pnpm 11.21.0, Docker 29.5.3. Revision: commit đầu của nhánh `task/T03-khung-repo`.

| Kiểm | Lệnh | Kết quả |
|---|---|---|
| Kiểm nhanh xanh | `bash scripts/check.sh` | `PASS`: thoát 0; typecheck, lint, test-ts, forge-build, forge-test đều `PASS`; chain-test `N/A` |
| Hỏng test Foundry | đổi `42` thành `43` trong `assertEq` của `Placeholder.t.sol`, chạy `bash scripts/check.sh` | `PASS`: thoát 1, forge-test `FAIL`, chain-test `NOT RUN` |
| Hỏng test TS | đổi `261126` thành `261127` trong `chain.test.ts`, chạy lại | `PASS`: thoát 1, test-ts `FAIL`, các bước sau `NOT RUN` |
| Hỏng bước chain | tạo tạm `chain/scripts/test.sh` trả `exit 3`, chạy lại | `PASS`: thoát 1 |
| `git status` sạch sau kiểm | `git status --short` sau khi hoàn nguyên và chạy lại | `PASS`: chỉ còn file của task; `contracts/out/`, `contracts/cache/`, `node_modules/` nằm trong mục bị bỏ qua |
| Không lộ file chỉ dùng trên máy và secret | `git ls-files`, đối chiếu với mục "Chỉ dùng trên máy" và "Secret" của `.gitignore` | `PASS`: không có file nào thuộc hai mục này |
| Clone sạch chạy được | clone nhánh vào thư mục tạm, `bash scripts/check.sh` | ghi trong PR |

### Chưa làm / ghi chú cho task sau
- `evm_version = "cancun"` là lựa chọn an toàn; T06/T10 kiểm Subnet-EVM ở `v1.15.3` hỗ trợ tới fork nào rồi chỉnh.
- `check.sh` cần Docker đang chạy; Docker tắt thì bước forge `FAIL` (đúng ý, không bỏ qua im lặng).
- Lần chạy đầu trên máy mới tải image Foundry (khoảng vài trăm MB) và solc.
