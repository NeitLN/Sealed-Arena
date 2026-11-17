import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import result from "./compare-result.json";
import type { Result } from "./compareText.js";
import { useI18n } from "./i18n.js";
import { landingText } from "./landingText.js";
import { SiteShell } from "./SiteShell.js";
import { useArenaLive } from "./useArenaLive.js";

const r = result as unknown as Result;

/** USDC·hours from the recorder's score (coin·seconds with 18 decimals). */
export const survivalHours = (score: bigint) => Number(score / 10n ** 15n) / 1000 / 3600;

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

const number = (v: number | undefined) =>
  v === undefined ? (
    <Skeleton width={80} height={36} />
  ) : (
    <Text type="display-3">{v.toLocaleString()}</Text>
  );

export default function LandingPage() {
  const { lang, setLang } = useI18n();
  const t = landingText(lang);
  const live = useArenaLive(1);
  const hours = live.rec ? survivalHours(live.rec.score) : undefined;
  const fill = (s: string) =>
    s
      .replace("{passed}", String(r.O.passedVerifyBeforeSettle))
      .replace("{attempts}", String(r.O.attempts))
      .replace("{reverted}", String(r.O.revertedOnChain));

  return (
    <SiteShell lang={lang} setLang={setLang} current="home">
      <VStack gap={10}>
        {/* Hero (centered-hero template) */}
        <VStack gap={6} hAlign="center">
          <VStack gap={3} hAlign="center">
            <Badge variant="blue" label={t.eyebrow} />
            <Heading level={1} type="display-2" justify="center" textWrap="balance">
              {t.headline}
            </Heading>
            <Text type="body" color="secondary" justify="center" textWrap="balance">
              {t.lead}
            </Text>
          </VStack>
          <HStack gap={3} wrap="wrap" hAlign="center">
            <Button label={t.tryIt} variant="primary" href="/arena" />
            <Button label={t.seeCompare} variant="secondary" href="/compare" />
          </HStack>
          <Link href="/console">{t.ownerConsole}</Link>
        </VStack>

        {/* Live proof */}
        <VStack gap={3}>
          <HStack gap={2} vAlign="center">
            <StatusDot variant={live.error ? "warning" : "success"} label={t.liveTitle} />
            <Heading level={2}>{t.liveTitle}</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            {live.error ? t.liveDown : t.liveNote}
          </Text>
          <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
            <Tile label={t.refused}>{number(live.summary?.rejected)}</Tile>
            <Tile label={t.senders}>{number(live.summary?.distinctSenders)}</Tile>
            <Tile
              label={
                <HStack gap={1} vAlign="center">
                  <span>{t.survival}</span>
                  <InfoTip content={t.survivalHelp} size="xsm" />
                </HStack>
              }
            >
              {hours === undefined ? (
                <Skeleton width={80} height={36} />
              ) : (
                <HStack gap={2} vAlign="end">
                  <Text type="display-3">{hours.toFixed(1)}</Text>
                  <Text type="supporting" color="secondary">
                    {t.survivalUnit}
                  </Text>
                </HStack>
              )}
            </Tile>
            <Tile label={t.status}>
              {live.rec ? (
                <HStack>
                  <Badge
                    variant={live.rec.breached ? "error" : "success"}
                    label={live.rec.breached ? t.breached : t.intact}
                  />
                </HStack>
              ) : (
                <Skeleton width={96} height={24} />
              )}
            </Tile>
          </Grid>
        </VStack>

        {/* How it works */}
        <VStack gap={3}>
          <Heading level={2}>{t.howTitle}</Heading>
          <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
            {[
              [t.step1Title, t.step1],
              [t.step2Title, t.step2],
              [t.step3Title, t.step3],
            ].map(([title, body], i) => (
              <Card key={title}>
                <VStack gap={2}>
                  <Text type="supporting" color="secondary">
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                  <Heading level={3}>{title}</Heading>
                  <Text type="body" color="secondary">
                    {body}
                  </Text>
                </VStack>
              </Card>
            ))}
          </Grid>
        </VStack>

        {/* Comparison teaser */}
        <VStack gap={3}>
          <Heading level={2}>{t.compareTitle}</Heading>
          <Text type="supporting" color="secondary">
            {t.compareNote}
          </Text>
          <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
            <Card>
              <VStack gap={3}>
                <Heading level={3}>{t.plain}</Heading>
                <HStack>
                  <Badge variant="error" label={`−${r.P.attackerReceived} USDC`} />
                </HStack>
                <Text type="body" color="secondary">
                  {t.plainResult}
                </Text>
              </VStack>
            </Card>
            <Card>
              <VStack gap={3}>
                <Heading level={3}>{t.limit}</Heading>
                <HStack>
                  <Badge
                    variant="warning"
                    label={`${r.O.revertedOnChain}/${r.O.attempts} ${t.revertedShort}`}
                  />
                </HStack>
                <Text type="body" color="secondary">
                  {fill(t.limitResult)}
                </Text>
              </VStack>
            </Card>
            <Card variant="green">
              <VStack gap={3}>
                <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                  <Heading level={3}>{t.sealed}</Heading>
                  <Badge variant="neutral" label={t.thisProject} />
                </HStack>
                <HStack>
                  <Badge variant="success" label={r.S.injection.reason} />
                </HStack>
                <Text type="body" color="secondary">
                  {t.sealedResult}
                </Text>
              </VStack>
            </Card>
          </Grid>
          <HStack gap={4} wrap="wrap">
            <Link href="/compare">{t.fullResults}</Link>
            <Link href={`${ARENA.source}/blob/main/docs/EVALUATION.md`}>{t.evaluation}</Link>
          </HStack>
        </VStack>
      </VStack>
    </SiteShell>
  );
}
