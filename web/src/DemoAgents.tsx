import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { type ReactNode, useState } from "react";
import { type Address, type Hex, type PublicClient, parseEther } from "viem";
import { designText } from "./designText.js";
import { type SendOutcome, sendAsAgent } from "./forbiddenSend.js";
import type { Lang, T } from "./i18n.js";
import { type Passkey, prepareDemoClaim, RELAYER_URL, relayerInfo } from "./owner.js";
import { type RelayerError, relayerErrorText } from "./relayerError.js";
import { StatusPill } from "./StatusPill.js";

/** An address nobody holds a key for; never on a mandate. */
const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";
const STORE = "sealed.demoKeys";

/** Demo agent keys generated in this browser, by address (lower case). */
function storedKeys(): Record<string, Hex> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, Hex>;
  } catch {
    return {};
  }
}
function storeKey(agent: Address, key: Hex) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...storedKeys(), [agent.toLowerCase()]: key }));
  } catch {
    // not kept: the visitor can claim another agent later
  }
}

/** Browser-generated demo keys: register with the relayer before allowing or funding. */
export function DemoAgents(o: {
  t: T;
  lang: Lang;
  children: ReactNode;
  client: PublicClient | undefined;
  passkey: Passkey | undefined;
  /** The agent the page shows, and whether it is linked to this browser's passkey. */
  current: Address | undefined;
  ownedByMe: boolean;
  /** The first payee of the current mandate, if any. */
  payee: Address | undefined;
  onClaimed: (agent: Address) => void;
  onTried: () => void;
}) {
  const { t, client } = o;
  const d = designText(o.lang);
  const [keys, setKeys] = useState(storedKeys);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string>();
  const [trying, setTrying] = useState<"stranger" | "payee">();
  const [tried, setTried] = useState<{ to: "stranger" | "payee"; out: SendOutcome }>();
  // The key this browser generated for the agent on screen. It does not wait for the next chain
  // read, so the "Get a demo agent" button cannot come back (and spend a second claim) meanwhile.
  const myKey = o.current ? keys[o.current.toLowerCase()] : undefined;
  const out = tried?.out;

  const claim = async () => {
    if (!o.passkey || claiming) return;
    setClaiming(true);
    setClaimError(undefined);
    try {
      const { privateKey, request } = await prepareDemoClaim(o.passkey, await relayerInfo());
      // Persist before sending: a lost response must not discard a funded agent's key.
      storeKey(request.agent, privateKey);
      setKeys((old) => ({ ...old, [request.agent.toLowerCase()]: privateKey }));
      const res = await fetch(`${RELAYER_URL}/demo/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await res.json().catch(() => ({}))) as RelayerError & {
        ok?: boolean;
        agent?: Address;
      };
      if (!body.ok || !body.agent || body.agent.toLowerCase() !== request.agent.toLowerCase()) {
        setClaimError(relayerErrorText(t, body, "demoFailed"));
        return;
      }
      o.onClaimed(body.agent);
    } catch {
      setClaimError(t("demoFailed"));
    } finally {
      setClaiming(false);
    }
  };

  const tryPayment = async (to: "stranger" | "payee") => {
    const target = to === "stranger" ? STRANGER : o.payee;
    if (!client || !myKey || !target) return;
    setTrying(to);
    setTried(undefined);
    setTried({ to, out: await sendAsAgent(client, myKey, target, parseEther("0.01")) });
    setTrying(undefined);
    o.onTried();
  };

  return (
    <div className="demo-workflow">
      <Card>
        <VStack gap={3}>
          <Heading level={2}>{t("demoTitle")}</Heading>
          <Text type="body" color="secondary">
            {t("demoIntro")}
          </Text>
          {!myKey ? (
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Button
                label={t("demoGet")}
                variant="primary"
                isLoading={claiming}
                isDisabled={claiming || !o.passkey}
                onClick={() => void claim()}
              />
              {!o.passkey && (
                <Text type="supporting" color="secondary">
                  {t("demoNeedPasskey")}
                </Text>
              )}
            </HStack>
          ) : (
            <Text type="supporting">{t("demoStep3")}</Text>
          )}
          {claimError && <Banner status="error" title={claimError} />}
        </VStack>
      </Card>
      {o.children}
      <section className="console-test" aria-label={d.workflow[3]}>
        <Heading level={2}>{d.workflow[3]}</Heading>
        {!myKey ? (
          <p className="caption">{o.current && o.ownedByMe ? d.ownKeyHint : d.pendingMandate}</p>
        ) : (
          <VStack gap={4}>
            <Text type="body" color="secondary">
              {t("demoTryHint")}
            </Text>
            {!o.payee && <p className="caption">{d.pendingMandate}</p>}
            <HStack gap={3} wrap="wrap">
              <Button
                label={t("demoTry")}
                variant="primary"
                isLoading={trying === "stranger"}
                isDisabled={!!trying || !client}
                onClick={() => void tryPayment("stranger")}
              />
              <Button
                label={t("demoTryPayee")}
                variant="secondary"
                isLoading={trying === "payee"}
                isDisabled={!!trying || !client || !o.payee}
                onClick={() => void tryPayment("payee")}
              />
            </HStack>
            <div aria-live="polite">
              {out?.kind === "refused" ? (
                <div className="refusal-receipt">
                  <StatusPill state="refused">{t("demoRefused")}</StatusPill>
                  <code>{out.reason}</code>
                </div>
              ) : out?.kind === "accepted" && tried?.to === "payee" ? (
                <Banner
                  status="success"
                  title={t("demoPaid")}
                  description={<Code>{out.hash}</Code>}
                />
              ) : out?.kind === "accepted" ? (
                <Banner
                  status="error"
                  title={t("demoAccepted")}
                  description={<Code>{out.hash}</Code>}
                />
              ) : out?.kind === "busy" ? (
                <Banner status="warning" title={t("demoBusy")} />
              ) : out?.kind === "node" ? (
                <Banner
                  status="warning"
                  title={t("demoNode")}
                  description={<Code>{out.message}</Code>}
                />
              ) : out?.kind === "error" ? (
                <Banner status="warning" title={t("demoError")} description={out.message} />
              ) : null}
            </div>
            <details className="demo-key">
              <summary>{d.privateDemo}</summary>
              <p>{d.privateDemoNote}</p>
              <code>{myKey}</code>
            </details>
          </VStack>
        )}
      </section>
    </div>
  );
}
