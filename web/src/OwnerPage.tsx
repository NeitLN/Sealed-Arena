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
  CHAIN_ID,
  checkPayees,
  defaultDailyFeeCap,
  FUJI_POLICY_IDS,
  formatUsdc,
  type MandateInput,
  type PayeeWarning,
  type PolicyIds,
  parseUsdc,
  registerData,
  registerDigestFor,
  setFrozenRequest,
  setMandateRequest,
} from "@sealed-arena/shared";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Address, getAddress, type Hex, isAddress, isHex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAgentView } from "./agentView.js";
import { BrandMark } from "./BrandMark.js";
import { DemoAgents } from "./DemoAgents.js";
import { designText } from "./designText.js";
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
import { maximumLoss, ownerSteps } from "./ownerProgress.js";
import { countReasons, refusalCount, useRefusals } from "./refusals.js";
import { relayerErrorText } from "./relayerError.js";
import { SiteShell } from "./SiteShell.js";
import { RPC } from "./useArenaLive.js";

// Layout from the Astryx payment-form template: form column and a sticky summary column.
const formColBasis: CSSProperties = { flexBasis: 0 };
const summarySticky: CSSProperties = {
  flexBasis: 0,
  position: "sticky",
  top: "96px",
  alignSelf: "flex-start",
};
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
  const d = designText(lang);
  const [saved, setSaved] = useState(loadSaved);
  // Reads go to the public RPC known at build time, so the page shows the chain even when the
  // relayer is down; the relayer's /info can point to another RPC (the local network).
  const [client, setClient] = useState<PublicClient>(() =>
    chainClient(RPC, { live: true, source: "web:console" }),
  );
  const [local, setLocal] = useState(false);
  const [boot, setBoot] = useState<string>();
  // What a rule v2 owner proof is bound to: the Sealed L1 on Fuji, or the local network the
  // relayer reports.
  const [ids, setIds] = useState<PolicyIds>(FUJI_POLICY_IDS);

  const [agentInput, setAgentInput] = useState(saved.agent ?? "");
  const agent = isAddress(agentInput) ? (getAddress(agentInput) as Address) : undefined;
  const { view: readView, agent: viewedAgent, failedSince, refresh } = useAgentView(client, agent);
  const view = viewedAgent === agent ? readView : undefined;

  const [agentSig, setAgentSig] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [payeesText, setPayeesText] = useState("");
  const [perTx, setPerTx] = useState(DEFAULTS.perTx);
  const [daily, setDaily] = useState(DEFAULTS.daily);
  const [dailyFee, setDailyFee] = useState("");
  const [days, setDays] = useState(DEFAULTS.days);
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const [warnings, setWarnings] = useState<PayeeWarning[]>();
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [review, setReview] = useState<{ content: ReactNode; confirm: () => void }>();
  const reviewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review) reviewDialog.current?.showModal();
    else reviewDialog.current?.close();
  }, [review]);

  useEffect(() => {
    relayerInfo()
      .then((info) => {
        if (info.chainId !== CHAIN_ID) return setBoot("chain_mismatch");
        if (info.rpc !== RPC)
          setClient(chainClient(info.rpc, { live: true, source: "web:console" }));
        setLocal(isLocalRpc(info.rpc));
        if (info.networkId && info.blockchainId)
          setIds({
            chainId: BigInt(CHAIN_ID),
            networkId: info.networkId,
            blockchainId: info.blockchainId,
          });
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
      setDailyFee(view.feeCapSet ? formatUsdc(view.dailyFeeCap) : "");
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
    if (outcome)
      outcomeRef.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
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
      else setOutcome({ kind: "error", text: relayerErrorText(t, r, "failed"), tx: r.transaction });
    } catch (e) {
      if (isCancel(e)) setOutcome({ kind: "cancelled", text: t("passkey_cancelled") });
      else setOutcome({ kind: "error", text: t(e instanceof Error ? e.message : String(e)) });
    } finally {
      // The next action signs the nonce on chain: read it before the buttons come back.
      await refresh();
      setBusy(undefined);
    }
  };

  const version = view?.version;
  const digest = useMemo(
    () =>
      agent && saved.passkey && version
        ? registerDigestFor(version, ids, agent, saved.passkey.x, saved.passkey.y)
        : undefined,
    [agent, saved.passkey, version, ids],
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
      return registerData(agent, saved.passkey.x, saved.passkey.y, sig);
    });

  const expiry = useMemo(
    () =>
      BigInt(Math.floor(Date.now() / 1000)) +
      BigInt(Number.isInteger(Number(days)) ? Number(days) : 0) * 86_400n,
    [days],
  );

  /** Mandate from the form, or the key of the first problem. */
  const formMandate = (): MandateInput | string => {
    const list = payeesText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const check = checkPayees(list);
    if (check.errors[0]) return check.errors[0];
    let perTxCap: bigint;
    let dailyCap: bigint;
    let dailyFeeCap: bigint;
    try {
      perTxCap = parseUsdc(perTx);
      dailyCap = parseUsdc(daily);
      dailyFeeCap = dailyFee.trim() ? parseUsdc(dailyFee) : defaultDailyFeeCap(dailyCap);
    } catch {
      return "amount_invalid";
    }
    if (dailyFeeCap > dailyCap) return "fee_cap_invalid";
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 365) return "days_invalid";
    return {
      payees: list.map((a) => getAddress(a)),
      perTxCap,
      dailyCap,
      dailyFeeCap,
      expiry,
    };
  };
  const draft = formMandate();
  const draftError = typeof draft === "string" ? draft : undefined;

  const lossPreview = (m: MandateInput) => {
    const loss = maximumLoss(m.dailyCap, m.expiry, BigInt(Math.floor(Date.now() / 1000)));
    return (
      <div className="maximum-loss">
        <strong>
          {d.maximumLoss}: {formatUsdc(loss.amount)} USDC
        </strong>
        <small>
          {d.maximumFormula
            .replace("{days}", String(loss.days))
            .replace("{boundary}", String(loss.boundaryDays))}
        </small>
      </div>
    );
  };
  const mandatePreview = (m: MandateInput, target: Address, v: number) => (
    <>
      <p className="caption">{d.previewNote}</p>
      <code>{target}</code>
      <dl>
        <div>
          <dt>{d.perPayment}</dt>
          <dd>{formatUsdc(m.perTxCap)} USDC</dd>
        </div>
        <div>
          <dt>{d.perDay}</dt>
          <dd>{formatUsdc(m.dailyCap)} USDC</dd>
        </div>
        {v === 2 && (
          <div>
            <dt>{t("dailyFeeCap")}</dt>
            <dd>{formatUsdc(m.dailyFeeCap ?? 0n)} USDC</dd>
          </div>
        )}
        <div>
          <dt>{t("expires")}</dt>
          <dd>
            {new Date(Number(m.expiry) * 1000).toLocaleString(lang)} · UTC{" "}
            {new Date(Number(m.expiry) * 1000).toISOString()}
          </dd>
        </div>
      </dl>
      <p className="caption">{t("payees")}</p>
      {m.payees.map((p) => (
        <code key={p}>{p}</code>
      ))}
      {lossPreview(m)}
    </>
  );

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
      setReview({
        content: mandatePreview(draft, agent, view.version),
        confirm: () => {
          setReview(undefined);
          void act("setMandate", async () => {
            const req = setMandateRequest(view.version, ids, agent, draft, view.nonce);
            return req.data(await signWithPasskey(req.challenge, passkey.credentialId));
          });
        },
      });
    })();

  const onToggleFreeze = () => {
    if (!agent || !saved.passkey || !view) return;
    const passkey = saved.passkey;
    const freeze = !view.frozen;
    setReview({
      content: (
        <>
          <p>{freeze ? t("freeze") : t("unfreeze")}</p>
          <code>{agent}</code>
          <p>{t("freezeHelp")}</p>
        </>
      ),
      confirm: () => {
        setReview(undefined);
        void act(freeze ? "freeze" : "unfreeze", async () => {
          const req = setFrozenRequest(view.version, ids, agent, freeze, {
            ownerNonce: view.nonce,
            freezeEpoch: view.freezeEpoch,
          });
          return req.data(await signWithPasskey(req.challenge, passkey.credentialId));
        });
      },
    });
  };

  const refusals = useRefusals(view?.registered ? agent : undefined);

  const registrationBadge = !view ? null : !view.registered ? (
    <Badge variant="neutral" label={t("notRegistered")} />
  ) : ownedByMe ? (
    <Badge variant="success" label={t("registeredToYou")} />
  ) : (
    <Badge variant="warning" label={t("registeredToOther")} />
  );

  const summary = (
    <Card padding={5}>
      <div className="summary-emblem">
        <BrandMark size={32} />
        <span className="micro-label">{d.policyLabel}</span>
      </div>
      <VStack gap={4}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <Text type="large" weight="bold">
            {t("status")}
          </Text>
          {view?.registered ? (
            <Badge
              variant={view.frozen ? "warning" : "success"}
              label={view.frozen ? t("frozen") : t("active")}
            />
          ) : null}
        </HStack>
        {refusals.rows.length > 0 ? (
          <Banner
            status="warning"
            title={t("refusedSince").replace("{n}", refusalCount(refusals.rows.length))}
            description={
              <VStack gap={2}>
                {countReasons(refusals.rows).map(([reason, n]) => (
                  <Text key={reason} type="supporting">
                    {n} × {reason}
                  </Text>
                ))}
                <HStack gap={2}>
                  <Button
                    label={t("markSeen")}
                    size="sm"
                    variant="secondary"
                    onClick={refusals.markSeen}
                  />
                </HStack>
              </VStack>
            }
          />
        ) : null}
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
                {view.feeCapSet ? (
                  <Row
                    label={t("feeSpentToday")}
                    value={`${usdc(view.feeSpentToday)} / ${usdc(view.dailyFeeCap)} USDC`}
                  />
                ) : null}
                <Row label={t("perTxCap")} value={`${usdc(view.mandate.perTxCap)} USDC`} />
                <Row label={t("totalCharged")} value={`${usdc(view.totalCharged)} USDC`} />
                <Row label={t("balance")} value={`${usdc(view.balance)} USDC`} />
                <Row
                  label={t("expires")}
                  value={new Date(Number(view.mandate.expiry) * 1000).toLocaleString()}
                />
                {lossPreview(view.mandate)}
                <Row label={t("resetsAt")} value={nextReset()} />
                <Text type="supporting" color="secondary">
                  {t("resetsNote")}
                </Text>
                {view.version === 2 && !view.feeCapSet ? (
                  <Banner status="warning" title={t("feeCapNotSet")} />
                ) : null}
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
                  variant={view.frozen ? "primary" : "secondary"}
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
            {d.emptyAgent}
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

        <ol className="owner-stepper" aria-label={d.next}>
          {ownerSteps({
            passkey: !!saved.passkey,
            agent: !!agent,
            linked: ownedByMe,
            mandate:
              !!view?.mandate.payees.length &&
              view.mandate.expiry > BigInt(Math.floor(Date.now() / 1000)) &&
              (view.version === 1 || view.feeCapSet),
          }).map((state, index) => (
            <li
              key={d.consoleSteps[index]}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="step-number" aria-hidden="true">
                {state === "done" ? "✓" : index + 1}
              </span>
              <span>
                {d.consoleSteps[index]}
                <small>{d.stepStates[state]}</small>
              </span>
            </li>
          ))}
        </ol>
        <dialog
          ref={reviewDialog}
          className="sign-review sign-preview"
          aria-labelledby="review-title"
          onCancel={() => setReview(undefined)}
        >
          <h2 id="review-title">{d.signPreview}</h2>
          {review?.content}
          <div className="hero-actions">
            <Button label={d.confirmSign} variant="primary" onClick={() => review?.confirm()} />
            <Button label={d.cancelSign} variant="secondary" onClick={() => setReview(undefined)} />
          </div>
        </dialog>
        {boot ? <Banner status="warning" title={t(boot)} /> : null}
        <div ref={outcomeRef} aria-live="polite">
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

        <section className="console-passkey">
          <VStack gap={3}>
            <Heading level={2}>{t("passkeySection")}</Heading>
            <Text type="supporting" color="secondary">
              {t("passkeyHelp")}
            </Text>
            {!saved.passkey && (
              <section className="sign-preview">
                <p className="micro-label">{d.signPreview}</p>
                <p>{d.createPreview}</p>
              </section>
            )}
            {saved.passkey ? (
              <VStack gap={2}>
                <strong>{d.useSaved}</strong>
                <p className="caption">{d.savedNote}</p>
                <HStack gap={2} vAlign="center" wrap="wrap">
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
        </section>

        <DemoAgents
          lang={lang}
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
        >
          <Stack direction={isMobile ? "vertical" : "horizontal"} gap={8} vAlign="start">
            <StackItem size="fill" style={isMobile ? undefined : formColBasis}>
              <VStack gap={8}>
                {/* 2. Agent */}
                <VStack gap={3}>
                  <HStack gap={2} hAlign="between" vAlign="center">
                    <Heading level={2}>{t("agentSection")}</Heading>
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
                    <Heading level={2}>{t("mandateSection")}</Heading>
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
                    <Grid columns={isMobile ? 1 : view?.version === 2 ? 4 : 3} gap={3}>
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
                      {view?.version === 2 ? (
                        <TextInput
                          label={t("dailyFeeCap")}
                          value={dailyFee}
                          onChange={setDailyFee}
                          placeholder={
                            typeof draft !== "string"
                              ? formatUsdc(defaultDailyFeeCap(draft.dailyCap))
                              : ""
                          }
                          inputMode="decimal"
                        />
                      ) : null}
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
                      <Banner
                        key={`u-${a}`}
                        status="warning"
                        title={`${a} ${t("code_unchecked")}`}
                      />
                    ))}
                    {warnings?.map((w) => (
                      <Banner
                        key={w.address}
                        status="warning"
                        title={`${w.address} ${t(w.reason)}`}
                      />
                    ))}
                    <section className="sign-preview" aria-label={d.signPreview}>
                      <p className="micro-label">{d.signPreview}</p>
                      {typeof draft !== "string" &&
                        agent &&
                        view &&
                        mandatePreview(draft, agent, view.version)}
                    </section>
                    <HStack gap={2}>
                      <Button
                        label={
                          warnings || unchecked.length > 0 ? t("signAnyway") : t("signMandate")
                        }
                        variant="primary"
                        isLoading={busy === "setMandate"}
                        isDisabled={!!busy || !!draftError}
                        onClick={onSetMandate}
                      />
                    </HStack>
                  </VStack>
                ) : (
                  <section className="pending-step">
                    <h2>{t("mandateSection")}</h2>
                    <p>{d.pendingMandate}</p>
                  </section>
                )}
              </VStack>
            </StackItem>

            <StackItem size="fill" style={isMobile ? undefined : summarySticky}>
              {summary}
            </StackItem>
          </Stack>
        </DemoAgents>
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
