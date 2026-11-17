import type { Lang } from "./i18n.js";

const en = {
  eyebrow: "Avalanche L1 · AI agents",
  headline: "Spending limits enforced by the chain, not by the prompt.",
  lead: "An AI agent's key can sign anything. On the Sealed L1, validators refuse any payment outside the mandate its owner signed with a passkey: such a payment is not reverted, it never enters a block.",
  tryIt: "Try to break it",
  seeCompare: "See the comparison",
  ownerConsole: "Owner console",
  liveTitle: "Live on Fuji, right now",
  liveNote: "The challenge agent's private key is public. These numbers update every few seconds.",
  refused: "Payments refused (counted off-chain by our RPC gateway)",
  senders: "Distinct senders",
  survival: "Survival",
  survivalUnit: "USDC·hours",
  survivalHelp:
    "Coins kept inside the mandate multiplied by the time they stayed there, recorded on chain by the ArenaRecorder contract. It can be published to ERC-8004 on the Fuji C-Chain.",
  status: "On-chain check",
  intact: "No breach",
  breached: "Breached",
  liveDown: "Live data is unavailable right now.",
  howTitle: "How it works",
  step1Title: "The owner signs a mandate",
  step1: "With a passkey: allowed payees, a cap per payment, a cap per day and an expiry.",
  step2Title: "The agent pays with its own key",
  step2: "For data and APIs, for example with x402. The key may be tricked or leaked.",
  step3Title: "Validators check every payment",
  step3:
    "On arrival and again when building a block. A payment outside the mandate never enters a block.",
  compareTitle: "Same agent, three wallets",
  compareNote: "Measured on Fuji with test USDC.",
  plain: "Plain wallet",
  plainResult:
    "Lost the whole balance when the attacker's transfer was signed (a hand-written transcript; live agents ignored injected pages in 0/30 runs).",
  limit: "Limit contract wallet",
  limitResult: "{passed} of {attempts} passed the check, then {reverted} reverted inside blocks",
  sealed: "Sealed L1",
  sealedResult: "Refused by the node; refused payments never enter a block",
  thisProject: "This project",
  revertedShort: "reverted in blocks",
  fullResults: "Full results",
  evaluation: "Evaluation report",
};

type Text = typeof en;

const vi: Text = {
  eyebrow: "Avalanche L1 · AI agent",
  headline: "Hạn mức chi tiêu do chain thực thi, không phải do prompt.",
  lead: "Khoá của AI agent ký được mọi thứ. Trên L1 Sealed, validator từ chối mọi khoản trả nằm ngoài uỷ quyền mà chủ ví đã ký bằng passkey: khoản đó không bị revert, nó không bao giờ vào block.",
  tryIt: "Thử phá giới hạn",
  seeCompare: "Xem so sánh",
  ownerConsole: "Trang chủ ví",
  liveTitle: "Đang chạy trên Fuji",
  liveNote:
    "Private key của agent thử thách được công khai. Các số dưới đây cập nhật vài giây một lần.",
  refused: "Khoản trả bị từ chối (gateway RPC của đội đếm, ngoài chain)",
  senders: "Số người gửi",
  survival: "Sống sót",
  survivalUnit: "USDC·giờ",
  survivalHelp:
    "Số coin giữ được trong uỷ quyền nhân với thời gian giữ, do contract ArenaRecorder ghi trên chain. Số này có thể được công bố lên ERC-8004 ở Fuji C-Chain.",
  status: "Kiểm trên chain",
  intact: "Không vi phạm",
  breached: "Đã vi phạm",
  liveDown: "Hiện chưa lấy được dữ liệu trực tiếp.",
  howTitle: "Cách hoạt động",
  step1Title: "Chủ ví ký uỷ quyền",
  step1: "Bằng passkey: người nhận được phép, hạn mức mỗi lần, hạn mức mỗi ngày và hạn dùng.",
  step2Title: "Agent trả tiền bằng khoá của nó",
  step2: "Mua dữ liệu, API, ví dụ qua x402. Khoá có thể bị lừa hoặc bị lộ.",
  step3Title: "Validator kiểm mọi khoản trả",
  step3: "Khi nhận và lần nữa khi dựng block. Khoản trả ngoài uỷ quyền không bao giờ vào block.",
  compareTitle: "Một agent, ba loại ví",
  compareNote: "Đo trên Fuji bằng USDC thử.",
  plain: "Ví thường",
  plainResult:
    "Mất toàn bộ số dư khi khoản chuyển cho kẻ tấn công được ký (bản ghi dựng tay; agent thật bỏ qua trang cài lệnh ở 0/30 lượt).",
  limit: "Ví hạn mức dạng contract",
  limitResult: "{passed}/{attempts} qua bước kiểm, rồi {reverted} revert trong block",
  sealed: "L1 Sealed",
  sealedResult: "Node từ chối; khoản bị từ chối không vào block nào",
  thisProject: "Dự án này",
  revertedShort: "revert trong block",
  fullResults: "Xem đầy đủ",
  evaluation: "Báo cáo đánh giá",
};

export const landingText = (lang: Lang): Text => (lang === "vi" ? vi : en);
