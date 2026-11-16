import { useCallback, useState } from "react";

export type Lang = "en" | "vi";

const en = {
  title: "Owner console",
  intro:
    "Your agent can only pay inside the mandate you set here. Every change is signed with your passkey and checked by the chain.",
  testnet: "Testnet. Assets have no monetary value.",
  language: "Language",
  passkeySection: "1. Your passkey",
  passkeyHelp: "The passkey stays on your device. Only its public key goes on chain.",
  createPasskey: "Create passkey",
  passkeyReady: "Passkey ready",
  passkeyMissing: "No passkey on this browser yet.",
  publicKey: "Public key",
  forgetPasskey: "Forget on this browser",
  agentSection: "2. Your agent",
  agentAddress: "Agent address",
  agentHelp: "The address your agent pays from.",
  registerHelp:
    "To link the agent to your passkey, the agent key signs this message (raw 32-byte hash, no prefix):",
  agentSignature: "Agent signature",
  agentPrivateKey: "Agent private key (local network only)",
  privateKeyWarning:
    "Local network only: the key is used in this browser to sign, and is never sent. Never paste a real key.",
  register: "Link agent to passkey",
  registeredToYou: "Linked to this passkey",
  registeredToOther: "Linked to another passkey",
  notRegistered: "Not linked yet",
  mandateSection: "3. Mandate",
  payees: "Allowed payees",
  payeesHelp: "One address per line, up to 16.",
  perTxCap: "Per payment (USDC)",
  dailyCap: "Per day (USDC)",
  validDays: "Valid (days)",
  signMandate: "Sign and set mandate",
  signAnyway: "Sign anyway",
  status: "Status",
  active: "Active",
  frozen: "Frozen",
  freeze: "Freeze agent",
  unfreeze: "Unfreeze agent",
  freezeHelp: "Freezing stops every payment from the agent key at once.",
  notOwnerNote:
    "This passkey is not the one linked to the agent: the chain will refuse its signature.",
  spentToday: "Spent today",
  totalCharged: "Charged in total",
  balance: "Agent balance",
  expires: "Mandate expires",
  resetsAt: "Daily budget resets",
  resetsNote: "00:00 UTC (07:00 Vietnam time)",
  noMandate: "No mandate set.",
  done: "Done on chain",
  failed: "Refused",
  working: "Waiting for your passkey and the chain…",
  tx: "Transaction",
  // validation
  amount_invalid: "Enter an amount like 0.5 (up to 18 decimals).",
  days_invalid: "Enter a whole number of days from 1 to 365.",
  payees_empty: "Add at least one payee.",
  payees_too_many: "At most 16 payees.",
  payee_invalid: "One of the lines is not an address.",
  payee_duplicate: "The same payee appears twice.",
  payee_precompile: "is a precompile address: coins sent there cannot be taken back.",
  payee_has_code: "has code (a contract): the chain will refuse payments to it.",
  capWarning: "The per-payment limit is above the daily budget.",
  address_invalid: "Not a valid address.",
  signature_invalid: "Paste a 65-byte signature (0x + 130 hex characters).",
  key_invalid: "Not a valid private key.",
  no_passkey: "Create a passkey first.",
  passkey_unsupported: "This browser cannot create passkeys here (needs HTTPS or localhost).",
  relayer_down: "The relayer is not reachable.",
};

type Key = keyof typeof en;

