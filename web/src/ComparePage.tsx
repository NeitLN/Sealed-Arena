import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { ARENA } from "./arena.config.js";
import result from "./compare-result.json";
import { compareText, type Result, type Tx } from "./compareText.js";
import { useI18n } from "./i18n.js";
import { SiteShell } from "./SiteShell.js";

const r = result as unknown as Result;
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

/** One cell of the verdict table: a status badge and one short line. */
function Verdict(o: {
  variant: "success" | "warning" | "error" | "neutral";
  badge: string;
  line: string;
}) {
  return (
    <VStack gap={1}>
      <HStack>
        <Badge variant={o.variant} label={o.badge} />
      </HStack>
      <Text type="supporting" color="secondary">
        {o.line}
      </Text>
    </VStack>
  );
}

/** The burst of payments as dots: green made it into a block, red reverted inside one. */
function Dots({ txs, label }: { txs: Tx[]; label: string }) {
  return (
    <VStack gap={2}>
      <HStack gap={1} wrap="wrap">
        {txs.map((t) => (
          <StatusDot
            key={t.tx}
            variant={t.status === "success" ? "success" : "error"}
            label={t.status === "success" ? "settled" : "reverted"}
          />
        ))}
      </HStack>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </VStack>
  );
}

function TxList({ txs, base, title }: { txs: Tx[]; base?: string; title: string }) {
  if (!txs.length) return null;
  return (
    <Collapsible
      trigger={<Text type="supporting">{`${title} (${txs.length})`}</Text>}
      defaultIsOpen={false}
    >
      <VStack gap={1}>
        {txs.map((t) =>
          base ? (
            <Link key={t.tx} href={`${base}${t.tx}`}>
              <Code>{`${t.status === "success" ? "✓" : "✗"} ${short(t.tx)}`}</Code>
            </Link>
          ) : (
            <Code key={t.tx}>{`${t.status === "success" ? "✓" : "✗"} ${short(t.tx)}`}</Code>
          ),
        )}
      </VStack>
    </Collapsible>
  );
}

function Wallet(o: {
  name: string;
  what: string;
  tag?: ReactNode;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <Card variant={o.highlight ? "green" : "default"}>
      <VStack gap={3}>
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={3}>{o.name}</Heading>
          {o.tag}
        </HStack>
        <Text type="supporting" color="secondary">
          {o.what}
        </Text>
        {o.children}
      </VStack>
    </Card>
  );
}

export default function ComparePage() {
  const { lang, setLang } = useI18n();
  const t = compareText(lang, r);
  const base = r.explorers.cChain;
  const vi = lang === "vi";
  const notMeasured = <Verdict variant="neutral" badge={t.notRun} line="" />;

  return (
    <SiteShell lang={lang} setLang={setLang} current="compare">
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1} type="display-2" textWrap="balance">
            {t.title}
          </Heading>
          <Text type="body" color="secondary">
            {t.intro}
          </Text>
        </VStack>

        <Card padding={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>{vi ? "Tình huống" : "Situation"}</TableCell>
                <TableCell>{t.pName}</TableCell>
                <TableCell>{t.oName}</TableCell>
                <TableCell>{t.sName}</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Text weight="bold">{t.injection}</Text>
                </TableCell>
                <TableCell>
                  <Verdict variant="error" badge={`−${r.P.attackerReceived} USDC`} line={t.pLoss} />
                </TableCell>
                <TableCell>{notMeasured}</TableCell>
                <TableCell>
                  <Verdict
                    variant={r.S.injection.refused ? "success" : "error"}
                    badge={vi ? "Bị từ chối" : "Refused"}
                    line={t.sInjection}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Text weight="bold">{t.burst}</Text>
                </TableCell>
                <TableCell>{notMeasured}</TableCell>
                <TableCell>
                  <Verdict
                    variant="warning"
                    badge={`${r.O.revertedOnChain}/${r.O.attempts} ${vi ? "revert trong block" : "reverted in blocks"}`}
                    line={t.oBurst}
                  />
                </TableCell>
                <TableCell>
                  <Verdict
                    variant="success"
                    badge={`${r.S.attempts - r.S.settledOnChain}/${r.S.attempts} ${vi ? "chưa vào block" : "not in a block"}`}
                    line={t.sBurst}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>

        <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
          <Wallet name={t.pName} what={t.pWhat}>
            <TxList txs={[{ tx: r.P.tx, status: "success", block: 0 }]} base={base} title={t.txs} />
          </Wallet>
          <Wallet name={t.oName} what={t.oWhat}>
            <Dots
              txs={r.O.txs}
              label={`${r.O.settledOnChain} ${vi ? "vào block" : "settled"} · ${r.O.revertedOnChain} ${vi ? "revert" : "reverted"}`}
            />
            <TxList txs={r.O.txs} base={base} title={t.txs} />
          </Wallet>
          <Wallet
            name={t.sName}
            what={t.sWhat}
            highlight
            tag={<Badge variant="neutral" label={vi ? "Dự án này" : "This project"} />}
          >
            <Dots
              txs={r.S.txs}
              label={`${r.S.settledOnChain} ${vi ? "vào block" : "in blocks"} · ${r.S.attempts - r.S.settledOnChain} ${vi ? "chưa vào block" : "not in a block"}`}
            />
            <TxList txs={r.S.txs} title={t.txs} />
          </Wallet>
        </Grid>

        <VStack gap={2}>
          <Heading level={2}>{vi ? "Cách đo và lưu ý" : "Method and caveats"}</Heading>
          <List>
            {t.notes.map((n) => (
              <ListItem
                key={n}
                label={
                  <Text type="supporting" color="secondary">
                    {n}
                  </Text>
                }
              />
            ))}
          </List>
          <Link href={`${ARENA.source}/tree/main/services/attacks/compare`}>{t.source}</Link>
        </VStack>
      </VStack>
    </SiteShell>
  );
}
