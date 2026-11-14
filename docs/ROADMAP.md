# ROADMAP: Sealed Arena

Người code cập nhật file này trong PR của từng task; người review kiểm. Trạng thái: `đề xuất` → `đang làm` → `chờ review` → `đã tích hợp (PR #n)`, hoặc `bị chặn: <lý do>` / `hoãn: <lý do>`.

## Mốc

| Mốc | Người dùng thấy được gì | Cổng ra | Ngày mục tiêu | Trạng thái |
|---|---|---|---|---|
| M0 | Mạng L1 local chạy bằng node tự build; một quy tắc viết cứng loại được giao dịch | T01–T03 đã kiểm; quyết định D1 có câu trả lời | 16/11 | chưa |
| M1 | Chủ ví đặt uỷ quyền; key agent bị lộ không rút được tiền trên mạng local | T04–T06 đã kiểm; script tấn công lớp 9 không rút được | 18/11 | chưa |
| M2 | Agent mua hàng qua x402 trong uỷ quyền; chủ ví dùng passkey trên web | T07–T09 đã kiểm | 19/11 | chưa |
| M3 | L1 chạy trên Fuji; trang thử thách mở; bản ghi sống sót lên ERC-8004 | T10–T13 đã kiểm | 20/11 | chưa |
| M4 | Bài nộp: so sánh với nhóm đối chứng, báo cáo đánh giá, README, video, slide | T14–T16 đã kiểm; đã bấm Submit | 21/11 | chưa |
| M5 | Thử thách mở cho đội khác; số liệu thật cho chung kết | T17 | 22–29/11 | chưa |

## Task

Thứ tự làm là thứ tự trong bảng, trừ khi cột phụ thuộc cho phép làm sớm hơn. Mỗi lúc chỉ một task `đang làm`.

| ID | Mốc | Việc | Phụ thuộc | Kiểm chấp nhận (tóm tắt) | Mức rủi ro | Ngày | Trạng thái |
|---|---|---|---|---|---|---|---|
| T01 | M0 | Build node từ tag cố định trong Docker, chạy mạng L1 local một node | — | Gửi được một giao dịch chuyển coin gốc trên mạng local | Standard | 15/11 | đề xuất |
| T02 | M0 | Spike: quy tắc viết cứng trong `preCheck` và txpool | T01 | Giao dịch bị cấm: RPC từ chối, không vào block, block chứa nó bị loại; có câu trả lời về ACP-194 | Full | 16/11 | đề xuất |
| T03 | M0 | Khung repo: workspace, Foundry trong Docker, `scripts/check.sh` | — | `scripts/check.sh` chạy xanh trên repo rỗng | Mini | 15/11 | đề xuất |
| T04 | M1 | Precompile AgentPolicy: lưu trữ, register, setMandate, freeze, WebAuthn | T01 | Test Go: mọi hàm, chữ ký sai bị từ chối, phát lại bị từ chối | Full | 17/11 | đề xuất |
| T05 | M1 | Nối quy tắc với AgentPolicy, bộ đếm ngày, `totalCharged` | T02, T04 | Bảy điều kiện ở ARCHITECTURE 3.1 đều có test hai chiều; 20 giao dịch cùng lúc không vượt ngân sách | Full | 18/11 | đề xuất |
| T06 | M1 | Genesis, allow-list, mạng local nhiều node, script tấn công lớp 9 | T05 | Mọi đường rút bằng key lộ đều thất bại trên mạng 3 node | Standard | 18/11 | đề xuất |
| T07 | M2 | x402 `signed-native-tx`: facilitator, người bán mẫu, thư viện client | T03; tích hợp cần T06 | Mua một tài nguyên từ đầu tới cuối trên mạng local; sai `to`/`value`/`data` bị từ chối | Standard | 18/11 | đề xuất |
| T08 | M2 | Agent mua hàng và kịch bản trang web cài lệnh | T07 | Agent mua 3 món; trang cài lệnh khiến agent tạo giao dịch và node từ chối | Standard | 19/11 | đề xuất |
| T09 | M2 | Dashboard chủ ví: đăng ký passkey, đặt uỷ quyền, dừng | T04; tích hợp cần T06 | Đặt uỷ quyền và dừng bằng passkey thật trên trình duyệt | Standard | 19/11 | đề xuất |
| T10 | M3 | ArenaRecorder: nạp, checkpoint, phát hiện vi phạm, điểm | T03; tích hợp cần T06 | Test Foundry: bất biến vỡ thì ghi vi phạm; điểm tính đúng | Standard | 19/11 | đề xuất |
| T11 | M3 | Cổng RPC ghi lượt thử, trang thử thách | T06, T10 | Lượt thử bị từ chối hiện trên trang trong vài giây | Standard | 20/11 | đề xuất |
| T12 | M3 | Triển khai L1 lên Fuji: validator, ICTT, node RPC công khai | T06, hạ tầng do người lo | L1 trên Fuji tạo block; USDC Fuji sang được thành coin gốc | Full | 20/11 | đề xuất |
| T13 | M3 | ICM: ArenaRecorder → ReputationReceiver → ERC-8004 trên Fuji | T10, T12 | Một bản ghi của agent đọc được từ registry trên Fuji | Standard | 20/11 | đề xuất |
| T14 | M4 | Nhóm đối chứng P và O, script so sánh 20 thanh toán đồng thời | T08 | P bị rút khi tiêm lệnh; O vượt hạn mức; S giữ | Standard | 20/11 | đề xuất |
| T15 | M4 | Bộ tấn công và báo cáo đánh giá | T08, T14 | Lớp 9 đầy đủ, tối thiểu 5 ca mỗi lớp 1–8; báo cáo có khoảng tin cậy | Standard | 21/11 | đề xuất |
| T16 | M4 | README, trang luật thử thách, danh mục nộp bài | T11–T15 | Người lạ làm theo README chạy được mạng local; mọi link nộp bài mở được ở cửa sổ ẩn danh | Mini | 21/11 | đề xuất |
| T17 | M5 | Vận hành thử thách mở, vá lỗi, thu số liệu | T16 | Số lượt thử và số người gửi có trên trang; mọi lỗ hổng tìm được đều được ghi lại | Standard | 22–29/11 | đề xuất |
| T18 | — | Mở rộng: biên nhận hoặc hoàn tiền | T07 | Không giao hàng thì tiền tự hoàn sau hạn | Full | sau nộp | hoãn: mục tiêu mở rộng |
| T19 | — | Mở rộng: chấm tầng T1 theo ý định ghi on-chain | T10 | Trả sai ý định bị ghi nhận | Full | sau nộp | hoãn: mục tiêu mở rộng |

