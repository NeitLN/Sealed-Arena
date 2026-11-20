import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { formatUsdc } from "@sealed-arena/shared";
import { useRef, useState } from "react";
import { type Address, formatEther, type Hex, parseEther } from "viem";
import { ARENA } from "./arena.config.js";
import type { arenaText } from "./arenaText.js";
import { type SendOutcome, sendAsAgent } from "./forbiddenSend.js";
import { type AgentView, chainClient } from "./owner.js";
import { StatusPill } from "./StatusPill.js";
import { RPC } from "./useArenaLive.js";
import { type Account, curlFor, lookUp, readAccount, type Verdict, verdict } from "./verify.js";

/** An address nobody holds a key for; never on any mandate. */
const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";
const D1 = `${ARENA.source}/blob/main/docs/decisions/D1.md`;
const ISSUE = `${ARENA.source}/issues/new`;
const SECURITY = `${ARENA.source}/blob/main/SECURITY.md`;

type Key = "stranger" | "overCap" | "allowed";
/** `allowed`: a payment inside the mandate, expected to be accepted and to reach a block. */
type Attempt = { to: Address; value: bigint; expected: string; allowed: boolean };
type Check =
  | { state: "waiting" }
  | { state: "busy" }
  | {
      state: "done";
      before: Account;
      after: Account;
      verdict: Verdict;
      /** The block of the transaction, when the chain has it. */
      block: bigint | undefined;
      /** The account was not read before sending, so only the hash lookup counts. */
      noBefore: boolean;
    };

/** Seconds to wait after the node's answer before reading the chain again. */
const RECHECK_MS = 8_000;
/** Longest wait for the node's answer to a send. */
const SEND_TIMEOUT_MS = 10_000;
/** Pause after each send before the buttons work again. */
const TRY_COOLDOWN_MS = 3_000;

/** "before → after", or the word for unchanged. */
const change = (a: string | number, b: string | number, same: string) =>
  a === b ? `${a} (${same})` : `${a} → ${b}`;

/** One sentence on what a refusal reason means for this attempt. */
function explain(t: ReturnType<typeof arenaText>, reason: string, to: Address): string {
  if (reason.startsWith("agent: payee not allowed")) return t.whyPayee.replace("{to}", to);
  if (reason.startsWith("agent: budget exceeded")) return t.whyBudget;
  if (reason.startsWith("agent: frozen")) return t.whyFrozen;
  if (reason.startsWith("agent: mandate expired")) return t.whyExpired;
  return "";
}

/**
 * Three buttons that send a real payment with the public agent key and show the node's answer: two
 * outside the mandate (expected refused) and one inside it (expected accepted, as a control).
 */
