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
bash scripts/localnet.sh up        # chạy container sealed-node, chờ chain Sealed trả eth_chainId (tối đa 600 giây)
bash chain/scripts/smoke.sh        # kiểm khói: chain id 261126, chuyển 1 coin, kiểm số dư
bash scripts/localnet.sh rpc       # in URL RPC của chain Sealed trên máy
bash scripts/localnet.sh status    # trạng thái container và eth_chainId
bash scripts/localnet.sh down      # xoá container, volume dữ liệu và network docker
```
- Mạng nhiều node: `SEALED_NODE_COUNT=3 bash scripts/localnet.sh up`. Các node cùng chạy trong một container, cổng HTTP `9650, 9652, 9654`, chỉ `9650` được mở ra máy.
- Đổi thời gian chờ: `SEALED_UP_TIMEOUT=900 bash scripts/localnet.sh up`.
- **Blockchain ID đổi sau mỗi lần `down` rồi `up`** (mạng mới). Luôn lấy URL bằng `bash scripts/localnet.sh rpc`, không chép cứng. Chain id EVM luôn là `261126`.
- Khởi động lại container (`docker restart sealed-node`) giữ nguyên dữ liệu và blockchain ID; chạy `bash scripts/localnet.sh up` để chờ chain sẵn sàng.
- Tài khoản dev có coin trong genesis: `0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC`. Khoá của nó là khoá dev "ewoq" đã công khai trong mã nguồn avalanchego, ghi trong `chain/scripts/smoke.sh`. Chỉ dùng trên mạng local.

## 4. Xem log
```bash
docker logs -f sealed-node                       # log dựng mạng và log node đầu tiên
docker exec sealed-node cat /data/sealed.json    # thư mục mạng, subnet ID, blockchain ID, URI các node
docker exec sealed-node sh -c 'ls /data/networks/*/'                          # thư mục từng node
docker exec sealed-node sh -c 'tail -n 100 /data/networks/*/NodeID-*/logs/main.log'
docker exec sealed-node sh -c 'ls /data/networks/*/NodeID-*/logs/'            # log của từng chain (theo blockchain ID)
```

## 5. Sự cố thường gặp
| Triệu chứng | Cách xử lý |
|---|---|
| `failed to connect to the docker API` | Mở Docker Desktop, chờ nó báo đang chạy |
| `localnet: timed out` hoặc `container stopped` | Xem log in kèm; chạy `down` rồi `up` lại |
| Cổng 9650 bị chiếm | Tắt tiến trình đang dùng cổng, hoặc chạy `down` nếu là container cũ |
| `$'\r': command not found` khi chạy script | File bị chuyển CRLF. Repo có `.gitattributes` ép LF; chạy `git add --renormalize .` hoặc clone lại |
| `fetch: tag ... resolves to ...` | Tag upstream đã bị đổi. Không sửa `chain/UPSTREAM` để lách; báo người review |
