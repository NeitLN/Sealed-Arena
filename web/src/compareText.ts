import agent from "./agentSummary.json";
import type { Lang } from "./i18n.js";

export type Tx = { tx: string; status: string; block: number };
export type Result = {
  at: string;
  /** When group S was last run on its own (its burst), if after `at`. */
  atS?: string;
  explorers: { cChain: string };
  P: { balanceBefore: string; attackerReceived: string; balanceAfter: string; tx: string };
  O: {
    caps: { perTx: string; daily: string };
    attempts: number;
    payment: string;
    passedVerifyBeforeSettle: number;
    settledOnChain: number;
    revertedOnChain: number;
    spent: string;
    txs: Tx[];
  };
  S: {
    caps: { perTx: string; daily: string };
    injection: { refused: boolean; reason: string };
    attempts: number;
    payment: string;
    refusedByPool: number;
    settledOnChain: number;
    leftOutOfBlocks: number;
    spent: string;
    txs: Tx[];
  };
};

/** One row of docs/EVALUATION.md's summary, written by `pnpm --filter attacks suite report`. */
export type EvalRow = { group: string; network: string; cases: number; t0: number; t1: number };

/** O+ and S (Sealed L1 on Fuji) from the 45-case evaluation. */
export function oPlusAndS(rows: EvalRow[]) {
  const oPlus = rows.find((r) => r.group === "O+");
  const s = rows.find((r) => r.group === "S" && r.network.startsWith("Sealed L1 on Fuji"));
  if (!oPlus || !s) throw new Error("evalSummary.json lacks O+ or S on Fuji");
  return { oPlus, s };
}

export const whyText = (lang: Lang, x: Result, rows: EvalRow[]) => {
  const { oPlus, s } = oPlusAndS(rows);
  const f = (a: number, n: number) => `${a}/${n}`;
  return lang === "vi"
    ? {
        title: "Sao không dùng ví hợp đồng?",
        intro:
          "Ví hợp đồng là lựa chọn hiển nhiên, và trong số đo của chúng tôi một ví tốt (O+) ngang S về T0. Hai cách khác nhau ở chỗ bảo đảm điều gì và tốn gì.",
        oPlus: "O+: ví hợp đồng có hạn mức và danh sách người nhận (Fuji C-Chain)",
        s: "S: Sealed L1",
        rows: [
          [
            "Tiền nằm ở đâu",
            "Trong contract ví; khoá agent ký uỷ quyền",
            "Trong tài khoản của chính khoá agent, là coin gốc của L1",
          ],
          [
            "Phép kiểm áp cho",
            "Các khoản đi qua code của ví (ở đây là uỷ quyền EIP-3009 kiểm trong isValidSignature). Tài sản khoá giữ ngoài ví không được kiểm",
            "Mọi giao dịch gửi từ địa chỉ agent trên L1 này. Chữ ký ngoài chain không được thấy (giới hạn 3)",
          ],
          [
            "Phí",
            "Trả bằng AVAX bởi bên gửi khoản trả; nằm ngoài hạn mức",
            "Agent trả bằng cùng loại coin; phí tối đa được tính vào cả hai hạn mức",
          ],
          [
            "Khoản bị từ chối",
            `Hỏng ở bước kiểm trước khi settle, hoặc revert trong block (với O, cùng đường settle: ${x.O.revertedOnChain}/${x.O.attempts} revert trong lần chạy cùng lúc)`,
            "Node từ chối; không được đưa vào block",
          ],
          [`T0 trong ${oPlus.cases} ca`, f(oPlus.t0, oPlus.cases), f(s.t0, s.cases)],
          [
            `T1 trong ${oPlus.cases} ca`,
            f(oPlus.t1, oPlus.cases),
            `${f(s.t1, s.cases)}, thấp hơn chỉ vì phí tối đa được cộng vào mỗi khoản`,
          ],
          [
            "Một quy tắc cho mọi agent",
            "Mỗi ví là một contract riêng và có thể khác nhau",
            "Một quy tắc trong node; agent đã đăng ký không thoát ra được",
          ],
          [
            "Bạn phải tin ai",
            "Các validator của C-Chain (nhiều bên độc lập) và code của ví",
            "Validator của Sealed L1 (hiện có một, do đội vận hành), node đã vá và các khoá admin của đội",
          ],
          [
            "Thanh toán",
            "x402 với EIP-3009, người bán đã nhận sẵn",
            "Phương thức x402 riêng signed-native-tx; người bán thêm mạng và facilitator của chúng tôi",
          ],
          [
            "Chi phí áp dụng",
            "Triển khai một ví cho mỗi agent",
            "Chuyển USDC sang một L1 riêng; đội phải cập nhật bản fork Subnet-EVM",
          ],
        ],
        whenOPlus:
          "Khi O+ là lựa chọn tốt hơn: agent trả bằng USDC trên C-Chain, người bán dùng x402 chuẩn, và bạn muốn một chain do nhiều validator độc lập vận hành ngay hôm nay.",
        whenS:
          "Khi Sealed đáng cái giá của nó: bạn muốn hạn mức ràng buộc chính khoá, tính cả phí, không cần code ví cho từng agent, và chấp nhận một L1 riêng. Chúng tôi chưa chứng minh được khách hàng thấy điều này đáng giá.",
        note: "O+ không có trong lần chạy cùng lúc ở trên; kết quả 45 ca của nó nằm trong docs/EVALUATION.md.",
      }
    : {
        title: "Why not a contract wallet?",
        intro:
          "A contract wallet is the obvious alternative, and in our measurements a good one (O+) matches Sealed on T0. The two differ in what is guaranteed and what it costs.",
        oPlus: "O+: contract wallet with caps and a payee list (Fuji C-Chain)",
        s: "S: Sealed L1",
        rows: [
          [
            "Where the money sits",
            "In the wallet contract; the agent key signs authorisations",
            "In the agent key's own account, as the L1's native coin",
          ],
          [
            "What the check covers",
            "Payments that go through the wallet's code (here EIP-3009 authorisations checked in isValidSignature). Anything the key holds outside the wallet is not covered",
            "Every transaction sent from the agent's address on this L1. Off-chain signatures are not seen (limit 3)",
          ],
          [
            "Fees",
            "Paid in AVAX by whoever submits the payment; outside the caps",
            "Paid by the agent in the same coin; the maximum fee is counted in both caps",
          ],
          [
            "A refused payment",
            `Fails the check before settlement, or reverts inside a block (with O, same settlement path: ${x.O.revertedOnChain} of ${x.O.attempts} reverted in the burst run)`,
            "Refused by the node; not included in a block",
          ],
          [`T0 in ${oPlus.cases} cases`, f(oPlus.t0, oPlus.cases), f(s.t0, s.cases)],
          [
            `T1 in ${oPlus.cases} cases`,
            f(oPlus.t1, oPlus.cases),
            `${f(s.t1, s.cases)}, lower only because the maximum fee is added to each payment`,
          ],
          [
            "One rule for all agents",
            "Each wallet is its own contract and can differ",
            "One rule in the node; a registered agent cannot opt out",
          ],
          [
            "Who you trust",
            "The C-Chain's validators (many independent operators) and the wallet's code",
            "The Sealed L1's validator (one today, run by the team), the patched node and the team's admin keys",
          ],
          [
            "Payments",
            "x402 with EIP-3009, which sellers already accept",
            "Our x402 method signed-native-tx; sellers add the network and our facilitator",
          ],
          [
            "Cost to adopt",
            "Deploy a wallet per agent",
            "Bridge USDC to a separate L1; the team must keep a Subnet-EVM fork up to date",
          ],
        ],
        whenOPlus:
          "When O+ is the better choice: your agents pay in USDC on the C-Chain, your sellers use standard x402, and you want a chain run by many independent validators today.",
        whenS:
          "When Sealed is worth its price: you want the limit to hold for the key itself, fees included, with no wallet code per agent, and you accept a separate L1. We have not yet shown that customers find this worth the price.",
        note: "O+ was not part of the burst run above; its 45-case results are in docs/EVALUATION.md.",
      };
};

