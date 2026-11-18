import type { Lang } from "./i18n.js";

/**
 * Text of /business. Everything here restates the README ("Why on-chain…", "Business model
 * (hypothesis)", limits); nothing about customers, prices or traction, because there are none.
 */
const en = {
  nav: "Business",
  eyebrow: "For businesses",
  title: "Give your agent a card, not the wallet.",
  lead: "Sealed Arena is for teams whose AI agents pay for data and APIs. The owner sets the payees, a cap per payment, a cap per day and an expiry with a passkey. The Sealed L1 checks every transaction the agent's key signs against them.",
  hypothesisBadge: "Hypothesis · no customers yet",
  ctaConsole: "Open the owner console",
  ctaEvaluation: "Read the evaluation",
  whoTitle: "Who it is for",
  who: [
    [
      "Closed marketplaces",
      "Operators with a known seller network, where agents buy APIs and data. Each owner sets a mandate; the node refuses payments outside it. This is the first-customer hypothesis.",
    ],
    [
      "Developers",
      "An EVM JSON-RPC endpoint (chain id 261126) with USDC bridged from the Fuji C-Chain as the native coin. Sending is allow-listed: the team adds the agent's address first; then the owner registers it, sets its mandate with a passkey, and it pays with our x402 method.",
    ],
  ],
  useTitle: "Use cases we expect (not tested with customers)",
  use: [
    [
      "Buying data and API calls",
      "The agent pays with x402 (our signed-native-tx method), and only the sellers on its list can receive money.",
    ],
    [
      "A daily budget",
      "A research agent may spend up to a set amount per day; the cap counts fees too.",
    ],
    [
      "Stop it from your phone",
      "The owner freezes the agent with a passkey; nothing it signs is accepted until it is unfrozen.",
    ],
  ],
  moneyTitle: "How it would earn",
  money: [
    [
      "A fee per agent under a mandate",
      "Paid by the platforms that hold wallets for their agents.",
    ],
    [
      "Transaction fees on the L1",
      "A second source. The current genesis does not enable fee recipients, so collecting them needs a network upgrade.",
    ],
    [
      "Money in and out",
      "USDC comes in from the C-Chain through the ICTT bridge; sellers withdraw to the C-Chain the same way.",
    ],
  ],
  notTitle: "What it does not do",
  not: [
    "It does not know what the owner wanted: an inflated price from an allowed seller, inside the caps, still goes through.",
    "Running this L1 requires trusting its operator and admin keys; independent operation has not been demonstrated.",
    "Testnet only: every coin here, including the test USDC, has no monetary value.",
    "Sellers cannot take these payments with a standard x402 client or facilitator: they must add the network eip155:261126 and our payment method.",
    "The agent pays only the L1's native coin (bridged test USDC) to plain addresses: no tokens, no contract calls.",
  ],
  checkTitle: "Check it yourself",
  check: [
    ["The node change", "Inspect the transaction-pool rule, block-validity check and their tests."],
    ["Every address", "deployments/fuji.json lists every contract and account on Fuji."],
    ["The evaluation", "Generated from the raw result files, with every case and its limits."],
    ["The limits", "Written down in the README, next to the results."],
  ],
  limitsLink: "Limits in the README",
  evaluationLink: "docs/EVALUATION.md",
  readmeLink: "Quick start",
};

export type BusinessText = typeof en;