const vi: Record<Key, string> = {
  title: "Trang chủ ví",
  intro:
    "Agent của bạn chỉ trả được tiền trong uỷ quyền bạn đặt ở đây. Mỗi thay đổi được ký bằng passkey của bạn và do chain kiểm.",
  testnet: "Testnet. Tài sản không có giá trị quy đổi.",
  language: "Ngôn ngữ",
  passkeySection: "1. Passkey của bạn",
  passkeyHelp: "Passkey nằm trên thiết bị của bạn. Chỉ khoá công khai được đưa lên chain.",
  createPasskey: "Tạo passkey",
  passkeyReady: "Đã có passkey",
  passkeyMissing: "Trình duyệt này chưa có passkey.",
  publicKey: "Khoá công khai",
  forgetPasskey: "Quên trên trình duyệt này",
  agentSection: "2. Agent của bạn",
  agentAddress: "Địa chỉ agent",
  agentHelp: "Địa chỉ mà agent dùng để trả tiền.",
  registerHelp:
    "Để gắn agent với passkey, khoá của agent ký thông điệp này (hash 32 byte, không thêm tiền tố):",
  agentSignature: "Chữ ký của agent",
  agentPrivateKey: "Private key của agent (chỉ mạng local)",
  privateKeyWarning:
    "Chỉ cho mạng local: khoá được dùng để ký ngay trong trình duyệt và không được gửi đi. Đừng dán khoá thật.",
  register: "Gắn agent với passkey",
  registeredToYou: "Đã gắn với passkey này",
  registeredToOther: "Đã gắn với một passkey khác",
  notRegistered: "Chưa gắn",
  mandateSection: "3. Uỷ quyền",
  payees: "Người nhận được phép",
  payeesHelp: "Mỗi dòng một địa chỉ, tối đa 16.",
  perTxCap: "Mỗi lần (USDC)",
  dailyCap: "Mỗi ngày (USDC)",
  validDays: "Hiệu lực (ngày)",
  signMandate: "Ký và đặt uỷ quyền",
  signAnyway: "Vẫn ký",
  status: "Trạng thái",
  active: "Đang chạy",
  frozen: "Đã dừng",
  freeze: "Dừng agent",
  unfreeze: "Mở lại agent",
  freezeHelp: "Dừng agent chặn ngay mọi khoản chi từ khoá của agent.",
  notOwnerNote: "Passkey này không phải passkey đã gắn với agent: chain sẽ từ chối chữ ký của nó.",
  spentToday: "Đã tiêu hôm nay",
  totalCharged: "Tổng đã tính",
  balance: "Số dư agent",
  expires: "Uỷ quyền hết hạn",
  resetsAt: "Ngân sách ngày đặt lại",
  resetsNote: "00:00 UTC (07:00 giờ Việt Nam)",
  noMandate: "Chưa có uỷ quyền.",
  done: "Đã ghi lên chain",
  failed: "Bị từ chối",
  working: "Đang chờ passkey của bạn và chain…",
  tx: "Giao dịch",
  amount_invalid: "Nhập số tiền dạng 0.5 (tối đa 18 chữ số thập phân).",
  days_invalid: "Nhập số ngày nguyên từ 1 đến 365.",
  payees_empty: "Thêm ít nhất một người nhận.",
  payees_too_many: "Tối đa 16 người nhận.",
  payee_invalid: "Có dòng không phải là địa chỉ.",
  payee_duplicate: "Một người nhận bị lặp.",
  payee_precompile: "là địa chỉ precompile: coin gửi tới đó không lấy lại được.",
  payee_has_code: "có code (là contract): chain sẽ từ chối thanh toán tới địa chỉ này.",
  capWarning: "Hạn mức mỗi lần trả lớn hơn ngân sách ngày.",
  address_invalid: "Địa chỉ không hợp lệ.",
  signature_invalid: "Dán chữ ký 65 byte (0x + 130 ký tự hex).",
  key_invalid: "Private key không hợp lệ.",
  no_passkey: "Hãy tạo passkey trước.",
  passkey_unsupported: "Trình duyệt này không tạo được passkey ở đây (cần HTTPS hoặc localhost).",
  relayer_down: "Không kết nối được relayer.",
};

const dict: Record<Lang, Record<Key, string>> = { en, vi };

export type T = (k: string) => string;

const STORAGE = "sealed.lang";

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved === "en" || saved === "vi") return saved;
  } catch {
    // storage blocked: fall through
  }
  return navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

/** Current language, a setter that remembers it, and the lookup function. */
export function useI18n(): { lang: Lang; setLang: (l: Lang) => void; t: T } {
  const [lang, set] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    set(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      // not remembered: fine
    }
  }, []);
  const t = useCallback<T>((k) => dict[lang][k as Key] ?? k, [lang]);
  return { lang, setLang, t };
}

/** Both dictionaries have the same keys (checked at type level by `vi: Record<Key, string>`). */
export const KEYS = Object.keys(en) as Key[];
