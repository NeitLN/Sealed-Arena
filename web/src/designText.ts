import type { Lang } from "./i18n.js";

const en = {
  trust: "Fuji testnet · one validator, run by the team",
  risk: "If the key leaks, whoever holds it can still spend inside the mandate: at most your daily cap per UTC day, fees included, until you freeze it.",
  mechanism:
    "A contract wallet checks payments when its code runs. Sealed puts the owner’s spending limits in the node’s transaction-validity rule, binding the agent’s key on this L1.",
  evidence: "Measured. With the limits in view.",
  evidenceIntro:
    "The same attack cases. Four ways to hold a spending key. Each mark is one case, not a prediction of real-world safety.",
  recorded: "Recorded",
  wallets: ["Plain wallet", "Caps-only wallet", "Caps + payee list", "Sealed L1"],
  t0: "Outside the mandate (T0)",
  t1: "Unwanted, inside the mandate (T1)",
  benign: "Benign payments completed",
  legend: "Filled ×: coins left outside the mandate. Open circle: no T0 recorded.",
  tie: "A contract wallet with a payee list (O+) matches Sealed on T0.",
  t1Note:
    "Sealed does not stop T1. A permitted payment may still be unwanted. Fees count toward its cap; the lower T1 count is not evidence of better protection against deception.",
  baselineNote:
    "Wallet baselines are written by the team for this comparison; they do not represent audited wallet products.",
  leaked: "When the key is already exposed",
  leakedLabel: "leaked-key cases passed on Fuji",
  memory: "When the agent follows a planted note",
  followed: "runs followed the note",
  refused: "payments to the attacker refused",
  memoryNote:
    "One model, local Sealed L1. The task asked the agent to read its notes. Sealed limits where the payment can go; the agent can still be tricked.",
  pages: "Separate injected-page runs followed",
  liveLoad: "Try a real payment",
  liveHint: "Opens the public-key transaction controls. Test assets only.",
  receipt: "A spending key. A defined boundary.",
  cardCaption: "Illustration · caps from the recorded run",
  perPayment: "Per payment · max fee included",
  perDay: "Per UTC day",
  permission: "OWNER-SIGNED PERMISSION",
  rule: "Checked at the node",
  noTransaction: "No transaction sent by this illustration",
  liveTitle: "The challenge is open.",
  liveBody: "Use the published private key. Send a transaction. Inspect the node’s answer.",
  liveSource: "Live · public RPC gateway · off-chain counts",
  liveUnavailable: "Live data is unavailable right now.",
  waiting: "Connecting to the public gateway…",
  accepted: "Accepted",
  refusedStatus: "Refused",
  unavailable: "Unavailable",
  avalanche: "Built on Avalanche",
  avalancheBody:
    "A custom validity rule, an EVM environment, and test USDC bridged from Fuji C-Chain.",
  precompile: "AgentPolicy precompile",
  bridge: "ICTT token bridge",
  payment: "x402 · custom signed-native-tx method",
  registry: "ERC-8004 registration",
  footer: "Sealed Arena team · Avalanche hackathon project",
  rules: "Scope, rules & limitations",
  compare: "Evidence & tradeoffs",
  business: "For builders",
  console: "Owner console",
  arena: "Open challenge",
  workflow: ["Passkey", "Link agent", "Set limits", "Try a payment"],
  next: "Your next step",
  emptyAgent:
    "Your agent’s spending card will appear here. Create a passkey, then get a demo agent or link your own.",
  signPreview: "What you are about to sign",
  previewNote:
    "Review these limits here. The device’s passkey prompt does not display the mandate.",
  capRisk:
    "If this key leaks: up to {cap} USDC per UTC day, fees included, to the allowed payees ({payees}), until you freeze it or {expiry}.",
  pendingMandate:
    "Once your agent is linked, set its payees, limits and expiry here. Then try an allowed and a refused payment.",
  ownKeyHint:
    "Using your own agent? Send a payment with your own client. These test buttons become available when this browser holds a demo agent key.",
  privateDemo: "Inspect the demo private key",
  privateDemoNote:
    "This is a testnet key provided by the relayer and stored in this browser. It is separate from your owner passkey. Never fund it on another chain.",
  businessTitle: "Known sellers. Defined spending.",
  businessLead:
    "A working prototype for marketplaces where agents buy data and APIs from approved sellers. The marketplace onboards sellers; each owner sets the spending boundary.",
  flow: ["Agent platform", "Owner-signed mandate", "Approved seller"],
  flowNote:
    "Proposed model · a fee per agent under a mandate. No pricing or customer traction claimed.",
  partner: "Explore a design partnership",
  partnerNote:
    "Run a closed marketplace? Tell the team about your seller network and agent payment needs in a GitHub issue.",
  partnerAction: "Start a conversation on GitHub",
  compareTitle: "Same attacks. Different boundaries.",
  burst: "Where a payment stops matters.",
  burstIntro:
    "Secondary experiment: simultaneous payments. Reverted means included in a block, then failed. Refused on arrival means the node did not admit the payment to its transaction pool.",
  settled: "In blocks",
  pending: "Waiting in the pool",
  poolRefused: "Refused on arrival",
  reverted: "Reverted in blocks",
  keyCopy: "Copy published private key",
  keyCopied: "Private key copied",
  keyCopyFailed: "Select the key below to copy it manually.",
  back: "Back to the challenge",
};

