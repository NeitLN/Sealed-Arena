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
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { formatUsdc } from "@sealed-arena/shared";
import { type CSSProperties, type ReactNode, useState } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { designText } from "./designText.js";
import { useI18n } from "./i18n.js";
import { PublishedKey } from "./PublishedKey.js";
import { StatusPill } from "./StatusPill.js";

const survivalHours = (score: bigint) => Number(score / 10n ** 15n) / 1000 / 3600;

import { RELAYER_URL } from "./owner.js";
import { SiteShell } from "./SiteShell.js";
import { TryPayment } from "./TryPayment.js";
import { RPC, useArenaLive } from "./useArenaLive.js";

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

export default function ArenaPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  const d = designText(lang);
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
          : body.reason
            ? { ok: false, text: `${t.failed}: ${body.reason}` }
            : { ok: false, text: `${body.error ?? res.status}` },
      );
    } catch {
      // No answer is not a refusal.
      setOutcome({ ok: false, text: t.relayerDown });
    } finally {
      setBusy(undefined);
      void live.refreshChain();
    }
  };

  const hours = rec ? survivalHours(rec.score) : undefined;
  const statusBadge = rec ? (
    <StatusPill state={rec.breached ? "breach" : "passed"}>
      {rec.breached ? t.breached : t.intact}
    </StatusPill>
  ) : live.error ? (
    <StatusPill state="neutral">{d.unavailable}</StatusPill>
  ) : (
    <Skeleton width={96} height={24} />
  );

  const keyCard = (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>{t.beforeTitle}</Heading>
        <CodeBlock title={t.address} code={ARENA.agent} isWrapped size="sm" />
        <Divider />
        <Heading level={3}>{t.networkTitle}</Heading>
        <MetadataList>
          <MetadataListItem label={t.rpc}>
            <Code>{RPC}</Code>
          </MetadataListItem>
          <MetadataListItem label={t.chainId}>
            <Code>{`${parseInt(ARENA.chainIdHex, 16)} (${ARENA.chainIdHex})`}</Code>
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
        <Divider />
        <VStack gap={1}>
          {t.beforeItems.map((x) => (
            <Text key={x} type="supporting">
              {`• ${x}`}
            </Text>
          ))}
        </VStack>
        <CodeBlock
          title={t.beforeCommand}
          code={`cast send --rpc-url ${RPC} \\\n  --private-key ${ARENA.agentPrivateKey} \\\n  0x000000000000000000000000000000000000dEaD --value 0.01ether`}
          isWrapped
          size="sm"
        />
        <Collapsible defaultIsOpen={false} trigger={<Text weight="bold">{t.beforeViem}</Text>}>
          <CodeBlock
            title="viem"
            isWrapped
            size="sm"
            code={`import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const client = createWalletClient({
  account: privateKeyToAccount('${ARENA.agentPrivateKey}'),
  transport: http('${RPC}'),
});
await client.sendTransaction({
  chain: null,
  to: '0x000000000000000000000000000000000000dEaD',
  value: parseEther('0.01'),
  gas: 21_000n,
});`}
          />
        </Collapsible>
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
        ) : live.error ? (
          <Text color="secondary">{d.liveUnavailable}</Text>
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
            <StatusDot
              variant={live.error || !recent ? "warning" : "success"}
              label={
                live.error
                  ? lang === "vi"
                    ? "Mất kết nối"
                    : "Unavailable"
                  : recent
                    ? lang === "vi"
                      ? "Trực tiếp"
                      : "Live"
                    : lang === "vi"
                      ? "Đang kết nối"
                      : "Connecting"
              }
            />
          </HStack>
          <InfoTip content={t.offChain} />
        </HStack>
        <Text type="supporting" color="secondary">
          {t.offChain}
        </Text>
        {live.error ? <Banner status="warning" title={t.liveDown} /> : null}
        {!live.error && live.stale ? <Banner status="warning" title={t.liveStale} /> : null}
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
          live.error ? (
            <EmptyState isCompact title={d.unavailable} description={t.emptyHint} />
          ) : (
            <Skeleton height={160} />
          )
        ) : recent.length === 0 ? (
          <EmptyState isCompact title={t.none} description={t.emptyHint} />
        ) : (
          <ol className="attempt-feed">
            {recent.map((a) => (
              <li key={`${a.ts}-${a.to}-${a.value}-${a.result}`}>
                <div className="attempt-topline">
                  <StatusPill state={a.result === "accepted" ? "passed" : "refused"}>
                    {a.result === "accepted" ? t.accepted : t.refused}
                  </StatusPill>
                  <Timestamp value={Math.floor(a.ts / 1000)} format="relative" isLive />
                </div>
                <div className="attempt-detail">
                  <code>{short(a.to)}</code>
                  <span>{usdc(BigInt(a.value || "0"))} USDC</span>
                </div>
                {a.reason && <code className="attempt-reason">{a.reason}</code>}
              </li>
            ))}
          </ol>
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

        <PublishedKey lang={lang} />
        <div className="arena-workbench">
          <TryPayment
            t={t}
            view={view}
            onSent={() => void live.refreshChain()}
            onReportBreach={() => void act("reportBreach")}
          />
          {mandateCard}
        </div>
        {outcome ? (
          <Banner status={outcome.ok ? "success" : "warning"} title={outcome.text} />
        ) : null}
        {view && view.balance < view.mandate.perTxCap + 2n * 10n ** 16n ? (
          <Banner status="warning" title={t.lowBalance} />
        ) : null}

        <section className="arena-stats" aria-label={t.statusTitle}>
          <Grid columns={{ minWidth: 160, max: 3 }} gap={4}>
            <Tile label={t.atStake}>
              {view ? (
                <HStack gap={2} vAlign="end">
                  <Text type="display-3">{usdc(view.balance)}</Text>
                  <Text type="supporting" color="secondary">
                    USDC
                  </Text>
                </HStack>
              ) : (
                <Skeleton width={72} height={36} />
              )}
            </Tile>
            <Tile label={t.breaches}>{big(rec ? (rec.breached ? 1 : 0) : undefined)}</Tile>
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
            <Tile
              label={
                <HStack gap={1} vAlign="center">
                  <span>{t.refused}</span>
                  <InfoTip content={t.offChain} size="xsm" />
                </HStack>
              }
            >
              {big(summary?.rejected)}
            </Tile>
            <Tile label={t.accepted}>{big(summary?.accepted)}</Tile>
            <Tile label={t.senders}>{big(summary?.distinctSenders)}</Tile>
          </Grid>
        </section>

        <Stack direction={isMobile ? "vertical" : "horizontal"} gap={4} vAlign="start">
          <StackItem size="fill" style={isMobile ? undefined : colBasis}>
            {keyCard}
          </StackItem>
          <StackItem size="fill" style={isMobile ? undefined : colBasis}>
            {attempts}
          </StackItem>
        </Stack>
      </VStack>
    </SiteShell>
  );
}
