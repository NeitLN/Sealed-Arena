import { Badge } from "@astryxdesign/core/Badge";

import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { type ReactNode, useEffect } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { designText } from "./designText.js";
import { useI18n } from "./i18n.js";
import { limitationSources, limitationsText } from "./limitationsText.js";
import { SiteShell } from "./SiteShell.js";
import "./reading.css";

function Block({
  title,
  children,
  id,
  major = false,
}: {
  title: string;
  children: ReactNode;
  id?: string;
  major?: boolean;
}) {
  if (major)
    return (
      <section className="rule-section">
        <h2 id={id}>{title}</h2>
        <VStack gap={3}>{children}</VStack>
      </section>
    );
  return (
    <VStack gap={2}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {children}
    </VStack>
  );
}

/** A tier line ("T0, breach: …") with a badge saying how it counts. */
function Tier(o: { text: string; variant: "error" | "neutral" | "warning"; badge: string }) {
  const [head, ...rest] = o.text.split(": ");
  const [tier, ...name] = (head ?? "").split(", ");
  const body = rest.join(": ");
  const formula = /funded − charged|đã nạp − đã tính/.exec(body);
  return (
    <article className="rule-tier">
      <span className="tier-code">{tier}</span>
      <div className="tier-description">
        <div className="tier-heading">
          <h3>{name.join(", ")}</h3>
          <Badge variant={o.variant} label={o.badge} />
        </div>
        <p>
          {formula ? (
            <>
              {body.slice(0, formula.index)}
              <code>{formula[0]}</code>
              {body.slice(formula.index + formula[0].length)}
            </>
          ) : (
            body
          )}
        </p>
      </div>
    </article>
  );
}

export default function RulesPage() {
  const { lang, setLang } = useI18n();
  const t = arenaText(lang);
  const vi = lang === "vi";
  const d = designText(lang);
  const limits = limitationsText(lang);
  const sources = limitationSources;
  useEffect(() => {
    // Keep published deep links useful when a limitation starts collapsed.
    const openLinkedLimit = () => {
      const hash = window.location.hash.slice(1);
      if (!/^limitation-\d+$/.test(hash)) return;
      const row = document.getElementById(hash);
      const details = row?.querySelector("details");
      if (!details || !row) return;
      details.open = true;
      row.scrollIntoView({ block: "start" });
    };
    openLinkedLimit();
    window.addEventListener("hashchange", openLinkedLimit);
    return () => window.removeEventListener("hashchange", openLinkedLimit);
  }, []);
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
        <nav className="section-index" aria-label={vi ? "Nội dung trang" : "On this page"}>
          <a href="#scope">{t.scopeTitle}</a>
          <a href="#breach">{t.breachTitle}</a>
          <a href="#limits">{t.limitsTitle}</a>
          <a href="#report">{t.reportTitle}</a>
        </nav>
        <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
          <Card>
            <Block id="scope" title={t.scopeTitle}>
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
        <Block major id="breach" title={t.breachTitle}>
          <div className="tier-list">
            <Tier
              text={t.t0}
              variant="error"
              badge={vi ? "Tính là vi phạm" : "Counts as a breach"}
            />
            <Tier text={t.t1} variant="neutral" badge={vi ? "Ngoài phạm vi" : "Out of scope"} />
            <Tier text={t.t2} variant="neutral" badge={vi ? "Được phép" : "Allowed"} />
          </div>
        </Block>
        <Block major title={t.validatorsTitle}>
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
        <Block major id="limits" title={t.limitsTitle}>
          <ol className="limits-ledger">
            {limits.map(([title, body], index) => (
              <li key={title} id={`limitation-${index + 1}`}>
                <details>
                  <summary>
                    <span className="ledger-number" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{title}</span>
                    <span aria-hidden="true" className="ledger-toggle" />
                  </summary>
                  <div className="ledger-body">
                    <p>{body}</p>
                    <a
                      href={`${ARENA.source}/blob/main/${sources[index]}`}
                      aria-label={`${vi ? "Nguồn cho hạn chế" : "Source for limitation"} ${index + 1}`}
                    >
                      {vi ? "Xem nguồn" : "View source"} ↗
                    </a>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </Block>
        <Card variant="blue">
          <Block id="report" title={t.reportTitle}>
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
