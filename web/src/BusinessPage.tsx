import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ARENA } from "./arena.config.js";
import { BrandMark } from "./BrandMark.js";
import { businessText } from "./businessText.js";
import { useI18n } from "./i18n.js";
import { SiteShell } from "./SiteShell.js";

const README = `${ARENA.source}#readme`;
const LIMITS = `${ARENA.source}#security-model-and-limitations`;
const QUICK_START = `${ARENA.source}#quick-start`;
const EVALUATION = `${ARENA.source}/blob/main/docs/EVALUATION.md`;

function Item({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <VStack gap={2}>
        <Text weight="bold">{title}</Text>
        <Text type="body" color="secondary">
          {body}
        </Text>
      </VStack>
    </Card>
  );
}

function Block(o: {
  title: string;
  badge?: string;
  items: string[][];
  max?: number;
  minWidth?: number;
}) {
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={2}>{o.title}</Heading>
        {o.badge && <Badge variant="warning" label={o.badge} />}
      </HStack>
      <Grid columns={{ minWidth: o.minWidth ?? 240, max: o.max ?? 3 }} gap={4}>
        {o.items.map(([title, body]) => (
          <Item key={title} title={title ?? ""} body={body ?? ""} />
        ))}
      </Grid>
    </VStack>
  );
}

export default function BusinessPage() {
  const { lang, setLang } = useI18n();
  const t = businessText(lang);
  return (
    <SiteShell lang={lang} setLang={setLang} current="business" maxWidth={1040}>
      <VStack gap={10}>
        <VStack gap={4}>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <BrandMark size={40} />
            <Badge variant="neutral" label={t.eyebrow} />
          </HStack>
          <Heading level={1} type="display-2" textWrap="balance">
            {t.title}
          </Heading>
          <Text type="body" color="secondary" textWrap="pretty">
            {t.lead}
          </Text>
          <HStack gap={3} wrap="wrap">
            <Button label={t.ctaConsole} variant="primary" href="/console" />
            <Button label={t.ctaEvaluation} variant="secondary" href={EVALUATION} />
          </HStack>
        </VStack>

        <Block title={t.whoTitle} items={t.who} max={2} />
        <Block title={t.useTitle} items={t.use} />
        <Block title={t.moneyTitle} badge={t.hypothesisBadge} items={t.money} />

        <VStack gap={3}>
          <Heading level={2}>{t.notTitle}</Heading>
          <Card>
            <VStack gap={2}>
              {t.not.map((s) => (
                <Text key={s} type="body" color="secondary">
                  {s}
                </Text>
              ))}
              <Link href={LIMITS}>{t.limitsLink}</Link>
            </VStack>
          </Card>
        </VStack>

        <VStack gap={3}>
          <Block title={t.checkTitle} items={t.check} max={4} minWidth={200} />
          <HStack gap={4} wrap="wrap">
            <Link href={ARENA.deployments}>deployments/fuji.json</Link>
            <Link href={EVALUATION}>{t.evaluationLink}</Link>
            <Link href={QUICK_START}>{t.readmeLink}</Link>
            <Link href={README}>README</Link>
          </HStack>
        </VStack>
      </VStack>
    </SiteShell>
  );
}
