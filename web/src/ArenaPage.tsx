import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import { HStack, Stack, StackItem, VStack } from "@astryxdesign/core/Layout";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { formatUsdc } from "@sealed-arena/shared";
import { type CSSProperties, type ReactNode, useState } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { useI18n } from "./i18n.js";
import { survivalHours } from "./LandingPage.js";
import { RELAYER_URL } from "./owner.js";
import { SiteShell } from "./SiteShell.js";
import { type Attempt, RPC, useArenaLive } from "./useArenaLive.js";

const colBasis: CSSProperties = { flexBasis: 0 };

const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");
/** USDC with the 18-decimal native coin cut to 6 decimals ("≈" when that drops digits). */
const usdc = (wei: bigint) => {
  const kept = wei - (wei % 10n ** 12n);
  return `${kept === wei ? "" : "≈"}${formatUsdc(kept)}`;
};
const asNumber = (wei: bigint) => Number(wei / 10n ** 12n) / 1e6;

function Tile(o: { label: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          {o.label}
        </Text>
        {o.children}
      </VStack>
    </Card>
  );
}
const big = (v: number | undefined) =>
  v === undefined ? (
    <Skeleton width={72} height={36} />
  ) : (
    <Text type="display-3">{v.toLocaleString()}</Text>
  );

type Row = Attempt & Record<string, unknown>;