export function TryPayment(o: {
  t: ReturnType<typeof arenaText>;
  view: AgentView | undefined;
  onSent: () => void;
  /** Records a breach on chain through the relayer (the recorder checks the balance). */
  onReportBreach: () => void;
}) {
  const { t, view } = o;
  const [client] = useState(() => chainClient(RPC, { live: true, source: "web:arena" }));
  const [busy, setBusy] = useState<Key>();
  const [sent, setSent] = useState<Attempt>();
  const [result, setResult] = useState<SendOutcome>();
  const [hash, setHash] = useState<Hex>();
  const [before, setBefore] = useState<Account>();
  const [check, setCheck] = useState<Check>();

  /** The second read: the account again and the hash lookup. */
  // The hash a check belongs to: a timer started for an earlier send must not show its answer
  // under a newer hash.
  const current = useRef<Hex | undefined>(undefined);
  const recheck = async (h: Hex, b: Account | undefined) => {
    if (current.current !== h) return;
    setCheck({ state: "waiting" });
    try {
      const [after, look] = await Promise.all([
        readAccount(client, ARENA.agent),
        lookUp(client, h),
      ]);
      if (current.current !== h) return;
      const receipt = look.receipt as { blockNumber?: string } | null;
      const block = receipt?.blockNumber ? BigInt(receipt.blockNumber) : undefined;
      // Without the account before sending, the hash lookup alone decides.
      const base = b ?? after;
      setCheck({
        state: "done",
        before: base,
        after,
        verdict: verdict(base, after, look),
        block,
        noBefore: !b,
      });
    } catch {
      if (current.current === h) setCheck({ state: "busy" });
    }
  };

  const payee = view?.mandate.payees[0] as Address | undefined;
  const attempts: Record<Key, Attempt | undefined> = {
    stranger: {
      to: STRANGER,
      value: parseEther("0.01"),
      expected: "agent: payee not allowed",
      allowed: false,
    },
    overCap:
      payee && view
        ? {
            to: payee,
            value: view.mandate.perTxCap + parseEther("0.01"),
            expected: "agent: budget exceeded",
            allowed: false,
          }
        : undefined,
    allowed: payee
      ? { to: payee, value: parseEther("0.01"), expected: t.expectAccepted, allowed: true }
      : undefined,
  };

  // A short pause after each send: the buttons send real transactions from a public key, and
  // the gateway limits sends per client (people at one event share an IP).
  const [cooling, setCooling] = useState(false);
  const run = async (key: Key) => {
    const a = attempts[key];
    if (!a || busy || cooling) return;
    setBusy(key);
    setSent(a);
    setResult(undefined);
    setHash(undefined);
    setCheck(undefined);
    current.current = undefined;
    try {
      const b = await readAccount(client, ARENA.agent).catch(() => undefined);
      setBefore(b);
      const timeout = new Promise<SendOutcome & { signed?: Hex }>((resolve) =>
        setTimeout(() => resolve({ kind: "error", message: t.trySlow }), SEND_TIMEOUT_MS),
      );
      const r = await Promise.race([
        sendAsAgent(client, ARENA.agentPrivateKey, a.to, a.value),
        timeout,
      ]);
      setResult(r);
      o.onSent();
      // Verify only an answer that came from the node (refused or accepted), not a busy RPC.
      if (r.signed && (r.kind === "refused" || r.kind === "accepted")) {
        setHash(r.signed);
        current.current = r.signed;
        setCheck({ state: "waiting" });
        const h = r.signed;
        setTimeout(() => void recheck(h, b), RECHECK_MS);
      }
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(undefined);
      setCooling(true);
      setTimeout(() => setCooling(false), TRY_COOLDOWN_MS);
    }
  };

  const reportBreach = (
    <HStack gap={3} wrap="wrap" vAlign="center">
      <Button label={t.reportBreach} variant="destructive" size="sm" onClick={o.onReportBreach} />
      <Link href={ISSUE}>{t.openIssue}</Link>
      <Link href={SECURITY}>SECURITY.md</Link>
    </HStack>
  );
  const breachBanner = (title: string, description?: string) => (
    <Banner
      status="error"
      title={title}
      description={
        <VStack gap={2}>
          {description ? <Code>{description}</Code> : null}
          {reportBreach}
        </VStack>
      }
    />
  );
  const button = (key: Key, label: string, variant: "primary" | "secondary") => (
    <Button
      label={busy === key ? t.trySending : label}
      variant={variant}
      isLoading={busy === key}
      isDisabled={busy !== undefined || cooling || !attempts[key]}
      onClick={() => void run(key)}
    />
  );
  const allowedRun = sent?.allowed === true;
  /** The control payment inside the mandate was accepted: the check should find it in a block. */
  const allowedAccepted = allowedRun && result?.kind === "accepted";

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={2}>
          <Heading level={2}>{t.tryTitle}</Heading>
          <Text type="body" color="secondary">
            {t.tryIntro}
          </Text>
        </VStack>
        <HStack gap={3} wrap="wrap">
          {button("stranger", t.tryStranger, "primary")}
          {button("overCap", t.tryOverCap, "secondary")}
          {button("allowed", t.tryAllowed, "secondary")}
        </HStack>
        {!view ? (
          <Text type="supporting" color="secondary">
            {t.tryLoading}
          </Text>
        ) : null}

        {sent ? (
          <MetadataList>
            <MetadataListItem label={t.tryTo}>
              <Code>{sent.to}</Code>
            </MetadataListItem>
            <MetadataListItem label={t.tryAmount}>{formatUsdc(sent.value)} USDC</MetadataListItem>
            <MetadataListItem label={t.tryExpected}>
              <Code>{sent.expected}</Code>
            </MetadataListItem>
          </MetadataList>
        ) : null}

        {result?.kind === "refused" ? (
          <div className="refusal-receipt" role="status">
            <StatusPill state="refused">
              {allowedRun ? t.tryAllowedRefused : t.tryRefused}
            </StatusPill>
            <code>{result.reason}</code>
            {sent && <p>{explain(t, result.reason, sent.to)}</p>}
          </div>
        ) : result?.kind === "accepted" && allowedRun ? (
          <Banner
            status="success"
            title={t.tryAllowedOk}
            description={<Code>{result.hash}</Code>}
          />
        ) : result?.kind === "accepted" ? (
          breachBanner(t.tryAccepted, result.hash)
        ) : result?.kind === "busy" ? (
          <Banner status="warning" title={t.tryBusy} />
        ) : result?.kind === "node" ? (
          <Banner status="warning" title={t.tryNode} description={<Code>{result.message}</Code>} />
        ) : result?.kind === "error" ? (
          <Banner status="warning" title={t.tryError} description={result.message} />
        ) : null}

        {hash && check ? (
          <VStack gap={3}>
            <Heading level={3}>{t.verifyTitle}</Heading>
            <Text type="supporting" color="secondary">
              {t.verifyIntro}
            </Text>
            <MetadataList>
              <MetadataListItem label={t.verifyHash}>
                <Code>{hash}</Code>
              </MetadataListItem>
              {check.state === "done" ? (
                <>
                  <MetadataListItem label="eth_getTransactionByHash">
                    {check.verdict === "inBlock"
                      ? `${t.verifyInBlockShort}${check.block !== undefined ? ` ${check.block}` : ""}`
                      : check.verdict === "pending"
                        ? t.verifyPendingShort
                        : t.verifyNull}
                  </MetadataListItem>
                  {check.noBefore ? null : (
                    <>
                      <MetadataListItem label={t.verifyNonce}>
                        {change(check.before.nonce, check.after.nonce, t.verifyUnchanged)}
                      </MetadataListItem>
                      <MetadataListItem label={t.verifyBalance}>
                        {change(
                          `${formatEther(check.before.balance)} USDC`,
                          `${formatEther(check.after.balance)} USDC`,
                          t.verifyUnchanged,
                        )}
                      </MetadataListItem>
                      <MetadataListItem label={t.verifyBlock}>
                        {`${check.before.block} → ${check.after.block}`}
                      </MetadataListItem>
                    </>
                  )}
                </>
              ) : null}
            </MetadataList>
            {check.state === "waiting" ? (
              <Text type="supporting" color="secondary">
                {t.verifyWaiting}
              </Text>
            ) : check.state === "busy" ? (
              <Banner status="warning" title={t.tryBusy} />
            ) : allowedAccepted && check.verdict === "inBlock" ? (
              <Banner
                status="success"
                title={t.verifyAllowedInBlock.replace("{block}", String(check.block ?? ""))}
              />
            ) : allowedAccepted && check.verdict !== "pending" ? (
              <Banner status="warning" title={t.verifyAllowedMissing} />
            ) : check.verdict === "inBlock" ? (
              breachBanner(t.verifyFound)
            ) : check.verdict === "pending" ? (
              <Banner
                status="warning"
                title={allowedAccepted ? t.verifyAllowedPending : t.verifyPending}
              />
            ) : check.verdict === "changedOther" ? (
              <Banner status="info" title={t.verifyChangedOther} />
            ) : (
              <Banner status="success" title={check.noBefore ? t.verifyOkHashOnly : t.verifyOk} />
            )}
            <CodeBlock title={t.verifyCurl} code={curlFor(RPC, hash)} isWrapped size="sm" />
            <HStack>
              <Button
                label={t.verifyAgain}
                variant="secondary"
                size="sm"
                isDisabled={check.state === "waiting"}
                onClick={() => void recheck(hash, before)}
              />
            </HStack>
            <Text type="supporting" color="secondary">
              {t.verifyLimit}
            </Text>
          </VStack>
        ) : null}

        <Text type="supporting" color="secondary">
          {t.tryNote} <Link href={D1}>{t.tryNoteLink}</Link>
        </Text>
      </VStack>
    </Card>
  );
}