const vi: typeof en = {
  trust: "Fuji testnet · một validator, do đội vận hành",
  risk: "Nếu khoá lộ, người cầm khoá vẫn chi được trong uỷ quyền: tối đa hạn mức ngày (theo ngày UTC, đã gồm phí), cho tới khi bạn đóng băng.",
  mechanism:
    "Ví hợp đồng kiểm khoản trả khi mã của ví chạy. Sealed đưa giới hạn chi tiêu của chủ sở hữu vào quy tắc hợp lệ của giao dịch tại node, ràng buộc khoá agent trên L1 này.",
  evidence: "Số đo rõ ràng. Giới hạn minh bạch.",
  evidenceIntro:
    "Cùng bộ ca tấn công, bốn cách giữ khoá chi tiêu. Mỗi dấu là một ca thử, không phải dự đoán độ an toàn ngoài thực tế.",
  recorded: "Bản ghi",
  wallets: ["Ví thường", "Ví chỉ có hạn mức", "Hạn mức + người nhận", "Sealed L1"],
  t0: "Ngoài uỷ quyền (T0)",
  t1: "Trong uỷ quyền nhưng không mong muốn (T1)",
  benign: "Khoản trả hợp lệ đã hoàn thành",
  legend: "Dấu × đặc: coin ra ngoài uỷ quyền. Vòng tròn rỗng: chưa ghi nhận T0.",
  tie: "Ví hợp đồng có danh sách người nhận (O+) ngang Sealed về T0.",
  t1Note:
    "Sealed không ngăn T1. Khoản trả được phép vẫn có thể trái ý chủ sở hữu. Phí tính vào hạn mức; số T1 thấp hơn không chứng minh khả năng chống lừa tốt hơn.",
  baselineNote:
    "Các ví đối chứng do đội viết cho phép so sánh này, không đại diện cho sản phẩm ví đã được kiểm toán.",
  leaked: "Khi private key đã bị lộ",
  leakedLabel: "ca thử khoá lộ đạt yêu cầu trên Fuji",
  memory: "Khi agent làm theo ghi chú bị cài",
  followed: "lượt làm theo ghi chú",
  refused: "khoản trả cho kẻ tấn công bị từ chối",
  memoryNote:
    "Một model, Sealed L1 cục bộ. Tác vụ yêu cầu agent đọc ghi chú. Sealed giới hạn nơi khoản trả có thể đến; agent vẫn có thể bị lừa.",
  pages: "Lượt làm theo trang chèn lệnh trong phép thử riêng",
  liveLoad: "Thử giao dịch thật",
  liveHint: "Mở các nút gửi giao dịch bằng private key đã công bố. Chỉ dùng tài sản thử.",
  receipt: "Một khoá chi tiêu. Giới hạn rõ ràng.",
  cardCaption: "Minh hoạ · hạn mức từ lượt chạy đã ghi",
  perPayment: "Mỗi lần · đã gồm phí tối đa",
  perDay: "Mỗi ngày UTC",
  permission: "UỶ QUYỀN DO CHỦ SỞ HỮU KÝ",
  rule: "Node kiểm tra",
  noTransaction: "Minh hoạ này không gửi giao dịch",
  liveTitle: "Thử thách đang mở.",
  liveBody: "Dùng private key đã công bố. Gửi giao dịch. Kiểm tra câu trả lời của node.",
  liveSource: "Trực tiếp · gateway RPC công khai · đếm ngoài chain",
  liveUnavailable: "Hiện chưa lấy được dữ liệu trực tiếp.",
  waiting: "Đang kết nối gateway công khai…",
  accepted: "Đã nhận",
  refusedStatus: "Bị từ chối",
  unavailable: "Chưa có dữ liệu",
  avalanche: "Xây dựng trên Avalanche",
  avalancheBody:
    "Quy tắc hợp lệ riêng, môi trường EVM và USDC thử được chuyển từ Fuji C-Chain qua cầu nối.",
  precompile: "Precompile AgentPolicy",
  bridge: "Cầu nối token ICTT",
  payment: "x402 · phương thức riêng signed-native-tx",
  registry: "Đăng ký ERC-8004",
  footer: "Đội Sealed Arena · dự án hackathon Avalanche",
  rules: "Phạm vi, luật & hạn chế",
  compare: "Bằng chứng & đánh đổi",
  business: "Dành cho nhà phát triển",
  console: "Bảng điều khiển chủ sở hữu",
  arena: "Thử thách mở",
  workflow: ["Passkey", "Liên kết agent", "Đặt giới hạn", "Thử thanh toán"],
  next: "Bước tiếp theo",
  emptyAgent:
    "Thẻ chi tiêu của agent sẽ hiện ở đây. Tạo passkey, rồi lấy agent demo hoặc liên kết agent của bạn.",
  signPreview: "Nội dung bạn sắp ký",
  previewNote:
    "Kiểm tra giới hạn tại đây. Hộp thoại passkey của thiết bị không hiển thị nội dung uỷ quyền.",
  capRisk:
    "Nếu khoá này bị lộ: tối đa {cap} USDC mỗi ngày UTC, đã gồm phí, cho {payees} người nhận được phép, đến khi bạn đóng băng hoặc tới {expiry}.",
  pendingMandate:
    "Sau khi liên kết agent, đặt người nhận, hạn mức và thời hạn tại đây. Sau đó thử khoản trả được phép và khoản bị từ chối.",
  ownKeyHint:
    "Bạn dùng agent riêng? Hãy gửi khoản trả bằng client của bạn. Các nút thử ở đây dùng khi trình duyệt giữ private key của agent demo.",
  privateDemo: "Xem private key của agent demo",
  privateDemoNote:
    "Đây là khoá testnet do relayer cung cấp và lưu trong trình duyệt, tách biệt với passkey của chủ sở hữu. Không nạp tài sản cho khoá này trên chain khác.",
  businessTitle: "Người bán đã duyệt. Chi tiêu có giới hạn.",
  businessLead:
    "Bản mẫu hoạt động dành cho marketplace nơi agent mua dữ liệu và API từ người bán đã duyệt. Marketplace tiếp nhận người bán; từng chủ sở hữu đặt giới hạn chi tiêu.",
  flow: ["Nền tảng agent", "Uỷ quyền do chủ ký", "Người bán đã duyệt"],
  flowNote:
    "Mô hình đề xuất · phí theo mỗi agent có uỷ quyền. Chưa công bố giá hay tín hiệu khách hàng.",
  partner: "Cùng thử nghiệm một tích hợp",
  partnerNote:
    "Bạn vận hành marketplace khép kín? Chia sẻ mạng lưới người bán và nhu cầu thanh toán của agent qua GitHub issue.",
  partnerAction: "Trao đổi với đội trên GitHub",
  compareTitle: "Cùng tấn công. Khác ranh giới.",
  burst: "Nơi khoản trả dừng lại có ý nghĩa.",
  burstIntro:
    "Phép thử bổ sung: gửi đồng thời nhiều khoản. Revert nghĩa là đã vào block rồi thất bại. Bị từ chối khi nhận nghĩa là node không nhận khoản trả vào pool.",
  settled: "Vào block",
  pending: "Đang chờ trong pool",
  poolRefused: "Bị từ chối khi nhận",
  reverted: "Revert trong block",
  keyCopy: "Sao chép private key đã công bố",
  keyCopied: "Đã sao chép private key",
  keyCopyFailed: "Chọn khoá bên dưới để sao chép thủ công.",
  back: "Quay lại thử thách",
};

export const designText = (lang: Lang) => (lang === "vi" ? vi : en);
