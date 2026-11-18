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
import { RPC } from "./useArenaLive.js";
import { type Account, curlFor, lookUp, readAccount, type Verdict, verdict } from "./verify.js";

/** An address nobody holds a key for; never on any mandate. */
const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";
const D1 = `${ARENA.source}/blob/main/docs/decisions/D1.md`;

type Attempt = { to: Address; value: bigint; expected: string };
type Check =
  | { state: "waiting" }
  | { state: "busy" }
  | { state: "done"; before: Account; after: Account; verdict: Verdict };

/** Seconds to wait after the node's answer before reading the chain again. */
const RECHECK_MS = 8_000;

/** "before → after", or the word for unchanged. */
const change = (a: string | number, b: string | number, same: string) =>
  a === b ? `${a} (${same})` : `${a} → ${b}`;

/** Two buttons that send a real forbidden payment with the public agent key and show the answer. */
export function TryPayment(o: {
  t: ReturnType<typeof arenaText>;
  view: AgentView | undefined;
  onSent: () => void;
}) {
  const { t, view } = o;
  const [client] = useState(() => chainClient(RPC, { live: true }));
  const [busy, setBusy] = useState<string>();
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
      if (!b) return setCheck({ state: "busy" });
      setCheck({ state: "done", before: b, after, verdict: verdict(b, after, look) });
    } catch {
      if (current.current === h) setCheck({ state: "busy" });
    }
  };

  const payee = view?.mandate.payees[0] as Address | undefined;
  const attempts: Record<"stranger" | "overCap", Attempt | undefined> = {
    stranger: { to: STRANGER, value: parseEther("0.01"), expected: "agent: payee not allowed" },
    overCap:
      payee && view
        ? {
            to: payee,
            value: view.mandate.perTxCap + parseEther("0.01"),
            expected: "agent: budget exceeded",
          }
        : undefined,
  };

  const run = async (key: keyof typeof attempts) => {
    const a = attempts[key];
    if (!a) return;
    setBusy(key);
    setSent(a);
    setResult(undefined);
    setHash(undefined);
    setCheck(undefined);
    current.current = undefined;
    const b = await readAccount(client, ARENA.agent).catch(() => undefined);
    setBefore(b);
    const r = await sendAsAgent(client, ARENA.agentPrivateKey, a.to, a.value);
    setResult(r);
    setBusy(undefined);
    o.onSent();
    // Verify only an answer that came from the node (refused or accepted), not a busy RPC.
    if (r.signed && (r.kind === "refused" || r.kind === "accepted")) {
      setHash(r.signed);
      current.current = r.signed;
      setCheck({ state: "waiting" });
      const h = r.signed;
      setTimeout(() => void recheck(h, b), RECHECK_MS);
    }
  };

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
          <Button
            label={busy === "stranger" ? t.trySending : t.tryStranger}
            variant="primary"
            isLoading={busy === "stranger"}
            isDisabled={busy !== undefined}
            onClick={() => void run("stranger")}
          />
          <Button
            label={busy === "overCap" ? t.trySending : t.tryOverCap}
            variant="secondary"
            isLoading={busy === "overCap"}
            isDisabled={busy !== undefined || !attempts.overCap}
            onClick={() => void run("overCap")}
          />
        </HStack>

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
          <Banner
            status="success"
            title={t.tryRefused}
            description={<Code>{result.reason}</Code>}
          />
        ) : result?.kind === "accepted" ? (
          <Banner status="error" title={t.tryAccepted} description={<Code>{result.hash}</Code>} />
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
                      ? t.verifyInBlockShort
                      : check.verdict === "pending"
                        ? t.verifyPendingShort
                        : t.verifyNull}
                  </MetadataListItem>
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
              ) : null}
            </MetadataList>
            {check.state === "waiting" ? (
              <Text type="supporting" color="secondary">
                {t.verifyWaiting}
              </Text>
            ) : check.state === "busy" ? (
              <Banner status="warning" title={t.tryBusy} />
            ) : check.verdict === "inBlock" ? (
              <Banner status="error" title={t.verifyFound} />
            ) : check.verdict === "pending" ? (
              <Banner status="warning" title={t.verifyPending} />
            ) : check.verdict === "changedOther" ? (
              <Banner status="info" title={t.verifyChangedOther} />
            ) : null}
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
