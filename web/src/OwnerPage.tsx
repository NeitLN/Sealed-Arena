import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack, Stack, StackItem, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  agentPolicyAbi,
  CHAIN_ID,
  checkPayees,
  formatUsdc,
  freezeChallenge,
  type Mandate,
  type PayeeWarning,
  parseUsdc,
  registerDigest,
  setMandateChallenge,
  unfreezeChallenge,
} from "@sealed-arena/shared";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hex,
  isAddress,
  isHex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useI18n } from "./i18n.js";
import {
  type AgentView,
  chainClient,
  createPasskey,
  isLocalRpc,
  loadSaved,
  type Passkey,
  type RelayResult,
  readAgent,
  relay,
  relayerInfo,
  save,
  signWithPasskey,
  withCode,
} from "./owner.js";
import { SiteShell } from "./SiteShell.js";

// Layout from the Astryx payment-form template: form column and a sticky summary column.
const formColBasis: CSSProperties = { flexBasis: 0 };
const summarySticky: CSSProperties = {
  flexBasis: 0,
  position: "sticky",
  top: "var(--spacing-4)",
  alignSelf: "flex-start",
};
const summaryMobileOrder: CSSProperties = { order: -1 };
const mono: CSSProperties = {
  fontFamily: "var(--font-family-mono, monospace)",
  wordBreak: "break-all",
};