export default function ArenaPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  const live = useArenaLive(15);
  const { view, rec, summary, recent } = live;
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string }>();
  const [walletMsg, setWalletMsg] = useState<string>();

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
      void live.refreshChain();
    }
  };

  const hours = rec ? survivalHours(rec.score) : undefined;
  const statusBadge = rec ? (
    <Badge
      variant={rec.breached ? "error" : "success"}
      label={rec.breached ? t.breached : t.intact}
    />
  ) : (
    <Skeleton width={96} height={24} />
  );

  const keyCard = (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>{t.keyTitle}</Heading>
        <CodeBlock title={t.privateKey} code={ARENA.agentPrivateKey} isWrapped size="sm" />
        <CodeBlock title={t.address} code={ARENA.agent} isWrapped size="sm" />
        <Banner status="warning" title={t.keyWarning} />
        <Divider />
        <Heading level={3}>{t.networkTitle}</Heading>
        <MetadataList>
          <MetadataListItem label={t.rpc}>
            <Code>{RPC}</Code>
          </MetadataListItem>
          <MetadataListItem label={t.chainId}>
            <Code>{`261126 (${ARENA.chainIdHex})`}</Code>
          </MetadataListItem>
          <MetadataListItem label={t.currency}>USDC (18 decimals)</MetadataListItem>
        </MetadataList>
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
    </Card>
  );

  const mandateCard = (
    <Card>
      <VStack gap={4}>
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={2}>{t.mandateTitle}</Heading>
          {view?.frozen ? <Badge variant="warning" label={t.frozen} /> : null}
        </HStack>
        {view ? (
          <>
            <ProgressBar
              label={t.spentToday}
              value={asNumber(view.spentToday)}
              max={asNumber(view.mandate.dailyCap) || 1}
              variant={view.frozen ? "warning" : "success"}
              marks={[{ value: asNumber(view.mandate.perTxCap), label: t.perTx }]}
              hasValueLabel
              formatValueLabel={(v, m) => `${v} / ${m} USDC`}
            />
            <MetadataList>
              <MetadataListItem
                label={t.perTx}
              >{`${usdc(view.mandate.perTxCap)} USDC`}</MetadataListItem>
              <MetadataListItem
                label={t.perDay}
              >{`${usdc(view.mandate.dailyCap)} USDC`}</MetadataListItem>
              <MetadataListItem label={t.expires}>
                <Timestamp value={Number(view.mandate.expiry)} format="date" />
              </MetadataListItem>
              <MetadataListItem label={t.payees}>
                <VStack gap={1}>
                  {view.mandate.payees.map((p) => (
                    <Code key={p}>{p}</Code>
                  ))}
                </VStack>
              </MetadataListItem>
            </MetadataList>
          </>
        ) : (
          <Skeleton height={120} />
        )}
        <Divider />
        <Collapsible trigger={<Text weight="bold">{t.onChainCheck}</Text>} defaultIsOpen={false}>
          <VStack gap={3}>
            <MetadataList>
              <MetadataListItem label={t.balance}>
                {view ? `${usdc(view.balance)} USDC` : "…"}
              </MetadataListItem>
              <MetadataListItem label={t.funded}>
                {rec ? `${usdc(rec.funded)} USDC` : "…"}
              </MetadataListItem>
              <MetadataListItem label={t.required}>
                {rec ? `${usdc(rec.required)} USDC` : "…"}
              </MetadataListItem>
            </MetadataList>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Button
                label={t.checkpoint}
                variant="secondary"
                size="sm"
                isLoading={busy === "checkpoint"}
                isDisabled={!!busy}
                onClick={() => void act("checkpoint")}
              />
              <Button
                label={t.reportBreach}
                variant="secondary"
                size="sm"
                isLoading={busy === "reportBreach"}
                isDisabled={!!busy}
                onClick={() => void act("reportBreach")}
              />
              <InfoTip content={t.actionHelp} />
            </HStack>
            {outcome ? (
              <Banner status={outcome.ok ? "success" : "error"} title={outcome.text} />
            ) : null}
          </VStack>
        </Collapsible>
      </VStack>
    </Card>
  );

  const attempts = (
    <Card>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} vAlign="center">
            <Heading level={2}>{t.attemptsTitle}</Heading>
            <StatusDot variant={live.error ? "warning" : "success"} label="Live" />
          </HStack>
          <InfoTip content={t.offChain} />
        </HStack>
        {live.error ? <Banner status="error" title={t.liveDown} /> : null}
        {summary && Object.keys(summary.byReason).length > 0 ? (
          <HStack gap={2} wrap="wrap">
            {Object.entries(summary.byReason)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, n]) => (
                <Token key={reason} label={`${reason} · ${n}`} />
              ))}
          </HStack>
        ) : null}
        {recent === undefined ? (
          <Skeleton height={160} />
        ) : recent.length === 0 ? (
          <EmptyState isCompact title={t.none} description={t.emptyHint} />
        ) : (
          <Table<Row>
            density="compact"
            data={recent as Row[]}
            idKey={(a) => `${a.ts}-${a.to}-${a.value}-${a.result}`}
            columns={[
              {
                key: "ts",
                header: t.when,
                renderCell: (a) => (
                  <Timestamp value={Math.floor(a.ts / 1000)} format="relative" isLive />
                ),
              },
              { key: "to", header: t.to, renderCell: (a) => <Code>{short(a.to)}</Code> },
              {
                key: "value",
                header: t.amount,
                renderCell: (a) => `${usdc(BigInt(a.value || "0"))} USDC`,
              },
              {
                key: "result",
                header: t.result,
                renderCell: (a) => (
                  <Badge
                    variant={a.result === "accepted" ? "success" : "error"}
                    label={a.result === "accepted" ? t.accepted : t.refused}
                  />
                ),
              },
              // On a phone the reasons are already shown as tokens above the table.
              ...(isMobile
                ? []
                : [
                    {
                      key: "reason",
                      header: t.reason,
                      renderCell: (a: Row) => (
                        <Text type="supporting" color="secondary">
                          {a.reason || "-"}
                        </Text>
                      ),
                    },
                  ]),
            ]}
          />
        )}
      </VStack>
    </Card>
  );

  return (
    <SiteShell lang={lang} setLang={setLang} current="arena">
      <VStack gap={6}>
        <VStack gap={3}>
          <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              {t.arenaTitle}
            </Text>
            <HStack gap={2} vAlign="center">
              {statusBadge}
              <Button label={t.rulesLink} variant="secondary" size="sm" href="/arena/rules" />
            </HStack>
          </HStack>
          <Heading level={1} type="display-2" textWrap="balance">
            {t.headline}
          </Heading>
          <Text type="body" color="secondary">
            {t.arenaIntro}
          </Text>
        </VStack>

        <Grid columns={{ minWidth: 160, max: 4 }} gap={4}>
          <Tile
            label={
              <HStack gap={1} vAlign="center">
                <span>{t.survival}</span>
                <InfoTip content={t.survivalHelp} size="xsm" />
              </HStack>
            }
          >
            {hours === undefined ? (
              <Skeleton width={72} height={36} />
            ) : (
              <HStack gap={2} vAlign="end">
                <Text type="display-3">{hours.toFixed(1)}</Text>
                <Text type="supporting" color="secondary">
                  {t.survivalUnit}
                </Text>
              </HStack>
            )}
          </Tile>
          <Tile label={t.refused}>{big(summary?.rejected)}</Tile>
          <Tile label={t.accepted}>{big(summary?.accepted)}</Tile>
          <Tile label={t.senders}>{big(summary?.distinctSenders)}</Tile>
        </Grid>

        <Stack direction={isMobile ? "vertical" : "horizontal"} gap={4} vAlign="start">
          <StackItem size="fill" style={isMobile ? undefined : colBasis}>
            {keyCard}
          </StackItem>
          <StackItem size="fill" style={isMobile ? undefined : colBasis}>
            {mandateCard}
          </StackItem>
        </Stack>

        {attempts}
      </VStack>
    </SiteShell>
  );
}
