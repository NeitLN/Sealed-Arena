import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { BrandMark } from "./BrandMark.js";
import { businessText } from "./businessText.js";
import type { Lang } from "./i18n.js";

export type Current = "home" | "owner" | "arena" | "rules" | "compare" | "business";

/**
 * Shared frame of every page: top navigation with the brand, a "Testnet" badge, the page links and
 * the language switch; the page content; and a footer that keeps the testnet notice on every page.
 */
export function SiteShell(o: {
  lang: Lang;
  setLang: (l: Lang) => void;
  current: Current;
  maxWidth?: number;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const t = arenaText(o.lang);
  const nav: Array<[string, string, Current]> = [
    ["/arena", t.navArena, "arena"],
    ["/compare", t.navCompare, "compare"],
    ["/arena/rules", t.navRules, "rules"],
    ["/business", businessText(o.lang).nav, "business"],
    ["/console", t.navOwner, "owner"],
  ];
  return (
    <AppShell
      height="auto"
      variant="section"
      topNav={
        <TopNav
          heading={
            <TopNavHeading
              logo={<BrandMark size={24} />}
              heading="Sealed Arena"
              headingHref="/"
              headerEndContent={<Badge variant="warning" label="Testnet" />}
            />
          }
          startContent={nav.map(([href, label, key]) => (
            <TopNavItem key={key} href={href} label={label} isSelected={key === o.current} />
          ))}
          endContent={
            <SegmentedControl
              label="Language"
              value={o.lang}
              onChange={(v) => o.setLang(v as Lang)}
              size="sm"
            >
              <SegmentedControlItem value="en" label="EN" />
              <SegmentedControlItem value="vi" label="VI" />
            </SegmentedControl>
          }
        />
      }
    >
      <Center axis="horizontal">
        <Section
          variant="transparent"
          maxWidth={o.maxWidth ?? 1120}
          width="100%"
          padding={isMobile ? 4 : 6}
        >
          <VStack gap={8}>
            {o.children}
            <VStack gap={3}>
              <Divider />
              <HStack gap={4} hAlign="between" wrap="wrap" vAlign="center">
                <Text type="supporting" color="secondary">
                  {t.testnet}
                </Text>
                <HStack gap={4} wrap="wrap">
                  <Link href="/arena/rules">{t.navRules}</Link>
                  <Link href={ARENA.source}>GitHub</Link>
                  <Link href={ARENA.deployments}>deployments/fuji.json</Link>
                </HStack>
              </HStack>
            </VStack>
          </VStack>
        </Section>
      </Center>
    </AppShell>
  );
}