const vi: BusinessText = {
  nav: "Doanh nghiệp",
  eyebrow: "Dành cho doanh nghiệp",
  title: "Đưa agent một chiếc thẻ, không phải cả ví.",
  lead: "Sealed Arena dành cho các đội có agent AI tự trả tiền mua dữ liệu và API. Chủ đặt danh sách người nhận, hạn mức mỗi lần trả, hạn mức mỗi ngày và ngày hết hạn bằng passkey. Sealed L1 kiểm mọi giao dịch mà key của agent ký theo các điều đó.",
  hypothesisBadge: "Giả thuyết · chưa có khách hàng",
  ctaConsole: "Mở bảng điều khiển chủ sở hữu",
  ctaEvaluation: "Đọc kết quả đánh giá",
  whoTitle: "Dành cho ai",
  who: [
    [
      "Marketplace khép kín",
      "Bên vận hành mạng lưới người bán đã biết, nơi agent mua API và dữ liệu. Từng chủ sở hữu đặt uỷ quyền; node từ chối khoản trả ngoài phạm vi đó. Đây là giả thuyết khách hàng đầu tiên.",
    ],
    [
      "Lập trình viên",
      "Endpoint EVM JSON-RPC (chain id 261126), coin gốc là USDC chuyển từ Fuji C-Chain qua cầu nối. Việc gửi tiền theo danh sách được phép: đội thêm địa chỉ agent trước; sau đó chủ đăng ký agent, đặt uỷ quyền bằng passkey, và agent trả tiền bằng phương thức x402 của dự án.",
    ],
  ],
  useTitle: "Tình huống dùng dự kiến (chưa thử với khách hàng)",
  use: [
    [
      "Mua dữ liệu và lượt gọi API",
      "Agent trả bằng x402 (phương thức ký giao dịch coin gốc của dự án), và chỉ người bán trong danh sách mới nhận được tiền.",
    ],
    [
      "Ngân sách theo ngày",
      "Agent nghiên cứu được tiêu tối đa một số tiền mỗi ngày; hạn mức tính cả phí.",
    ],
    [
      "Dừng agent từ điện thoại",
      "Chủ dừng agent bằng passkey; mọi thứ agent ký đều bị từ chối cho tới khi mở lại.",
    ],
  ],
  moneyTitle: "Cách có doanh thu",
  money: [
    ["Phí theo mỗi agent có uỷ quyền", "Do các nền tảng giữ ví cho agent trả."],
    [
      "Phí giao dịch trên L1",
      "Nguồn thứ hai. Genesis hiện tại chưa bật người nhận phí, nên muốn thu cần nâng cấp mạng.",
    ],
    [
      "Tiền vào và ra",
      "USDC vào từ C-Chain qua cầu nối ICTT; người bán rút về C-Chain cùng đường đó.",
    ],
  ],
  notTitle: "Những gì nó không làm",
  not: [
    "Nó không biết chủ thật sự muốn gì: người bán được phép đòi giá cao hơn mà vẫn trong hạn mức thì khoản trả vẫn qua.",
    "Vận hành L1 này đòi hỏi tin bên vận hành và khoá quản trị; chưa chứng minh việc vận hành bởi các bên độc lập.",
    "Chỉ là testnet: mọi coin ở đây, kể cả USDC thử, không có giá trị tiền.",
    "Người bán không nhận được các khoản này bằng client hay facilitator x402 chuẩn: phải thêm mạng eip155:261126 và phương thức thanh toán của dự án.",
    "Agent chỉ trả coin gốc của L1 (USDC thử đã bắc cầu) cho địa chỉ thường: không token, không gọi contract.",
  ],
  checkTitle: "Tự kiểm",
  check: [
    [
      "Thay đổi trong node",
      "Xem quy tắc tại pool, phép kiểm hợp lệ của block và các bài kiểm thử.",
    ],
    ["Mọi địa chỉ", "deployments/fuji.json ghi mọi contract và tài khoản trên Fuji."],
    ["Kết quả đánh giá", "Sinh từ các file kết quả gốc, có từng ca và giới hạn."],
    ["Giới hạn", "Ghi trong README, ngay cạnh kết quả."],
  ],
  limitsLink: "Giới hạn trong README",
  evaluationLink: "docs/EVALUATION.md",
  readmeLink: "Bắt đầu nhanh",
};

export const businessText = (lang: Lang): BusinessText => (lang === "vi" ? vi : en);
