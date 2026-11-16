import { Banner } from "@astryxdesign/core/Banner";
import { Center } from "@astryxdesign/core/Center";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { useI18n } from "./i18n.js";
import { SiteHeader } from "./SiteHeader.js";

const mono = { fontFamily: "var(--font-family-code, monospace)" };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={2}>
      <Text type="large" weight="bold">
        {title}
      </Text>
      {children}
    </VStack>
  );
}

export default function RulesPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <Center axis="horizontal">
            <Section variant="transparent" maxWidth={820} width="100%" padding={isMobile ? 4 : 6}>
              <VStack gap={6}>
                <Banner status="warning" title={t.testnet} />
                <SiteHeader title={t.rulesTitle} lang={lang} setLang={setLang} current="rules" />
                <Block title={t.scopeTitle}>
                  <Text type="body">{t.scope}</Text>
                </Block>
                <Block title={t.freeTitle}>
                  <Text type="body">{t.free}</Text>
                </Block>
                <Block title={t.breachTitle}>
                  <Text type="body">{t.t0}</Text>
                  <Text type="body">{t.t1}</Text>
                  <Text type="body">{t.t2}</Text>
                </Block>
                <Block title={t.validatorsTitle}>
                  <Text type="body">{t.validators}</Text>
                  {ARENA.validators.map((v) => (
                    <Text key={v} type="supporting" style={mono}>
                      {v}
                    </Text>
                  ))}
                  <Link href={ARENA.source}>{ARENA.source}</Link>
                  <Link href={ARENA.deployments}>deployments/fuji.json</Link>
                </Block>
                <Block title={t.limitsTitle}>
                  {t.limits.map((l, i) => (
                    <Text key={l} type="body">
                      {i + 1}. {l}
                    </Text>
                  ))}
                </Block>
                <Block title={t.reportTitle}>
                  <Text type="body">{t.report}</Text>
                </Block>
              </VStack>
            </Section>
          </Center>
        </LayoutContent>
      }
    />
  );
}