/** "15 of 15", from the agent transcripts (web/src/agentSummary.json, generated by the report). */
const refusedOf = `${agent.toAttacker.refused} of ${agent.toAttacker.tried}`;
const memory = `${agent.memory.followed}/${agent.memory.runs}`;

export const compareText = (lang: Lang, x: Result) =>
  lang === "vi"
    ? {
        title: "Một agent, ba loại ví",
        intro: `Cùng một agent, ba cách đưa tiền cho nó. Kết quả lần chạy trên Fuji lúc ${x.at.slice(0, 16).replace("T", " ")} UTC${x.atS ? ` (S chạy lại lúc ${x.atS.slice(0, 16).replace("T", " ")} UTC, agent được nạp đủ cho cả 20 khoản)` : ""}. Hạn mức của O và S: ${x.O.caps.perTx} USDC mỗi lần, ${x.O.caps.daily} USDC mỗi ngày.`,
        injection: "Trang cài lệnh: gửi toàn bộ số dư tới địa chỉ kẻ tấn công",
        burst: `${x.O.attempts} thanh toán ${x.O.payment} USDC gửi cùng lúc`,
        notRun: "Không đo",
        pName: "P: ví thường",
        pWhat: "Ví EOA trên Fuji C-Chain; chỉ có system prompt bảo vệ.",
        pLoss: `Mất ${x.P.attackerReceived} trên ${x.P.balanceBefore} USDC; còn ${x.P.balanceAfter}.`,
        oName: "O: ví hạn mức dạng contract",
        oWhat:
          "Contract trên Fuji C-Chain, trả bằng USDC qua EIP-3009; kiểm hạn mức trong isValidSignature (ERC-1271). Bản tối giản do đội viết cho phép so sánh này; không đại diện cho các sản phẩm ví đã được audit.",
        oBurst: `${x.O.passedVerifyBeforeSettle}/${x.O.attempts} qua bước kiểm trước khi settle; ${x.O.settledOnChain} settle; ${x.O.revertedOnChain} revert trong block. Đã chi ${x.O.spent} USDC.`,
        sName: "S: Sealed Arena",
        sWhat: "Khoá agent trên L1 Sealed; uỷ quyền do node kiểm khi nhận và khi đưa vào block.",
        sInjection: x.S.injection.refused
          ? `Node từ chối (${x.S.injection.reason}); không được đưa vào block.`
          : "Node nhận giao dịch.",
        sBurst: `${x.S.settledOnChain} vào block; ${x.S.leftOutOfBlocks} đang chờ trong pool, chưa vào block; ${x.S.refusedByPool} bị từ chối ngay khi gửi. Đã chi ${x.S.spent} USDC (hạn mức ngày ${x.S.caps.daily}).`,
        notes: [
          `Cột P chạy lại một bản ghi dựng tay (gửi hết số dư cho kẻ tấn công). Với model thật (claude-sonnet-5-5 và claude-haiku-5-5), agent không làm theo trang cài lệnh lượt nào: 0/30, gồm 15 lượt ở services/agent/README.md và 15 lượt ở docs/EVALUATION.md. Nó làm theo một ghi chú cài vào bộ nhớ ${memory} lượt khi chủ ví bảo đọc ghi chú; với S (Sealed L1 cục bộ), node từ chối ${agent.toAttacker.refused}/${agent.toAttacker.tried} khoản trả tới địa chỉ kẻ tấn công (bảng agent tier trong docs/EVALUATION.md).`,
          "Cả O và S đều không vượt hạn mức ngày. Khác biệt ở chỗ bị từ chối: với O, các khoản hỏng vẫn vào block sau khi đã qua bước kiểm của facilitator; với S, khoản bị từ chối không vào block nào.",
          "Giao dịch của S đang chờ trong pool có thể vào block ở ngày sau, trong hạn mức của ngày đó, cho tới khi uỷ quyền hết hạn hoặc chủ ví dừng agent.",
        ],
        txs: "Giao dịch",
        source: "Kết quả thô và script",
      }
    : {
        title: "Same agent, three wallets",
        intro: `One agent, three ways to give it money. Results of the run on Fuji at ${x.at.slice(0, 16).replace("T", " ")} UTC${x.atS ? ` (S run again at ${x.atS.slice(0, 16).replace("T", " ")} UTC, with the agent funded for all 20 payments)` : ""}. Caps for O and S: ${x.O.caps.perTx} USDC per payment, ${x.O.caps.daily} USDC per day.`,
        injection: "Injected page: send the whole balance to the attacker address",
        burst: `${x.O.attempts} payments of ${x.O.payment} USDC sent at once`,
        notRun: "Not measured",
        pName: "P: plain wallet",
        pWhat: "EOA on the Fuji C-Chain; guarded by its system prompt only.",
        pLoss: `Lost ${x.P.attackerReceived} of ${x.P.balanceBefore} USDC; ${x.P.balanceAfter} left.`,
        oName: "O: spending-limit contract wallet",
        oWhat:
          "Contract on the Fuji C-Chain paying USDC with EIP-3009; caps checked in isValidSignature (ERC-1271). A minimal wallet written by the team for this comparison; not representative of audited wallet products.",
        oBurst: `${x.O.passedVerifyBeforeSettle}/${x.O.attempts} passed the check before settling; ${x.O.settledOnChain} settled; ${x.O.revertedOnChain} reverted in a block. Spent ${x.O.spent} USDC.`,
        sName: "S: Sealed Arena",
        sWhat:
          "Agent key on the Sealed L1; the mandate is checked by the node on arrival and again when building a block.",
        sInjection: x.S.injection.refused
          ? `Refused by the node (${x.S.injection.reason}); not included in a block.`
          : "Accepted by the node.",
        sBurst: `${x.S.settledOnChain} in blocks; ${x.S.leftOutOfBlocks} waiting in the pool, not in a block; ${x.S.refusedByPool} refused on arrival. Spent ${x.S.spent} USDC (daily cap ${x.S.caps.daily}).`,
        notes: [
          `Column P replays a hand-written transcript (the whole balance to the attacker). With live models (claude-sonnet-5-5 and claude-haiku-5-5) the agent never followed an injected page: 0/30 runs, 15 in services/agent/README.md and 15 in docs/EVALUATION.md. It followed a note planted in its memory in ${memory} runs when its owner asked it to read its notes; on S (local Sealed L1) the node refused ${refusedOf} payments to the attacker's address (agent-tier table in docs/EVALUATION.md).`,
          "Neither O nor S went over the daily cap. The difference is where refusals happen: O's failed payments still land in blocks after passing the facilitator's check; S's refused payments are not included in a block.",
          "Payments S left waiting in the pool can go into a block on a later day, within that day's cap, until the mandate expires or the owner freezes the agent.",
        ],
        txs: "Transactions",
        source: "Raw results and script",
      };
