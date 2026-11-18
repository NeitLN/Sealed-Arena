import { Badge } from "@astryxdesign/core/Badge";

import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { designText } from "./designText.js";
import { useI18n } from "./i18n.js";
import { limitationsText } from "./limitationsText.js";
import { SiteShell } from "./SiteShell.js";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={2}>
      <Heading level={2}>{title}</Heading>
      {children}
    </VStack>
  );
}

/** A tier line ("T0, breach: …") with a badge saying how it counts. */
function Tier(o: { text: string; variant: "error" | "neutral" | "warning"; badge: string }) {
  const [head, ...rest] = o.text.split(": ");
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Text weight="bold">{head}</Text>
          <Badge variant={o.variant} label={o.badge} />
        </HStack>
        <Text type="body" color="secondary">
          {rest.join(": ")}
        </Text>
      </VStack>
    </Card>
  );
}

export default function RulesPage() {
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  const vi = lang === "vi";
  const d = designText(lang);
  const limits = limitationsText(lang);
  const sources = [
    "README.md#security-model-and-limitations",
    "chain/patches/0002-agentpolicy-precompile.patch",
    "chain/patches/0003-agent-rule.patch",
    "chain/patches/0003-agent-rule.patch",
    "services/attacks/suite/results/leaked-key-fuji.json",
    "chain/patches/0003-agent-rule.patch",
    "contracts/src/ArenaRecorder.sol",
    "contracts/src/ReputationReceiver.sol",
    "services/facilitator/src/scheme.ts",
    "packages/shared/src/agentPolicy.ts",
    "chain/patches/0002-agentpolicy-precompile.patch",
    "chain/patches/0003-agent-rule.patch",
    "services/relayer/src/chain.ts",
    "chain/patches/0003-agent-rule.patch",
  ];
  return (
    <SiteShell lang={lang} setLang={setLang} current="rules" maxWidth={860}>
      <VStack gap={6}>
        <VStack gap={3}>
          <Heading level={1} type="display-2">
            {t.rulesTitle}
          </Heading>
          <HStack>
            <a className="text-link" href="/arena">
              ← {d.back}
            </a>
          </HStack>
        </VStack>
        <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
          <Card>
            <Block title={t.scopeTitle}>
              <Text type="body" color="secondary">
                {t.scope}
              </Text>
            </Block>
          </Card>
          <Card>
            <Block title={t.freeTitle}>
              <Text type="body" color="secondary">
                {t.free}
              </Text>
            </Block>
          </Card>
        </Grid>
        <Block title={t.breachTitle}>
          <VStack gap={3}>
            <Tier
              text={t.t0}
              variant="error"
              badge={vi ? "Tính là vi phạm" : "Counts as a breach"}
            />
            <Tier text={t.t1} variant="neutral" badge={vi ? "Ngoài phạm vi" : "Out of scope"} />
            <Tier text={t.t2} variant="neutral" badge={vi ? "Được phép" : "Allowed"} />
          </VStack>
        </Block>
        <Block title={t.validatorsTitle}>
          <Text type="body" color="secondary">
            {t.validators}
          </Text>
          {ARENA.validators.map((v) => (
            <Code key={v}>{v}</Code>
          ))}
          <HStack gap={4} wrap="wrap">
            <Link href={ARENA.source}>GitHub</Link>
            <Link href={ARENA.deployments}>deployments/fuji.json</Link>
          </HStack>
        </Block>
        <Block title={t.limitsTitle}>
          <ol className="limits-ledger">
            {limits.map(([title, body], index) => (
              <li key={title} id={`limitation-${index + 1}`}>
                <span className="ledger-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <a
                  href={`${ARENA.source}/blob/main/${sources[index]}`}
                  aria-label={`${vi ? "Nguồn cho hạn chế" : "Source for limitation"} ${index + 1}`}
                >
                  ↗
                </a>
              </li>
            ))}
          </ol>
        </Block>
        <Card variant="blue">
          <Block title={t.reportTitle}>
            <Text type="body">{t.report}</Text>
            <HStack gap={4} wrap="wrap">
              <Link href={`${ARENA.source}/issues/new`}>GitHub Issues ↗</Link>
              <Link href={`${ARENA.source}/blob/main/SECURITY.md`}>SECURITY.md ↗</Link>
            </HStack>
          </Block>
        </Card>
      </VStack>
    </SiteShell>
  );
}
