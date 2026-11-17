import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { arenaText } from "./arenaText.js";
import type { Lang } from "./i18n.js";

type Current = "owner" | "arena" | "rules" | "compare";

/** Title, navigation between the pages, and the language switch. */
export function SiteHeader(o: {
  title: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  current: Current;
}) {
  const t = arenaText(o.lang);
  const nav: Array<[string, string, Current]> = [
    ["/", t.navOwner, "owner"],
    ["/arena", t.navArena, "arena"],
    ["/arena/rules", t.navRules, "rules"],
    ["/compare", t.navCompare, "compare"],
  ];
  return (
    <VStack gap={4}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Text type="display-1" as="div">
          Sealed Arena · {o.title}
        </Text>
        <SegmentedControl
          label="Language"
          value={o.lang}
          onChange={(v) => o.setLang(v as Lang)}
          size="sm"
        >
          <SegmentedControlItem value="en" label="EN" />
          <SegmentedControlItem value="vi" label="VI" />
        </SegmentedControl>
      </HStack>
      <HStack gap={4} wrap="wrap">
        {nav.map(([href, label, key]) =>
          key === o.current ? (
            <Text key={key} type="body" weight="bold">
              {label}
            </Text>
          ) : (
            <Link key={key} href={href}>
              {label}
            </Link>
          ),
        )}
      </HStack>
      <Divider />
    </VStack>
  );
}
