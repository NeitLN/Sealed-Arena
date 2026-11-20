import type { Lang } from "./i18n.js";

const en = [
  [
    "Test assets only",
    "Coins on this L1 have no monetary value. This prototype is not a payment service.",
  ],
  [
    "Operator control",
    "The team holds the validator and admin keys and can ship network upgrades. The node refuses an upgrade that disables AgentPolicy or rewrites its storage; a different binary is not bound by that check. The team commits to no upgrades that touch agent addresses. The admin also has native minting authority; the project uses only the bridge to mint.",
  ],
  [
    "Native coin, on this L1",
    "The rule covers transactions in the L1’s native coin. It does not cover assets on other chains or off-chain signatures such as permits. Contract deployment is allow-listed.",
  ],
  [
    "Spending inside the mandate",
    "A leaked key can still pay allowed sellers within the caps until frozen or expired. The daily cap resets at 00:00 UTC, not on a rolling window: spending around that boundary can use two days’ budgets within minutes. Under rule v2 (on Fuji from block 491) the gas limit must equal the payment’s intrinsic gas, the tip is at most 1 gwei, and mandates set with setMandateV2 also cap fees per day; older mandates have no fee cap until set again.",
  ],
  [
    "Griefing is possible",
    "Someone holding the key can use the daily budget or occupy nonces. Fees count toward the caps.",
  ],
  [
    "Simulation is not admission",
    "eth_call and eth_estimateGas do not apply the mandate rule. Services read the mandate from the precompile instead.",
  ],
  [
    "A challenge is not a safety proof",
    "The open challenge measures how the system has been tried. The recorder checks a balance invariant; it does not independently verify every part of the spending rule.",
  ],
  [
    "Reputation is a separate record",
    "An ERC-8004 record is only as trustworthy as its writer. Check that the feedback client is the deployed ReputationReceiver. Cross-chain messaging carries the record; it does not enforce the spending rule.",
  ],
  [
    "A custom payment integration",
    "Sellers must add this network and the signed-native-tx method to their x402 integration. Standard x402 clients cannot pay it. Sellers must trust the facilitator or check the chain themselves.",
  ],
  [
    "Passkey proof scope",
    "Under rule v1, owner proofs bind the chain ID, agent and nonce, and the local and Fuji networks share a chain ID. Under rule v2 (on Fuji from block 491) they also bind the network and blockchain IDs, so a proof for one deployment is refused on the other. A v2 freeze can be signed ahead of time but must still be sent by an allowed address.",
  ],
  [
    "A limited WebAuthn check",
    "The precompile checks the signature, challenge and User Present flag. It does not check origin or rpIdHash, or require User Verification. The device prompt does not show the mandate: a compromised console can ask the owner to sign different limits.",
  ],
  [
    "Pending transactions have no expiry",
    "The node counts pooled payments toward the daily budget and refuses excess payments on arrival. It drops payments invalidated by a new block, including a freeze or changed mandate. Transaction expiry is not part of the Ethereum transaction format.",
  ],
  [
    "The relayer can allow senders",
    "The demo relayer holds a TxAllowList manager key. It registers agents before allowing them to send, but a compromised host could allow an address outside any mandate. The admin can revoke this role. Console actions also depend on the relayer being available.",
  ],
  [
    "Transaction-type coverage",
    "The pool accepts agent transaction types 0, 1 and 2. Under rule v1 the block check rejects only blob hashes; rule v2 (on Fuji from block 491) checks the type in both places and refuses a set-code authority that is an agent. Its list of native precompiles an agent may not pay is fixed.",
  ],
  [
    "The bridge relayer needs a filter",
    "The ICM relayer cannot decode the Sealed precompile entries in the chain config. On Fuji it reads the node through an operator-run proxy that removes those entries from that one answer. Warp settings and messages are unchanged; the destination still checks Warp signatures.",
  ],
];

