import {
  AGENT_POLICY_ADDRESS,
  type AgentState,
  agentPolicyAbi,
  checkSignedNativeTx,
  effectiveMandateV3,
  type MandateV3,
  NATIVE_ASSET,
  NO_PAYEE_CAP,
  paymentCharge,
  precheckMandate,
  readRuleVersion,
  SIGNED_NATIVE_TX,
  X402_NETWORK,
  X402_SCHEME,
} from "@sealed-arena/shared";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { type Address, BaseError, type Hex, isHex, type PublicClient } from "viem";

/**
 * Facilitator side of x402 `exact` with `assetTransferMethod: "signed-native-tx"` on the Sealed L1.
 *
 * It holds no key: the payer signed the transaction, so the facilitator only checks it and
 * broadcasts it. Gas is paid by the payer as part of the signed transaction.
 */
export class SignedNativeTxFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = X402_SCHEME;
  readonly caipFamily = "eip155:*";
  /** Hashes being settled now, so two concurrent /settle calls cannot broadcast the same payment twice. */
  private readonly settling = new Set<Hex>();

  constructor(
    private readonly client: PublicClient,
    private readonly opts: { receiptTimeoutMs?: number } = {},
  ) {}

  getExtra(): Record<string, unknown> {
    return { assetTransferMethod: SIGNED_NATIVE_TX };
  }

  getSigners(): string[] {
    return [];
  }

  async verify(payload: PaymentPayload, req: PaymentRequirements): Promise<VerifyResponse> {
    const r = await this.check(payload, req);
    return r.ok
      ? { isValid: true, payer: r.payer }
      : {
          isValid: false,
          invalidReason: r.reason,
          ...opt("invalidMessage", r.message),
          ...opt("payer", r.payer),
        };
  }

  async settle(payload: PaymentPayload, req: PaymentRequirements): Promise<SettleResponse> {
    const fail = (
      errorReason: string,
      payer?: string,
      errorMessage?: string,
      transaction = "",
    ): SettleResponse => ({
      success: false,
      errorReason,
      ...opt("errorMessage", errorMessage),
      ...opt("payer", payer),
      transaction,
      network: X402_NETWORK,
    });

    const r = await this.check(payload, req);
    if (!r.ok) return fail(r.reason, r.payer, r.message);
    if (this.settling.has(r.hash))
      return fail("invalid_exact_native_payload_already_submitted", r.payer);
    this.settling.add(r.hash);
    try {
      let hash: Hex;
      try {
        hash = await this.client.sendRawTransaction({ serializedTransaction: r.raw });
      } catch (e) {
        return fail(reasonFromRpc(e), r.payer, rpcMessage(e));
      }
      const receipt = await this.client.waitForTransactionReceipt({
        hash,
        timeout: this.opts.receiptTimeoutMs ?? req.maxTimeoutSeconds * 1000,
      });
      if (receipt.status !== "success") return fail("transaction_failed", r.payer, undefined, hash);
      return {
        success: true,
        payer: r.payer,
        transaction: hash,
        network: X402_NETWORK,
        amount: req.amount,
      };
    } catch (e) {
      return fail("transaction_failed", r.payer, rpcMessage(e));
    } finally {
      this.settling.delete(r.hash);
    }
  }

  /** Every check that can run before broadcasting. Nothing here writes to the chain. */
  private async check(
    payload: PaymentPayload,
    req: PaymentRequirements,
  ): Promise<
    | { ok: true; payer: Address; hash: Hex; raw: Hex }
    | { ok: false; reason: string; message?: string; payer?: Address }
  > {
    const extra = req.extra ?? {};
    if (
      req.scheme !== X402_SCHEME ||
      req.network !== X402_NETWORK ||
      req.asset !== NATIVE_ASSET ||
      extra.assetTransferMethod !== SIGNED_NATIVE_TX ||
      !isHex(extra.requestId) ||
      (extra.requestId as Hex).length !== 66 ||
      typeof extra.resourceUrl !== "string" ||
      !/^\d+$/.test(req.amount)
    ) {
      return { ok: false, reason: "invalid_payment_requirements" };
    }
    if (payload.accepted?.network && payload.accepted.network !== X402_NETWORK)
      return { ok: false, reason: "invalid_network" };

    const raw = (payload.payload as { signedTransaction?: unknown }).signedTransaction;
    if (!isHex(raw)) return { ok: false, reason: "invalid_payload" };

    const c = await checkSignedNativeTx(raw, {
      payTo: req.payTo as Address,
      amount: BigInt(req.amount),
      resourceUrl: extra.resourceUrl,
      requestId: extra.requestId as Hex,
    });
    if (!c.ok) return c;
    const payer = c.payer;

    // Replay: the same transaction already broadcast, or its nonce already used.
    const known = await this.client.getTransaction({ hash: c.hash }).catch(() => undefined);
    if (known)
      return { ok: false, reason: "invalid_exact_native_payload_already_submitted", payer };
    const nonce = await this.client.getTransactionCount({ address: payer, blockTag: "pending" });
    if (c.nonce < nonce)
      return { ok: false, reason: "invalid_exact_native_payload_nonce_used", payer };
    if (c.nonce > nonce)
      return { ok: false, reason: "invalid_exact_native_payload_nonce_gap", payer };

    const charge = paymentCharge({
      value: BigInt(req.amount),
      gas: c.gas,
      maxFeePerGas: c.maxFeePerGas,
    });
    const balance = await this.client.getBalance({ address: payer });
    if (balance < charge) return { ok: false, reason: "insufficient_funds", payer };

    // The agent rule of the chain, read through getMandate/getSpend, so the reason comes back before broadcast.
    const read = <F extends "isAgent" | "getMandate" | "getSpend">(functionName: F) =>
      this.client.readContract({
        address: AGENT_POLICY_ADDRESS,
        abi: agentPolicyAbi,
        functionName,
        args: [payer],
      } as never);
    const isAgent = (await read("isAgent")) as boolean;
    if (isAgent) {
      const [[activeMandate, frozen], [spentToday], block, code] = await Promise.all([
        read("getMandate") as Promise<
          readonly [
            { payees: readonly Address[]; perTxCap: bigint; dailyCap: bigint; expiry: bigint },
            boolean,
          ]
        >,
        read("getSpend") as Promise<readonly [bigint, bigint, bigint]>,
        this.client.getBlock(),
        this.client.getCode({ address: req.payTo as Address }),
      ]);
      const now = BigInt(Math.max(Number(block.timestamp), Math.floor(Date.now() / 1000)));
      let mandate = activeMandate;
      let v2: AgentState["v2"];
      let v3: AgentState["v3"];
      const version = await readRuleVersion(this.client);
      if (version >= 2) {
        const [m2, fee] = await Promise.all([
          this.client.readContract({
            address: AGENT_POLICY_ADDRESS,
            abi: agentPolicyAbi,
            functionName: "getMandateV2",
            args: [payer],
          }),
          this.client.readContract({
            address: AGENT_POLICY_ADDRESS,
            abi: agentPolicyAbi,
            functionName: "getFeeSpend",
            args: [payer],
          }),
        ]);
        v2 = {
          feeSpentToday: fee[0],
          feeCapSet: m2[1],
          dailyFeeCap: m2[0].dailyFeeCap,
          baseFee: block.baseFeePerGas ?? 0n,
        };
      }
      if (version === 3) {
        // Rule v3: the mandate in force at `now` (a scheduled loosening counts from its eta, judged
        // by this clock: on an idle chain the head still shows the old one), and its counters.
        const call = <F extends "getMandateV3" | "getPending" | "getCounters">(functionName: F) =>
          this.client.readContract({
            address: AGENT_POLICY_ADDRESS,
            abi: agentPolicyAbi,
            functionName,
            args: [payer],
          } as never);
        const [[m3], pending, counters, payeeSpend] = await Promise.all([
          call("getMandateV3") as Promise<readonly [MandateV3, boolean]>,
          call("getPending") as Promise<readonly [MandateV3, bigint, Address, bigint]>,
          call("getCounters") as Promise<readonly [number, bigint, bigint, bigint]>,
          this.client.readContract({
            address: AGENT_POLICY_ADDRESS,
            abi: agentPolicyAbi,
            functionName: "getPayeeSpend",
            args: [payer, req.payTo as Address],
          }),
        ]);
        const m = effectiveMandateV3(m3, pending[0], pending[1], now);
        mandate = {
          payees: m.payees,
          perTxCap: m.perTxCap,
          dailyCap: m.dailyCap,
          expiry: m.expiry,
        };
        if (v2) v2 = { ...v2, feeCapSet: true, dailyFeeCap: m.dailyFeeCap };
        const today = now / 86400n;
        const i = m.payees.findIndex((p) => p.toLowerCase() === req.payTo.toLowerCase());
        const cap = i >= 0 ? m.payeeDailyCaps[i] : undefined;
        v3 = {
          paymentsToday: counters[1] === today ? counters[0] : 0,
          maxPaymentsPerDay: m.maxPaymentsPerDay,
          payeeSpentToday: payeeSpend[1] === today ? payeeSpend[0] : 0n,
          ...(cap !== undefined && cap !== NO_PAYEE_CAP ? { payeeDailyCap: cap } : {}),
        };
      }
      const reason = precheckMandate(
        {
          mandate,
          frozen,
          spentToday,
          now,
          payeeHasCode: code !== undefined && code !== "0x",
          ...(v2 ? { v2 } : {}),
          ...(v3 ? { v3 } : {}),
        },
        {
          to: req.payTo as Address,
          charge,
          value: BigInt(req.amount),
          gas: c.gas,
          data: c.data,
          maxFeePerGas: c.maxFeePerGas,
          maxPriorityFeePerGas: c.maxPriorityFeePerGas,
        },
      );
      if (reason) return { ok: false, reason, payer };
    }
    return { ok: true, payer, hash: c.hash, raw };
  }
}

/** { [key]: value } when value is set, {} otherwise (exactOptionalPropertyTypes). */
function opt<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function rpcMessage(e: unknown): string {
  if (e instanceof BaseError) return e.details || e.shortMessage;
  return e instanceof Error ? e.message : String(e);
}

/** Maps a node rejection to a reason code; the node's own text goes in errorMessage. */
export function reasonFromRpc(e: unknown): string {
  const m = rpcMessage(e);
  const agent =
    /agent: (payee not allowed|payee has code|frozen|mandate expired|budget exceeded|contract creation not allowed)/.exec(
      m,
    );
  if (agent?.[1]) return `agent_${agent[1].replaceAll(" ", "_")}`;
  if (/already known/i.test(m)) return "invalid_exact_native_payload_already_submitted";
  if (/nonce too low/i.test(m)) return "invalid_exact_native_payload_nonce_used";
  if (/insufficient funds/i.test(m)) return "insufficient_funds";
  return "transaction_rejected";
}
