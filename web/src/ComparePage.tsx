import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Grid } from "@astryxdesign/core/Grid";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import result from "./compare-result.json";
import { compareText, type Result, type Tx } from "./compareText.js";
import { useI18n } from "./i18n.js";
import { SiteHeader } from "./SiteHeader.js";

const r = result as unknown as Result;

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

const mono = { fontFamily: "var(--font-family-code, monospace)" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <VStack gap={1}>
      <Text type="supporting" weight="bold">
        {label}
      </Text>
      {children}
    </VStack>
  );
}

function TxLinks({ txs, base }: { txs: Tx[]; base?: string }) {
  return (
    <VStack gap={1}>
      {txs.map((t) =>
        base ? (
          <Link key={t.tx} href={`${base}${t.tx}`}>
            <Text type="supporting" style={mono} maxLines={1}>
              {t.status === "success" ? "✓" : "✗"} {short(t.tx)}
            </Text>
          </Link>
        ) : (
          <Text key={t.tx} type="supporting" style={mono} maxLines={1}>
            {t.status === "success" ? "✓" : "✗"} {short(t.tx)}
          </Text>
        ),
      )}
    </VStack>
  );
}

export default function ComparePage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang } = useI18n();
  const t = compareText(lang, r);
  const at = arenaText(lang);
  const base = r.explorers.cChain;
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <Center axis="horizontal">
            <Section variant="transparent" maxWidth={1100} width="100%" padding={isMobile ? 4 : 6}>
              <VStack gap={6}>
                <Banner status="warning" title={at.testnet} />
                <SiteHeader title={t.title} lang={lang} setLang={setLang} current="compare" />
                <Text type="body">{t.intro}</Text>
                <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
                  <Card>
                    <VStack gap={4}>
                      <Text type="large" weight="bold">
                        {t.pName}
                      </Text>
                      <Text type="supporting">{t.pWhat}</Text>
                      <Row label={t.injection}>
                        <Text type="body">{t.pLoss}</Text>
                        <TxLinks txs={[{ tx: r.P.tx, status: "success", block: 0 }]} base={base} />
                      </Row>
                      <Row label={t.burst}>
                        <Text type="body">{t.notRun}</Text>
                      </Row>
                    </VStack>
                  </Card>
                  <Card>
                    <VStack gap={4}>
                      <Text type="large" weight="bold">
                        {t.oName}
                      </Text>
                      <Text type="supporting">{t.oWhat}</Text>
                      <Row label={t.injection}>
                        <Text type="body">{t.notRun}</Text>
                      </Row>
                      <Row label={t.burst}>
                        <Text type="body">{t.oBurst}</Text>
                        <TxLinks txs={r.O.txs} base={base} />
                      </Row>
                    </VStack>
                  </Card>
                  <Card>
                    <VStack gap={4}>
                      <Text type="large" weight="bold">
                        {t.sName}
                      </Text>
                      <Text type="supporting">{t.sWhat}</Text>
                      <Row label={t.injection}>
                        <Text type="body">{t.sInjection}</Text>
                      </Row>
                      <Row label={t.burst}>
                        <Text type="body">{t.sBurst}</Text>
                        <TxLinks txs={r.S.txs} />
                      </Row>
                    </VStack>
                  </Card>
                </Grid>
                <VStack gap={2}>
                  {t.notes.map((n) => (
                    <Text key={n} type="supporting">
                      {n}
                    </Text>
                  ))}
                  <Link href={`${ARENA.source}/tree/main/services/attacks/compare`}>
                    {t.source}
                  </Link>
                </VStack>
              </VStack>
            </Section>
          </Center>
        </LayoutContent>
      }
    />
  );
}