/** USDC for display: at most 6 decimals, "≈" when digits were dropped. */
function usdc(wei: bigint): string {
  const step = 10n ** 12n;
  const kept = wei - (wei % step);
  return `${kept === wei ? "" : "≈"}${formatUsdc(kept)}`;
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

/** The next 00:00 UTC, shown in the viewer's local time. */
function nextReset(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toLocaleString();
}

type Outcome = { kind: "ok" | "error"; text: string; tx?: Hex | undefined } | undefined;

export default function OwnerPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang, t } = useI18n();
  const [saved, setSaved] = useState(loadSaved);
  const [client, setClient] = useState<PublicClient>();
  const [local, setLocal] = useState(false);
  const [boot, setBoot] = useState<string>();

  const [agentInput, setAgentInput] = useState(saved.agent ?? "");
  const agent = isAddress(agentInput) ? (getAddress(agentInput) as Address) : undefined;
  const [view, setView] = useState<AgentView>();

  const [agentSig, setAgentSig] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [payeesText, setPayeesText] = useState("");
  const [perTx, setPerTx] = useState("1");
  const [daily, setDaily] = useState("3");
  const [days, setDays] = useState("7");
  const [warnings, setWarnings] = useState<PayeeWarning[]>();
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    relayerInfo()
      .then((info) => {
        setClient(chainClient(info.rpc));
        setLocal(isLocalRpc(info.rpc));
      })
      .catch(() => setBoot("relayer_down"));
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !agent) return setView(undefined);
    try {
      const v = await readAgent(client, agent);
      setView(v);
      if (v.mandate.payees.length > 0 && payeesText === "")
        setPayeesText(v.mandate.payees.join("\n"));
    } catch {
      setView(undefined);
    }
  }, [client, agent, payeesText]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const remember = (s: typeof saved) => {
    setSaved(s);
    save(s);
  };

  const ownedByMe =
    !!view?.registered &&
    !!saved.passkey &&
    view.ownerX.toLowerCase() === saved.passkey.x.toLowerCase() &&
    view.ownerY.toLowerCase() === saved.passkey.y.toLowerCase();

  /** Runs one action: passkey prompt, then the relayer, then shows what the chain said. */
  const act = async (name: string, build: () => Promise<Hex>) => {
    setBusy(name);
    setOutcome(undefined);
    try {
      const r: RelayResult = await relay(await build());
      if (r.ok) setOutcome({ kind: "ok", text: t("done"), tx: r.transaction });
      else setOutcome({ kind: "error", text: r.reason ?? t(r.error), tx: r.transaction });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setOutcome({ kind: "error", text: t(m) });
    } finally {
      setBusy(undefined);
      void refresh();
    }
  };

  const digest = useMemo(
    () =>
      agent && saved.passkey
        ? registerDigest(BigInt(CHAIN_ID), agent, saved.passkey.x, saved.passkey.y)
        : undefined,
    [agent, saved.passkey],
  );

  const onCreatePasskey = () =>
    void (async () => {
      setOutcome(undefined);
      try {
        const passkey: Passkey = await createPasskey();
        remember({ ...saved, passkey });
      } catch (e) {
        setOutcome({
          kind: "error",
          text: t(e instanceof Error ? e.message : "passkey_unsupported"),
        });
      }
    })();

  const onRegister = () =>
    void act("register", async () => {
      if (!agent || !saved.passkey || !digest) throw new Error("no_passkey");
      let sig: Hex;
      if (local && agentKey) {
        if (!isHex(agentKey) || agentKey.length !== 66) throw new Error("key_invalid");
        const acct = privateKeyToAccount(agentKey);
        if (acct.address !== agent) throw new Error("key_invalid");
        sig = await acct.sign({ hash: digest });
      } else {
        if (!isHex(agentSig) || agentSig.length !== 132) throw new Error("signature_invalid");
        sig = agentSig;
      }
      return encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "register",
        args: [agent, saved.passkey.x, saved.passkey.y, sig],
      });
    });

  /** Mandate from the form, or the key of the first problem. */
  const formMandate = (): Mandate | string => {
    const list = payeesText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const check = checkPayees(list);
    if (check.errors[0]) return check.errors[0];
    let perTxCap: bigint;
    let dailyCap: bigint;
    try {
      perTxCap = parseUsdc(perTx);
      dailyCap = parseUsdc(daily);
    } catch {
      return "amount_invalid";
    }
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 365) return "days_invalid";
    return {
      payees: list.map((a) => getAddress(a)),
      perTxCap,
      dailyCap,
      expiry: BigInt(Math.floor(Date.now() / 1000) + d * 86_400),
    };
  };
  const draft = formMandate();
  const draftError = typeof draft === "string" ? draft : undefined;

  const onSetMandate = () =>
    void (async () => {
      if (typeof draft === "string" || !agent || !saved.passkey || !client || !view) return;
      if (!warnings) {
        const found = checkPayees(draft.payees, await withCode(client, [...draft.payees])).warnings;
        if (found.length > 0) return setWarnings(found);
      }
      setWarnings(undefined);
      const passkey = saved.passkey;
      await act("setMandate", async () => {
        const nonce = view.nonce;
        const auth = await signWithPasskey(
          setMandateChallenge(BigInt(CHAIN_ID), agent, draft, nonce),
          passkey.credentialId,
        );
        return encodeFunctionData({
          abi: agentPolicyAbi,
          functionName: "setMandate",
          args: [agent, draft, nonce, auth],
        });
      });
    })();

  const onToggleFreeze = () => {
    if (!agent || !saved.passkey || !view) return;
    const passkey = saved.passkey;
    const freeze = !view.frozen;
    void act(freeze ? "freeze" : "unfreeze", async () => {
      const challenge = (freeze ? freezeChallenge : unfreezeChallenge)(
        BigInt(CHAIN_ID),
        agent,
        view.nonce,
      );
      const auth = await signWithPasskey(challenge, passkey.credentialId);
      return encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: freeze ? "freeze" : "unfreeze",
        args: [agent, view.nonce, auth],
      });
    });
  };

  const registrationBadge = !view ? null : !view.registered ? (
    <Badge variant="neutral" label={t("notRegistered")} />
  ) : ownedByMe ? (
    <Badge variant="success" label={t("registeredToYou")} />
  ) : (
    <Badge variant="warning" label={t("registeredToOther")} />
  );

  const summary = (
    <Card padding={5}>
      <VStack gap={4}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <Text type="large" weight="bold">
            {t("status")}
          </Text>
          {view?.registered ? (
            <Badge
              variant={view.frozen ? "error" : "success"}
              label={view.frozen ? t("frozen") : t("active")}
            />
          ) : null}
        </HStack>
        {view && agent ? (
          <VStack gap={3}>
            <Text type="supporting" color="secondary" style={mono}>
              {agent}
            </Text>
            {view.mandate.payees.length === 0 ? (
              <Text type="body" color="secondary">
                {t("noMandate")}
              </Text>
            ) : (
              <VStack gap={2}>
                <Row
                  label={t("spentToday")}
                  value={`${usdc(view.spentToday)} / ${usdc(view.mandate.dailyCap)} USDC`}
                />
                <Row label={t("perTxCap")} value={`${usdc(view.mandate.perTxCap)} USDC`} />
                <Row label={t("totalCharged")} value={`${usdc(view.totalCharged)} USDC`} />
                <Row label={t("balance")} value={`${usdc(view.balance)} USDC`} />
                <Row
                  label={t("expires")}
                  value={new Date(Number(view.mandate.expiry) * 1000).toLocaleString()}
                />
                <Row label={t("resetsAt")} value={nextReset()} />
                <Text type="supporting" color="secondary">
                  {t("resetsNote")}
                </Text>
                <Divider />
                <Text type="supporting" weight="bold">
                  {t("payees")}
                </Text>
                {view.mandate.payees.map((p) => (
                  <Text key={p} type="supporting" style={mono}>
                    {p}
                  </Text>
                ))}
              </VStack>
            )}
            {view.registered && saved.passkey ? (
              <VStack gap={2}>
                <Divider />
                {ownedByMe ? null : <Banner status="warning" title={t("notOwnerNote")} />}
                <Button
                  label={view.frozen ? t("unfreeze") : t("freeze")}
                  variant={view.frozen ? "primary" : "destructive"}
                  width="100%"
                  isLoading={busy === "freeze" || busy === "unfreeze"}
                  isDisabled={!!busy}
                  onClick={onToggleFreeze}
                />
                <Text type="supporting" color="secondary">
                  {t("freezeHelp")}
                </Text>
              </VStack>
            ) : null}
          </VStack>
        ) : (
          <Text type="body" color="secondary">
            {t("agentHelp")}
          </Text>
        )}
      </VStack>
    </Card>
  );

  return (
    <SiteShell lang={lang} setLang={setLang} current="owner">
      <VStack gap={5}>
        {/* Page header */}
        <Heading level={1} type="display-2">
          {t("title")}
        </Heading>
        <Text type="body" color="secondary">
          {t("intro")}
        </Text>

        {boot ? <Banner status="error" title={t(boot)} /> : null}
        {outcome ? (
          <Banner
            status={outcome.kind === "ok" ? "success" : "error"}
            title={outcome.kind === "ok" ? t("done") : `${t("failed")}: ${outcome.text}`}
            description={outcome.tx ? `${t("tx")} ${outcome.tx}` : undefined}
            isDismissable
            onDismiss={() => setOutcome(undefined)}
          />
        ) : null}
        {busy ? <Banner status="info" title={t("working")} /> : null}

        <Stack direction={isMobile ? "vertical" : "horizontal"} gap={8} vAlign="start">
          <StackItem size="fill" style={isMobile ? undefined : formColBasis}>
            <VStack gap={8}>
              {/* 1. Passkey */}
              <VStack gap={3}>
                <Text type="large" weight="bold">
                  {t("passkeySection")}
                </Text>
                <Text type="supporting" color="secondary">
                  {t("passkeyHelp")}
                </Text>
                {saved.passkey ? (
                  <VStack gap={2}>
                    <HStack gap={2} vAlign="center">
                      <Badge variant="success" label={t("passkeyReady")} />
                      <Text type="supporting" color="secondary" style={mono}>
                        {t("publicKey")} {short(saved.passkey.x)}
                      </Text>
                    </HStack>
                    <HStack gap={2}>
                      <Button
                        label={t("forgetPasskey")}
                        variant="ghost"
                        size="sm"
                        onClick={() => remember({ ...(saved.agent ? { agent: saved.agent } : {}) })}
                      />
                    </HStack>
                  </VStack>
                ) : (
                  <HStack gap={3} vAlign="center" wrap="wrap">
                    <Button
                      label={t("createPasskey")}
                      variant="primary"
                      onClick={onCreatePasskey}
                    />
                    <Text type="supporting" color="secondary">
                      {t("passkeyMissing")}
                    </Text>
                  </HStack>
                )}
              </VStack>

              {/* 2. Agent */}
              <VStack gap={3}>
                <HStack gap={2} hAlign="between" vAlign="center">
                  <Text type="large" weight="bold">
                    {t("agentSection")}
                  </Text>
                  {registrationBadge}
                </HStack>
                <TextInput
                  label={t("agentAddress")}
                  description={t("agentHelp")}
                  value={agentInput}
                  onChange={(v) => {
                    setAgentInput(v.trim());
                    if (isAddress(v.trim())) remember({ ...saved, agent: v.trim() });
                  }}
                  placeholder="0x…"
                  autoComplete="off"
                  hasSpellCheck={false}
                  {...(agentInput && !agent
                    ? { status: { type: "error" as const, message: t("address_invalid") } }
                    : {})}
                />
                {agent && view && !view.registered ? (
                  <VStack gap={3}>
                    {digest ? (
                      <VStack gap={1}>
                        <Text type="supporting" color="secondary">
                          {t("registerHelp")}
                        </Text>
                        <Text type="supporting" style={mono}>
                          {digest}
                        </Text>
                      </VStack>
                    ) : (
                      <Text type="supporting" color="secondary">
                        {t("no_passkey")}
                      </Text>
                    )}
                    <TextInput
                      label={t("agentSignature")}
                      value={agentSig}
                      onChange={(v) => setAgentSig(v.trim())}
                      placeholder="0x…"
                      autoComplete="off"
                      hasSpellCheck={false}
                    />
                    {local ? (
                      <TextInput
                        type="password"
                        label={t("agentPrivateKey")}
                        description={t("privateKeyWarning")}
                        value={agentKey}
                        onChange={(v) => setAgentKey(v.trim())}
                        autoComplete="off"
                      />
                    ) : null}
                    <HStack gap={2}>
                      <Button
                        label={t("register")}
                        variant="primary"
                        isLoading={busy === "register"}
                        isDisabled={!saved.passkey || !!busy || (!agentSig && !agentKey)}
                        onClick={onRegister}
                      />
                    </HStack>
                  </VStack>
                ) : null}
              </VStack>

              {/* 3. Mandate */}
              {ownedByMe ? (
                <VStack gap={3}>
                  <Text type="large" weight="bold">
                    {t("mandateSection")}
                  </Text>
                  <TextArea
                    label={t("payees")}
                    description={t("payeesHelp")}
                    value={payeesText}
                    onChange={(v: string) => {
                      setPayeesText(v);
                      setWarnings(undefined);
                    }}
                    placeholder={"0x…\n0x…"}
                  />
                  <Grid columns={isMobile ? 1 : 3} gap={3}>
                    <TextInput
                      label={t("perTxCap")}
                      value={perTx}
                      onChange={setPerTx}
                      inputMode="decimal"
                    />
                    <TextInput
                      label={t("dailyCap")}
                      value={daily}
                      onChange={setDaily}
                      inputMode="decimal"
                    />
                    <TextInput
                      label={t("validDays")}
                      value={days}
                      onChange={setDays}
                      inputMode="numeric"
                    />
                  </Grid>
                  {draftError && payeesText ? (
                    <Banner status="error" title={t(draftError)} />
                  ) : null}
                  {typeof draft !== "string" && draft.perTxCap > draft.dailyCap ? (
                    <Banner status="warning" title={t("capWarning")} />
                  ) : null}
                  {warnings?.map((w) => (
                    <Banner
                      key={w.address}
                      status="warning"
                      title={`${w.address} ${t(w.reason)}`}
                    />
                  ))}
                  <HStack gap={2}>
                    <Button
                      label={warnings ? t("signAnyway") : t("signMandate")}
                      variant="primary"
                      isLoading={busy === "setMandate"}
                      isDisabled={!!busy || !!draftError}
                      onClick={onSetMandate}
                    />
                  </HStack>
                </VStack>
              ) : null}
            </VStack>
          </StackItem>

          <StackItem size="fill" style={isMobile ? summaryMobileOrder : summarySticky}>
            {summary}
          </StackItem>
        </Stack>
      </VStack>
    </SiteShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="supporting" weight="bold">
        {value}
      </Text>
    </HStack>
  );
}
