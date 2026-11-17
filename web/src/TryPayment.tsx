import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { formatUsdc } from "@sealed-arena/shared";
import { useState } from "react";
import { type Address, parseEther } from "viem";
import { ARENA } from "./arena.config.js";
import type { arenaText } from "./arenaText.js";
import { type SendOutcome, sendAsAgent } from "./forbiddenSend.js";
import { type AgentView, chainClient } from "./owner.js";
import { RPC } from "./useArenaLive.js";

/** An address nobody holds a key for; never on any mandate. */
const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";
const D1 = `${ARENA.source}/blob/main/docs/decisions/D1.md`;

type Attempt = { to: Address; value: bigint; expected: string };

/** Two buttons that send a real forbidden payment with the public agent key and show the answer. */
export function TryPayment(o: {
  t: ReturnType<typeof arenaText>;
  view: AgentView | undefined;
  onSent: () => void;
}) {
  const { t, view } = o;
  const [client] = useState(() => chainClient(RPC));
  const [busy, setBusy] = useState<string>();
  const [sent, setSent] = useState<Attempt>();
  const [result, setResult] = useState<SendOutcome>();

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
    setResult(await sendAsAgent(client, ARENA.agentPrivateKey, a.to, a.value));
    setBusy(undefined);
    o.onSent();
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
        ) : result?.kind === "error" ? (
          <Banner status="warning" title={t.tryError} description={result.message} />
        ) : null}

        <Text type="supporting" color="secondary">
          {t.tryNote} <Link href={D1}>{t.tryNoteLink}</Link>
        </Text>
      </VStack>
    </Card>
  );
}