Phiếu chi tiết: `docs/tasks/`. T01–T06 có phiếu riêng. T07–T17 nằm trong `docs/tasks/BACKLOG.md` ở dạng rút gọn; người code tách thành phiếu riêng khi bắt đầu task (việc đầu tiên trên nhánh), sau khi các mục **[cần kiểm]** liên quan đã có câu trả lời.

## Việc cần người làm (không giao cho session)

| ID | Việc | Chặn task | Hạn |
|---|---|---|---|
| H1 | Có 1–3 máy chạy liên tục 20–30/11 để deploy L1 (cấu hình chính xác do T12 kiểm). Đang chờ duyệt GitHub Student Developer Pack để lấy credit cloud. Chưa duyệt kịp thì dùng Azure for Students hoặc một máy bàn để ở nhà | T12 | 18/11 |
| H2 | Lấy AVAX Fuji cho P-Chain (ước tính 2 AVAX mỗi validator) và USDC Fuji từ faucet | T12 | 18/11 |
| H3 | Cấp API key LLM cho agent | T08 | 17/11 |
| H4 | Tạo repo GitHub; nếu private thì thêm `tuantqse90` | T16 | 19/11 |
| H5 | Hỏi ban tổ chức về thử thách mở | T17 | 20/11 |
| H6 | Quay video 2–3 phút theo kịch bản trong bản đề xuất | Nộp bài | 21/11 |
| H7 | Làm slide; chốt câu trả lời "tiền đến từ đâu" | Nộp bài | 21/11 |
| H8 | Mở lại từng nguồn trong bảng mối đe doạ, đối chiếu con số | Slide | 20/11 |
| H9 | Một thiết bị có passkey (điện thoại hoặc laptop có vân tay) để thử T09 | T09 | 18/11 |

## Quyết định đắt nếu đổi

| # | Quyết định | Việc phải chờ nó | Hạn | Cách kiểm | Trạng thái |
|---|---|---|---|---|---|
| D1 | Lỗi ở `preCheck` có làm giao dịch bị loại khỏi block ở tag `v1.15.3` không; Subnet-EVM có dùng ACP-194 không | T05 và mọi câu chữ "giao dịch không hợp lệ" | 16/11 | T02 | mở |
| D2 | Giữ bậc 1 hay lùi bậc 2 | T06 trở đi, README, slide, video | 19/11 cuối ngày | T05 `PASS` trên mạng nhiều node | mở |
| D3 | Cách dựng L1: công cụ dòng lệnh chính thức hay tự chạy avalanchego bằng Docker | T06, T12 | 16/11 | T01 | mở |
| D4 | Địa chỉ precompile AgentPolicy và việc `0x100` có trên L1 | T04, T09, PolicyWallet bậc 2 | 17/11 | T04 | mở |
| D5 | Dùng SDK `@x402/*` có điểm mở rộng hay tự viết luồng 402 | T07, T08 | 18/11 | T07 | mở |
| D6 | USDC vào L1 bằng ICTT hay coin thử cấp trong genesis | T12, README | 19/11 | T12 thử trên Fuji | mở |
| D7 | Chữ ký hàm ghi của registry ERC-8004 trên Fuji | T13 | 19/11 | Đọc ABI thật | mở |
| D8 | Chain id `261126` và tên mạng: không đổi sau khi trang thử thách đã công bố | T11, T12 | 19/11 | — | đề xuất |

Người code ghi câu trả lời vào `docs/decisions/D<n>.md` (bối cảnh, lựa chọn, quyết định, hệ quả, bằng chứng) và cập nhật cột trạng thái trong PR của task; người review kiểm bằng chứng. Kết quả dẫn tới lùi bậc hay đổi phạm vi thì chủ dự án quyết định.

## Thứ tự cắt khi trễ
Xem `docs/PROJECT.md`, mục "Thứ tự cắt khi trễ". Người code hoặc người review đề xuất cắt, chủ dự án quyết định.
