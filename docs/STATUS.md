# STATUS
Cập nhật: 15/11/2026. Người code cập nhật trong PR của từng task; người review kiểm.

## Đang ở đâu
- Mốc hiện tại: M0. T03 (khung repo) xong trong PR #1. T01 (build node, mạng local) trong PR #2; D3 đã chốt (tmpnet trong container).
- Repo: `https://github.com/NeitLN/Sealed-Arena` (public). Nhánh mặc định `main`.
- Đã có: bộ tài liệu trong `docs/`; workspace pnpm + TypeScript strict; Foundry chạy trong Docker; `scripts/check.sh`.
- Node avalanchego `v1.15.3` + Subnet-EVM chưa sửa build được trong Docker (`sealed-node:dev`); mạng local 1 hoặc 3 node dựng bằng `bash scripts/localnet.sh up`. Chưa có code quy tắc.
- Còn 6 ngày tới hạn nộp (21/11, 23:59).

## Bằng chứng gần nhất
| Kiểm gì | Kết quả | Ghi chú |
|---|---|---|
| Tag avalanchego mới nhất | `v1.15.3`, phát hành 05/11/2026 | Đọc từ GitHub API ngày 15/11 |
| Vị trí kiểm TxAllowList trong `preCheck` | dòng 254–257 của `graft/subnet-evm/core/state_transition.go` trên `master` | Phải kiểm lại trên đúng tag `v1.15.3` ở T02 |
| Vị trí kiểm TxAllowList trong txpool | dòng 281–284 của `graft/subnet-evm/core/txpool/validation.go` trên `master` | Như trên |
| `bash scripts/check.sh` trên nhánh T03 | `PASS` (typecheck, lint, test-ts, forge-build, forge-test; chain-test `N/A`) | Windows 11, Git Bash, Node 24.12.0, pnpm 11.21.0, Docker 29.5.3, 15/11 |
| Build node sạch | `PASS`, 154 giây (`fetch.sh` + `build.sh --no-cache`) | T01, 15/11 |
| `localnet.sh up` + `chain/scripts/smoke.sh` | `PASS` với 1 node và 3 node; lặp lại sau `down` `PASS` | T01, 15/11 |

## Quyết định đang chờ
| Câu hỏi | Việc bị chặn | Phải chốt trước |
|---|---|---|
| D1: lỗi `preCheck` có loại giao dịch khỏi block không | T05 | 16/11 |
| Các câu hỏi cho chủ dự án trong `docs/PROJECT.md` (VPS, API key LLM, phân vai) | T08, T12 | 17–18/11 |

## Bước tiếp theo
1. Người code: làm **T02** (spike quy tắc). Đây là task quyết định bậc 1 có khả thi không (D1).
2. Người review: review PR của T01 theo `docs/REVIEW.md`, kiểm D3 trong `docs/decisions/D3.md`.
3. Chủ dự án: H1, H2, H3 trong ROADMAP, vì chúng chặn M2 và M3.

## Bộ kiểm nhanh (chạy đầu mỗi session)
Cần Docker Desktop đang chạy, Node 24, pnpm 11.
```bash
bash scripts/check.sh
```
Mỗi lần chạy, script đồng bộ trước `pnpm install --frozen-lockfile` và `git submodule update --init`.

Mạng local (cách build và dựng: `docs/RUNBOOK.md`):
```bash
bash scripts/localnet.sh up && bash chain/scripts/smoke.sh
```
