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
(người code điền: đã làm gì, lệnh đã chạy và kết quả, điều chưa làm được, câu hỏi)