const vi: typeof en = [
  [
    "Chỉ tài sản thử",
    "Coin trên L1 này không có giá trị quy đổi. Bản mẫu này không phải dịch vụ thanh toán.",
  ],
  [
    "Quyền của bên vận hành",
    "Đội giữ khoá validator, khoá quản trị và có thể nâng cấp mạng. Node từ chối bản nâng cấp tắt AgentPolicy hoặc ghi đè dữ liệu của nó; một bản node khác thì không bị phép kiểm này ràng buộc. Đội cam kết không nâng cấp tác động tới địa chỉ agent. Khoá quản trị cũng có quyền đúc coin gốc; dự án chỉ dùng cầu nối để đúc.",
  ],
  [
    "Coin gốc, trên L1 này",
    "Quy tắc áp dụng cho giao dịch coin gốc của L1, không áp dụng cho tài sản trên chain khác hay chữ ký ngoài chain như permit. Việc triển khai contract theo danh sách được phép.",
  ],
  [
    "Vẫn chi được trong uỷ quyền",
    "Khoá lộ vẫn trả được cho người bán được phép trong hạn mức, cho tới khi đóng băng hoặc hết hạn. Hạn mức ngày đặt lại lúc 00:00 UTC (07:00 Việt Nam), không tính theo cửa sổ trượt: có thể dùng ngân sách của hai ngày trong vài phút quanh mốc này. Với luật v2 (trên Fuji từ block 491) giới hạn gas phải bằng đúng gas tối thiểu của khoản trả, tip tối đa 1 gwei, và uỷ quyền đặt bằng setMandateV2 có thêm hạn mức phí mỗi ngày; uỷ quyền cũ chưa có hạn mức phí cho tới khi đặt lại.",
  ],
  [
    "Vẫn có thể phá rối",
    "Người giữ khoá có thể dùng hết ngân sách ngày hoặc chiếm nonce. Phí được tính vào hạn mức.",
  ],
  [
    "Mô phỏng không phải chấp nhận",
    "eth_call và eth_estimateGas không áp dụng quy tắc uỷ quyền. Dịch vụ đọc uỷ quyền từ precompile để kiểm tra.",
  ],
  [
    "Thử thách không chứng minh độ an toàn",
    "Thử thách mở đo hệ thống đã được thử như thế nào. Recorder kiểm bất biến số dư, không kiểm độc lập mọi phần của quy tắc chi tiêu.",
  ],
  [
    "Uy tín là bản ghi riêng",
    "Bản ghi ERC-8004 chỉ đáng tin bằng người viết nó. Hãy kiểm client gửi phản hồi là ReputationReceiver đã triển khai. Thông điệp liên chain chuyển bản ghi, không thực thi quy tắc chi tiêu.",
  ],
  [
    "Cần tích hợp phương thức riêng",
    "Người bán phải thêm mạng và phương thức signed-native-tx vào tích hợp x402. Client x402 chuẩn không trả được. Người bán phải tin facilitator hoặc tự kiểm chain.",
  ],
  [
    "Phạm vi chứng thực passkey",
    "Với luật v1, chứng thực gắn với chain ID, agent và nonce, và mạng cục bộ với Fuji dùng cùng chain ID. Với luật v2 (trên Fuji từ block 491) chứng thực gắn thêm network ID và blockchain ID, nên chứng thực cho bản triển khai này bị bản kia từ chối. Lệnh đóng băng v2 ký sẵn được nhưng vẫn phải do một địa chỉ được phép gửi.",
  ],
  [
    "Kiểm WebAuthn có giới hạn",
    "Precompile kiểm chữ ký, challenge và cờ User Present, không kiểm origin hay rpIdHash, cũng không bắt buộc User Verification. Hộp thoại thiết bị không hiện uỷ quyền: console bị chiếm có thể yêu cầu chủ ký giới hạn khác.",
  ],
  [
    "Giao dịch chờ không có thời hạn riêng",
    "Node tính khoản trong pool vào ngân sách ngày và từ chối khoản vượt hạn mức ngay khi nhận. Node loại khoản không còn hợp lệ sau block mới, kể cả khi đóng băng hoặc đổi uỷ quyền. Định dạng giao dịch Ethereum không có thời hạn giao dịch.",
  ],
  [
    "Relayer có thể cho phép người gửi",
    "Relayer demo giữ khoá quản lý TxAllowList. Nó đăng ký agent trước khi cho gửi, nhưng host bị chiếm có thể cho phép địa chỉ ngoài uỷ quyền. Quản trị viên có thể thu hồi quyền này. Thao tác qua console cũng phụ thuộc relayer hoạt động.",
  ],
  [
    "Phạm vi loại giao dịch",
    "Pool nhận giao dịch agent loại 0, 1 và 2. Với luật v1, phép kiểm block chỉ từ chối blob hash; luật v2 (trên Fuji từ block 491) kiểm loại ở cả hai chỗ và từ chối set-code authority là agent. Danh sách precompile gốc agent không được trả tới là cố định.",
  ],
  [
    "Relayer cầu nối cần bộ lọc",
    "Relayer ICM không giải mã được các mục precompile riêng của Sealed trong cấu hình chain. Trên Fuji nó đọc node qua một proxy do bên vận hành chạy, proxy bỏ các mục đó khỏi đúng câu trả lời này. Cấu hình Warp và thông điệp giữ nguyên; chain đích vẫn kiểm chữ ký Warp.",
  ],
];

export const limitationsText = (lang: Lang) => (lang === "vi" ? vi : en);
