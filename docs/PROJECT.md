# Sealed Arena

Bài dự thi Team1 Vietnam UniHack "Build on Avalanche", track AI agents & security.

## Cho ai
- **Người dùng chính:** người vận hành một AI agent có ví (agent tự mua dữ liệu, API qua x402). Họ muốn giao tiền cho agent mà không mất hết khi agent hoặc private key của nó bị chiếm.
- **Người chấm:** sáu giám khảo. Vòng online xem repo, slide, video 2–3 phút. Chung kết xem demo trực tiếp và hỏi đáp.
- **Người tham gia thử thách:** bất kỳ ai nhận private key đã công khai của agent và thử chuyển tiền ra ngoài uỷ quyền.

## Hành trình quan trọng nhất
Chủ ví dùng passkey đặt uỷ quyền cho agent (người nhận, hạn mức, hạn dùng) → agent mua hàng qua x402 trong uỷ quyền → private key của agent bị công khai → người cầm key gửi giao dịch rút tiền → node từ chối, giao dịch không vào block, số dư không đổi → chủ ví bấm dừng bằng passkey.

## Primitive duy nhất
**Một khoản trừ tiền của agent chỉ hợp lệ khi nằm trong uỷ quyền của chủ ví.** Quy tắc nằm trong điều kiện hợp lệ của giao dịch trên một Avalanche L1 riêng. Giao dịch ngoài uỷ quyền không bị revert mà bị coi là không hợp lệ.

## Tín hiệu thành công
1. Trên L1 chạy thật, giao dịch từ địa chỉ agent tới địa chỉ ngoài danh sách bị RPC từ chối và không xuất hiện trong block nào.
2. 20 giao dịch đồng thời không làm tổng chi vượt ngân sách ngày.
3. Một người lạ có private key của agent không làm số dư giảm quá phần uỷ quyền cho phép.
4. Bản ghi sống sót của agent đọc được trên registry ERC-8004 ở Fuji C-Chain.
5. Repo có test cho mọi đường tiền, và README nêu rõ giới hạn.

## Thang điểm (100)
Technical Implementation 25 · Avalanche Integration 25 · Creativity & Innovation 15 · Impact & Use Case 15 · Presentation & Pitching 10 · UI/UX & Demo 10.

## Deadline cứng và phạm vi bắt buộc
| Hạn | Ngày | Phải có gì (không được cắt) |
|---|---|---|
| Cổng quyết định bậc | 19/11/2026, cuối ngày | Kết luận T02 và T05: giữ bậc 1 hay lùi bậc 2 |
| Nộp bài | 21/11/2026, 23:59 | Repo GitHub mở được (public, hoặc private đã thêm `tuantqse90`), slide (Canva hoặc Google Slides), video demo 2–3 phút. Mọi link giám khảo mở được, nếu không đội bị loại |
| Công bố top 10 | 23/11/2026 | |
| Chung kết | 30/11/2026, 09:00 | L1 đang chạy, demo trực tiếp, bản quay dự phòng |

Dự án phải chạy trên Avalanche: L1 riêng, Fuji, hoặc C-Chain mainnet. Mọi pitch phải trả lời: vì sao on-chain, vì sao Avalanche, tiền đến từ đâu, và nêu đúng giới hạn pháp lý ở Việt Nam.

## Thứ tự cắt khi trễ
Cắt từ trên xuống. Không cắt mục dưới khi mục trên chưa cắt.
1. T19 (chấm tầng T1 theo ý định), T18 (biên nhận hoặc hoàn tiền).
2. Bộ tấn công đầy đủ 270 ca: giữ lớp 9 đầy đủ và 5 ca mỗi lớp còn lại.
3. Nhóm đối chứng O (ví hạn mức chuẩn). Giữ nhóm P.
4. ICTT đưa USDC Fuji sang L1: thay bằng coin thử cấp sẵn trong genesis, ghi rõ trong README.
5. Ba validator: chạy một validator, ghi rõ.
6. ICM và ERC-8004 (T13): không cắt nếu còn cách nào, vì đây là phần Avalanche Integration.
Không bao giờ cắt: quy tắc hợp lệ (hoặc ví chính sách ở bậc 2), agent mua hàng qua x402, trang thử thách, dashboard passkey, README giới hạn.

