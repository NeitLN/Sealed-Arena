import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack, Layout, LayoutContent, Stack, StackItem, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { arenaRecorderAbi, formatUsdc } from "@sealed-arena/shared";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { useI18n } from "./i18n.js";
import { type AgentView, chainClient, RELAYER_URL, readAgent } from "./owner.js";
import { SiteHeader } from "./SiteHeader.js";

const RPC = `${GATEWAY_URL}/rpc`;
const mono: CSSProperties = {
  fontFamily: "var(--font-family-code, monospace)",
  wordBreak: "break-all",
};
const formColBasis: CSSProperties = { flexBasis: 0 };
const summarySticky: CSSProperties = {
  flexBasis: 0,
  position: "sticky",
  top: "var(--spacing-4)",
  alignSelf: "flex-start",
};

type Summary = {
  total: number;
  accepted: number;
  rejected: number;
  byReason: Record<string, number>;
  distinctSenders: number;
};
type Attempt = { ts: number; to: string; value: string; result: string; reason: string };
type Recorder = { funded: bigint; required: bigint; score: bigint; breached: boolean };

const short = (a: string) => (a ? `${a.slice(0, 8)}…${a.slice(-6)}` : "-");
const usdc = (wei: bigint) => {
  const kept = wei - (wei % 10n ** 12n);
  return `${kept === wei ? "" : "≈"}${formatUsdc(kept)}`;
};

