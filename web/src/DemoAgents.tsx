import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Code } from "@astryxdesign/core/Code";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { type Address, type Hex, type PublicClient, parseEther } from "viem";
import { type SendOutcome, sendAsAgent } from "./forbiddenSend.js";
import type { T } from "./i18n.js";
import { type Passkey, RELAYER_URL } from "./owner.js";

/** An address nobody holds a key for; never on a mandate. */
const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";
const STORE = "sealed.demoKeys";

/** Demo agent keys this browser was given, by address (lower case). */
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

/**
 * A demo agent for visitors (POST /demo/claim on the relayer): the relayer makes a new agent,
 * registers it to this browser's passkey and only then lets it send, with a little test USDC.
 * Its key comes back to this browser only. Once it is yours, two buttons send real payments with it.
 */
export function DemoAgents(o: {
  t: T;
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
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string>();
  const [trying, setTrying] = useState<"stranger" | "payee">();
  const [tried, setTried] = useState<{ to: "stranger" | "payee"; out: SendOutcome }>();
  const myKey = o.ownedByMe && o.current ? storedKeys()[o.current.toLowerCase()] : undefined;
  const out = tried?.out;

  const claim = async () => {
    if (!o.passkey) return;
    setClaiming(true);
    setClaimError(undefined);
    try {
      const res = await fetch(`${RELAYER_URL}/demo/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerX: o.passkey.x, ownerY: o.passkey.y }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        agent?: Address;
        privateKey?: Hex;
        error?: string;
      };
      if (!body.ok || !body.agent || !body.privateKey) {
        setClaimError(t(body.error ?? "demoFailed"));
        return;
      }
      storeKey(body.agent, body.privateKey);
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
    <Card>
      <VStack gap={4}>
        <VStack gap={2}>
          <Heading level={2}>{t("demoTitle")}</Heading>
          <Text type="body" color="secondary">
            {t("demoIntro")}
          </Text>
        </VStack>
        <VStack gap={1}>
          {(["demoStep1", "demoStep2", "demoStep3", "demoStep4"] as const).map((k, i) => (
            <Text key={k} type="body">
              {i + 1}. {t(k)}
            </Text>
          ))}
        </VStack>
        {!myKey ? (
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Button
              label={t("demoGet")}
              variant="primary"
              isLoading={claiming}
              isDisabled={claiming || !o.passkey}
              onClick={() => void claim()}
            />
            {!o.passkey ? (
              <Text type="supporting" color="secondary">
                {t("demoNeedPasskey")}
              </Text>
            ) : null}
          </HStack>
        ) : (
          <VStack gap={3}>
            <Text type="supporting" color="secondary">
              {t("demoTryHint")}
            </Text>
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
          </VStack>
        )}
        {claimError ? <Banner status="error" title={claimError} /> : null}
        {out?.kind === "refused" ? (
          <Banner
            status="success"
            title={t("demoRefused")}
            description={<Code>{out.reason}</Code>}
          />
        ) : out?.kind === "accepted" && tried?.to === "payee" ? (
          <Banner status="success" title={t("demoPaid")} description={<Code>{out.hash}</Code>} />
        ) : out?.kind === "accepted" ? (
          <Banner status="error" title={t("demoAccepted")} description={<Code>{out.hash}</Code>} />
        ) : out?.kind === "busy" ? (
          <Banner status="warning" title={t("demoBusy")} />
        ) : out?.kind === "error" ? (
          <Banner status="warning" title={t("demoError")} description={out.message} />
        ) : null}
      </VStack>
    </Card>
  );
}
