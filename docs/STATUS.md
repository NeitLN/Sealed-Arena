# STATUS
Cập nhật: 15/11/2026. Người code cập nhật trong PR của từng task; người review kiểm.

## Đang ở đâu
- Mốc hiện tại: M0 xong (T01–T03, D1, D3); đang M1. T03 (khung repo) xong trong PR #1. T01 (build node, mạng local) xong trong PR #2; D3 đã chốt (tmpnet trong container). T02 (spike quy tắc) xong trong PR #3; D1 đã chốt: **được**, giữ bậc 1. T04 (precompile AgentPolicy) trong PR #4; D4 đã chốt: địa chỉ `0x0300…01`, `0x100` có trên L1.
- Repo: `https://github.com/NeitLN/Sealed-Arena` (public). Nhánh mặc định `main`.
- Đã có: bộ tài liệu trong `docs/`; workspace pnpm + TypeScript strict; Foundry chạy trong Docker; `scripts/check.sh`.
- Node avalanchego `v1.15.3` + Subnet-EVM chưa sửa build được trong Docker (`sealed-node:dev`); mạng local 1 hoặc 3 node dựng bằng `bash scripts/localnet.sh up`. Bản vá spike `chain/patches/0001-spike-agent-rule.patch` chứng minh quy tắc ở `preCheck` + txpool giữ giao dịch bị cấm ngoài mọi block (test Go và mạng local).
- Còn 6 ngày tới hạn nộp (21/11, 23:59).

## Bằng chứng gần nhất
| Kiểm gì | Kết quả | Ghi chú |
|---|---|---|
| Tag avalanchego mới nhất | `v1.15.3`, phát hành 05/11/2026 | Đọc từ GitHub API ngày 15/11 |
| Vị trí kiểm TxAllowList trong `preCheck` | dòng 254–258 của `graft/subnet-evm/core/state_transition.go` trên tag `v1.15.3` | T02, D1 |
| Vị trí kiểm TxAllowList trong txpool | dòng 281–286 của `graft/subnet-evm/core/txpool/validation.go` trên tag | T02, D1 |
| `bash chain/scripts/test.sh` (spike) | `PASS`; toàn bộ test `./core/` và `legacypool` `PASS` | T02, 15/11 |
| `chain/tests/spike/run.sh` trên mạng đã vá | `PASS`; trên image chưa vá `FAIL` (đúng ý) | T02, 15/11 |
| Test Go AgentPolicy (`TestAgentPolicy*`) và test TS vector WebAuthn | `PASS`; 6 đột biến đều bị bắt | T04, 15/11 |
| AgentPolicy trên mạng local (bật tạm trong genesis) và `0x100` | `PASS` | T04, D4 |
| `bash scripts/check.sh` trên nhánh T03 | `PASS` (typecheck, lint, test-ts, forge-build, forge-test; chain-test `N/A`) | Windows 11, Git Bash, Node 24.12.0, pnpm 11.21.0, Docker 29.5.3, 15/11 |
| Build node sạch | `PASS`, 154 giây (`fetch.sh` + `build.sh --no-cache`) | T01, 15/11 |
| `localnet.sh up` + `chain/scripts/smoke.sh` | `PASS` với 1 node và 3 node; lặp lại sau `down` `PASS` | T01, 15/11 |

## Quyết định đang chờ
| Câu hỏi | Việc bị chặn | Phải chốt trước |
|---|---|---|
| Các câu hỏi cho chủ dự án trong `docs/PROJECT.md` (VPS, API key LLM, phân vai) | T08, T12 | 17–18/11 |

## Bước tiếp theo
1. Người review: review PR #4 (T04) và D4.
2. Người code: làm **T05** (nối quy tắc với AgentPolicy, bộ đếm ngày), phụ thuộc T02 và T04.
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
`scripts/check.sh` có bước chain-test (`chain/scripts/test.sh`): nó xoá và clone lại `chain/.work/avalanchego`, và dừng nếu cây đó có sửa đổi chưa đưa vào `chain/patches/`.