## Ngoài phạm vi
- Mainnet, tiền thật, token, lợi suất.
- Chặn gian lận nằm trong uỷ quyền (giao sai hàng, tráo hàng). Chỉ để lại bằng chứng.
- Bảo vệ tài sản của agent trên chain khác. Địa chỉ agent trên Fuji C-Chain phải để trống.
- Chống việc passkey của chủ ví bị chiếm.
- Thanh toán trong nước, người tiêu dùng trả bằng crypto.

## Giới hạn phải nói thật (bắt buộc có trong README, slide, trang thử thách)
1. Đây là testnet. Tài sản không có giá trị quy đổi. Đây không phải dịch vụ thanh toán.
2. Đội chạy toàn bộ validator. Lời khẳng định là "quy tắc do đồng thuận của chain thực thi", không phải "phi tập trung". Mã nguồn node và danh sách validator công khai.
3. Chỉ tài sản trên L1 này được bảo vệ.
4. Key bị lộ vẫn tiêu được trong uỷ quyền: tới người nhận hợp lệ, tối đa bằng ngân sách ngày, cho tới khi chủ ví dừng hoặc uỷ quyền hết hạn.
5. Người cầm key có thể phá rối: đốt ngân sách ngày, chiếm nonce.
6. Thử thách mở đo mức độ bị thử, không phải bằng chứng an toàn.

## Không được nói
- "Không thể phá", "an toàn tuyệt đối", "phi tập trung", "chặn prompt injection", "miễn nhiễm".
- "Chỉ Avalanche làm được" (đúng là: chỉ làm được trên một chain mình định nghĩa quy tắc; Avalanche L1 là cách làm việc đó).
- "Herond tích hợp x402" (không kiểm chứng được).
- "Cướp", "trộm", "giải thưởng tiền mặt". Dùng: "thử thách red-team mở", "chương trình săn lỗi có uỷ quyền".
- Bất kỳ con số nào trong bảng mối đe doạ mà chưa mở lại nguồn (xem `docs/REFERENCE.md`).

## Ràng buộc
- Đội 3 người. Hai vai làm việc trên repo: một người code, một người review (xem `docs/REVIEW.md`).
- Máy phát triển: Windows 11, Docker, Node 24. Go và Foundry chạy trong Docker.
- Chi phí: VPS cho validator và node RPC; AVAX Fuji từ faucet; API key LLM cho agent.

## Quyết định nghiệp vụ đã chốt
| Câu hỏi | Quyết định | Nguồn |
|---|---|---|
| Ý tưởng | Sealed Arena, thay cho các ý tưởng cũ trong thư mục gốc | Chủ dự án, 15/11 |
| Cách làm việc | Một người code, một người review và duyệt | Chủ dự án, 15/11 |
| Thử thách có thu phí không | Không. Miễn phí, tài sản testnet | Đề xuất đã viết, chưa ai phản đối |
| Người nhận hợp lệ | Chỉ là ví thường (không có code) | Thiết kế |

## Câu hỏi đang chờ chủ dự án
- [ ] Ai phụ trách từng vai (chain, backend, giao diện và pitch)?
- [ ] Có VPS chưa? Cần ít nhất 1, tốt nhất 3 máy Linux cho validator. Chặn T12.
- [ ] Dùng nhà cung cấp LLM nào cho agent, và ai cấp API key? Mặc định đề xuất: Anthropic, model cấu hình qua biến môi trường. Chặn T08.
- [ ] Ban tổ chức có đồng ý cho mời đội khác tham gia thử thách mở không? Chặn T17, không chặn việc nộp bài.
- [ ] Câu trả lời "tiền đến từ đâu": hiện là "nền tảng agent trả phí theo số agent được bảo vệ", chưa có khách hàng. Cần đội bàn thêm trước khi làm slide.
- [ ] Repo GitHub public hay private (private thì phải thêm `tuantqse90`)?