export default function ArenaPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  const [client] = useState(() => chainClient(RPC));
  const [view, setView] = useState<AgentView>();
  const [rec, setRec] = useState<Recorder>();
  const [summary, setSummary] = useState<Summary>();
  const [recent, setRecent] = useState<Attempt[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string }>();
  const [walletMsg, setWalletMsg] = useState<string>();

  const refreshChain = useCallback(async () => {
    try {
      setView(await readAgent(client, ARENA.agent));
      const read = (fn: string) =>
        client.readContract({
          address: ARENA.recorder,
          abi: arenaRecorderAbi,
          functionName: fn,
          args: [ARENA.agent],
        } as never) as Promise<unknown>;
      const [funded, required, score, breached] = await Promise.all([
        read("funded"),
        read("requiredBalance"),
        read("score"),
        read("breached"),
      ]);
      setRec({
        funded: funded as bigint,
        required: required as bigint,
        score: score as bigint,
        breached: breached as boolean,
      });
    } catch {
      // keep the last values
    }
  }, [client]);

  const refreshAttempts = useCallback(async () => {
    try {
      const q = `from=${ARENA.agent}`;
      const [s, r] = await Promise.all([
        fetch(`${GATEWAY_URL}/attempts/summary?${q}`).then((x) => x.json() as Promise<Summary>),
        fetch(`${GATEWAY_URL}/attempts/recent?limit=15&${q}`).then(
          (x) => x.json() as Promise<Attempt[]>,
        ),
      ]);
      setSummary(s);
      setRecent(r);
    } catch {
      // gateway unreachable: keep the last values
    }
  }, []);

  useEffect(() => {
    void refreshChain();
    void refreshAttempts();
    const a = setInterval(() => void refreshAttempts(), 3000);
    const b = setInterval(() => void refreshChain(), 10_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [refreshChain, refreshAttempts]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(ARENA.agentPrivateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the key is shown on the page
    }
  };

  const addNetwork = async () => {
    const eth = (window as unknown as { ethereum?: { request(a: unknown): Promise<unknown> } })
      .ethereum;
    if (!eth) return setWalletMsg(t.noWallet);
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARENA.chainIdHex,
            chainName: ARENA.chainName,
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: [RPC],
          },
        ],
      });
      setWalletMsg(undefined);
    } catch (e) {
      setWalletMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const act = async (action: "checkpoint" | "reportBreach") => {
    setBusy(action);
    setOutcome(undefined);
    try {
      const res = await fetch(`${RELAYER_URL}/arena`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, agent: ARENA.agent }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        transaction?: string;
        reason?: string;
        error?: string;
      };
      setOutcome(
        body.ok
          ? { ok: true, text: `${t.done}: ${body.transaction ?? ""}` }
          : { ok: false, text: `${t.failed}: ${body.reason ?? body.error ?? res.status}` },
      );
    } catch {
      setOutcome({ ok: false, text: t.failed });
    } finally {
      setBusy(undefined);
      void refreshChain();
    }
  };

  const status = (
    <Card padding={5}>
      <VStack gap={3}>
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Text type="large" weight="bold">
            {t.statusTitle}
          </Text>
          {rec ? (
            <Badge
              variant={rec.breached ? "error" : "success"}
              label={rec.breached ? t.breached : t.intact}
            />
          ) : null}
        </HStack>
        <Row label={t.balance} value={view ? `${usdc(view.balance)} USDC` : "…"} />
        <Row label={t.funded} value={rec ? `${usdc(rec.funded)} USDC` : "…"} />
        <Row label={t.required} value={rec ? `${usdc(rec.required)} USDC` : "…"} />
        <Row label={t.score} value={rec ? (rec.score / 10n ** 18n).toString() : "…"} />
        <Divider />
        <Text type="supporting" weight="bold">
          {t.mandateTitle}
        </Text>
        {view ? (
          <VStack gap={2}>
            <Row label={t.perTx} value={`${usdc(view.mandate.perTxCap)} USDC`} />
            <Row label={t.perDay} value={`${usdc(view.mandate.dailyCap)} USDC`} />
            <Row
              label={t.expires}
              value={new Date(Number(view.mandate.expiry) * 1000).toLocaleDateString()}
            />
            {view.frozen ? <Badge variant="warning" label={t.frozen} /> : null}
            <Text type="supporting" color="secondary">
              {t.payees}
            </Text>
            {view.mandate.payees.map((p) => (
              <Text key={p} type="supporting" style={mono}>
                {p}
              </Text>
            ))}
          </VStack>
        ) : null}
        <Divider />
        <HStack gap={2} wrap="wrap">
          <Button
            label={t.checkpoint}
            variant="secondary"
            isLoading={busy === "checkpoint"}
            isDisabled={!!busy}
            onClick={() => void act("checkpoint")}
          />
          <Button
            label={t.reportBreach}
            variant="secondary"
            isLoading={busy === "reportBreach"}
            isDisabled={!!busy}
            onClick={() => void act("reportBreach")}
          />
        </HStack>
        <Text type="supporting" color="secondary">
          {t.actionHelp}
        </Text>
        {outcome ? <Banner status={outcome.ok ? "success" : "error"} title={outcome.text} /> : null}
      </VStack>
    </Card>
  );

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <Center axis="horizontal">
            <Section variant="transparent" maxWidth={1100} width="100%" padding={isMobile ? 4 : 6}>
              <VStack gap={5}>
                <Banner status="warning" title={t.testnet} />
                <SiteHeader title={t.arenaTitle} lang={lang} setLang={setLang} current="arena" />
                <VStack gap={2}>
                  <Text type="display-2" as="h2">
                    {t.headline}
                  </Text>
                  <Text type="body" color="secondary">
                    {t.arenaIntro}
                  </Text>
                  <Link href="/arena/rules">{t.rulesLink}</Link>
                </VStack>
                <Divider />
                <Stack direction={isMobile ? "vertical" : "horizontal"} gap={8} vAlign="start">
                  <StackItem size="fill" style={isMobile ? undefined : formColBasis}>
                    <VStack gap={8}>
                      <VStack gap={3}>
                        <Text type="large" weight="bold">
                          {t.keyTitle}
                        </Text>
                        <Text type="supporting" color="secondary">
                          Address
                        </Text>
                        <Text type="body" style={mono}>
                          {ARENA.agent}
                        </Text>
                        <Text type="supporting" color="secondary">
                          Private key
                        </Text>
                        <Text type="body" style={mono}>
                          {ARENA.agentPrivateKey}
                        </Text>
                        <HStack gap={2}>
                          <Button
                            label={copied ? t.copied : t.copy}
                            variant="primary"
                            size="sm"
                            onClick={() => void copyKey()}
                          />
                        </HStack>
                        <Banner status="warning" title={t.keyWarning} />
                      </VStack>

                      <VStack gap={3}>
                        <Text type="large" weight="bold">
                          {t.networkTitle}
                        </Text>
                        <Row label={t.rpc} value={RPC} />
                        <Row label={t.chainId} value={`261126 (${ARENA.chainIdHex})`} />
                        <Row label={t.currency} value="USDC (18 decimals)" />
                        <HStack gap={2}>
                          <Button
                            label={t.addNetwork}
                            variant="secondary"
                            size="sm"
                            onClick={() => void addNetwork()}
                          />
                        </HStack>
                        {walletMsg ? <Banner status="info" title={walletMsg} /> : null}
                      </VStack>

                      <VStack gap={3}>
                        <Text type="large" weight="bold">
                          {t.attemptsTitle}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {t.offChain}
                        </Text>
                        <HStack gap={6} wrap="wrap">
                          <Stat label={t.total} value={summary?.total} />
                          <Stat label={t.refused} value={summary?.rejected} />
                          <Stat label={t.accepted} value={summary?.accepted} />
                          <Stat label={t.senders} value={summary?.distinctSenders} />
                        </HStack>
                        {summary && Object.keys(summary.byReason).length > 0 ? (
                          <VStack gap={1}>
                            {Object.entries(summary.byReason)
                              .sort((a, b) => b[1] - a[1])
                              .map(([reason, n]) => (
                                <Row key={reason} label={reason} value={String(n)} />
                              ))}
                          </VStack>
                        ) : null}
                        <Text type="supporting" weight="bold">
                          {t.recent}
                        </Text>
                        {recent.length === 0 ? (
                          <Text type="supporting" color="secondary">
                            {t.none}
                          </Text>
                        ) : (
                          recent.map((a) => (
                            <HStack
                              key={`${a.ts}-${a.to}-${a.value}`}
                              gap={3}
                              hAlign="between"
                              wrap="wrap"
                            >
                              <Text type="supporting" color="secondary">
                                {new Date(a.ts).toLocaleTimeString()}
                              </Text>
                              <Text type="supporting" style={mono}>
                                → {short(a.to)} · {usdc(BigInt(a.value || "0"))}
                              </Text>
                              <Badge
                                variant={a.result === "accepted" ? "success" : "error"}
                                label={a.result === "accepted" ? t.accepted : a.reason || t.refused}
                              />
                            </HStack>
                          ))
                        )}
                      </VStack>
                    </VStack>
                  </StackItem>
                  <StackItem size="fill" style={isMobile ? undefined : summarySticky}>
                    {status}
                  </StackItem>
                </Stack>
              </VStack>
            </Section>
          </Center>
        </LayoutContent>
      }
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="supporting" weight="bold" style={{ wordBreak: "break-all" }}>
        {value}
      </Text>
    </HStack>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <VStack gap={0}>
      <Text type="display-3">{value === undefined ? "…" : String(value)}</Text>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </VStack>
  );
}

export type { Address };
