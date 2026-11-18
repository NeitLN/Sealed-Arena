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
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
import { useAgentView } from "./agentView.js";
import { DemoAgents } from "./DemoAgents.js";
import { useI18n } from "./i18n.js";
import {
  chainClient,
  createPasskey,
  isLocalRpc,
  loadSaved,
  type Passkey,
  type RelayResult,
  relay,
  relayerInfo,
  save,
  signWithPasskey,
  withCode,
} from "./owner.js";
import { SiteShell } from "./SiteShell.js";
import { RPC } from "./useArenaLive.js";

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

/**
 * What happened to an action. `refused`: the chain (or the precompile) said no, with its reason.
 * `cancelled`: the owner closed the passkey prompt. `error`: the action did not get through.
 */
type Outcome =
  | { kind: "ok" | "refused" | "cancelled" | "error"; text: string; tx?: Hex | undefined }
  | undefined;

/** The browser's WebAuthn errors when the prompt is closed or times out. */
const isCancel = (e: unknown) =>
  (e instanceof Error && e.message === "passkey_cancelled") ||
  (typeof DOMException !== "undefined" &&
    e instanceof DOMException &&
    (e.name === "NotAllowedError" || e.name === "AbortError"));

/** Mandate form defaults: small enough for a demo agent's 0.05 USDC, so "budget exceeded" shows. */
const DEFAULTS = { perTx: "0.02", daily: "0.03", days: "7" };

export default function OwnerPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { lang, setLang, t } = useI18n();
  const [saved, setSaved] = useState(loadSaved);
  // Reads go to the public RPC known at build time, so the page shows the chain even when the
  // relayer is down; the relayer's /info can point to another RPC (the local network).
  const [client, setClient] = useState<PublicClient>(() => chainClient(RPC, { live: true }));
  const [local, setLocal] = useState(false);
  const [boot, setBoot] = useState<string>();

  const [agentInput, setAgentInput] = useState(saved.agent ?? "");
  const agent = isAddress(agentInput) ? (getAddress(agentInput) as Address) : undefined;
  const { view, failedSince, refresh } = useAgentView(client, agent);

  const [agentSig, setAgentSig] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [payeesText, setPayeesText] = useState("");
  const [perTx, setPerTx] = useState(DEFAULTS.perTx);
  const [daily, setDaily] = useState(DEFAULTS.daily);
  const [days, setDays] = useState(DEFAULTS.days);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const [warnings, setWarnings] = useState<PayeeWarning[]>();
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    relayerInfo()
      .then((info) => {
        if (info.chainId !== CHAIN_ID) return setBoot("chain_mismatch");
        if (info.rpc !== RPC) setClient(chainClient(info.rpc, { live: true }));
        setLocal(isLocalRpc(info.rpc));
      })
      .catch(() => setBoot("relayer_down"));
  }, []);

  // The form starts from the mandate on chain, once per agent; later reads never overwrite typing.
  const prefilledFor = useRef<Address | undefined>(undefined);
  useEffect(() => {
    if (!agent || !view || prefilledFor.current === agent) return;
    prefilledFor.current = agent;
    const m = view.mandate;
    if (m.payees.length > 0) {
      setPayeesText(m.payees.join("\n"));
      setPerTx(formatUsdc(m.perTxCap));
      setDaily(formatUsdc(m.dailyCap));
      const left = Math.ceil((Number(m.expiry) - Date.now() / 1000) / 86_400);
      setDays(String(Math.min(365, Math.max(1, left))));
    } else {
      setPayeesText("");
      setPerTx(DEFAULTS.perTx);
      setDaily(DEFAULTS.daily);
      setDays(DEFAULTS.days);
    }
  }, [agent, view]);

  useEffect(() => {
    if (outcome) outcomeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [outcome]);

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
      else if (r.reason) setOutcome({ kind: "refused", text: r.reason, tx: r.transaction });
      else setOutcome({ kind: "error", text: t(r.error), tx: r.transaction });
    } catch (e) {
      if (isCancel(e)) setOutcome({ kind: "cancelled", text: t("passkey_cancelled") });
      else setOutcome({ kind: "error", text: t(e instanceof Error ? e.message : String(e)) });
    } finally {
      // The next action signs the nonce on chain: read it before the buttons come back.
      await refresh();
      setBusy(undefined);
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
        setOutcome(
          isCancel(e)
            ? { kind: "cancelled", text: t("passkey_cancelled") }
            : { kind: "error", text: t(e instanceof Error ? e.message : "passkey_unsupported") },
        );
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
        const codes = await withCode(client, [...draft.payees]);
        const found = checkPayees(draft.payees, codes.withCode).warnings;
        setUnchecked(codes.unchecked);
        if (found.length > 0 || codes.unchecked.length > 0) return setWarnings(found);
      }
      setWarnings(undefined);
      setUnchecked([]);
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
        <div ref={outcomeRef}>
          {outcome ? (
            <Banner
              status={
                outcome.kind === "ok"
                  ? "success"
                  : outcome.kind === "cancelled"
                    ? "info"
                    : outcome.kind === "refused"
                      ? "warning"
                      : "error"
              }
              title={
                outcome.kind === "ok"
                  ? t("done")
                  : outcome.kind === "refused"
                    ? `${t("failed")}: ${outcome.text}`
                    : outcome.text
              }
              description={outcome.tx ? `${t("tx")} ${outcome.tx}` : undefined}
              isDismissable
              onDismiss={() => setOutcome(undefined)}
            />
          ) : null}
        </div>
        {failedSince && view ? (
          <Banner
            status="warning"
            title={t("staleView").replace("{time}", new Date(failedSince).toLocaleTimeString())}
          />
        ) : null}
        {busy ? <Banner status="info" title={t("working")} /> : null}

        {/* 1. Passkey: needed for everything below, the demo agent included */}
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
                  onClick={() => {
                    if (window.confirm(t("forgetConfirm")))
                      remember({ ...(saved.agent ? { agent: saved.agent } : {}) });
                  }}
                />
              </HStack>
            </VStack>
          ) : (
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Button label={t("createPasskey")} variant="primary" onClick={onCreatePasskey} />
              <Text type="supporting" color="secondary">
                {t("passkeyMissing")}
              </Text>
            </HStack>
          )}
        </VStack>

        <DemoAgents
          t={t}
          client={client}
          passkey={saved.passkey}
          current={agent}
          ownedByMe={ownedByMe}
          payee={view?.mandate.payees[0] as Address | undefined}
          onClaimed={(a) => {
            setAgentInput(a);
            remember({ ...saved, agent: a });
          }}
          onTried={() => void refresh()}
        />

        <Stack direction={isMobile ? "vertical" : "horizontal"} gap={8} vAlign="start">
          <StackItem size="fill" style={isMobile ? undefined : formColBasis}>
            <VStack gap={8}>
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
                      label={t("perTxCapFee")}
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
                  {unchecked.map((a) => (
                    <Banner key={`u-${a}`} status="warning" title={`${a} ${t("code_unchecked")}`} />
                  ))}
                  {warnings?.map((w) => (
                    <Banner
                      key={w.address}
                      status="warning"
                      title={`${w.address} ${t(w.reason)}`}
                    />
                  ))}
                  <HStack gap={2}>
                    <Button
                      label={warnings || unchecked.length > 0 ? t("signAnyway") : t("signMandate")}
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
