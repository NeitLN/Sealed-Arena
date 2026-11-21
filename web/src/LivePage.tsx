import { useEffect, useRef, useState } from "react";
import { ArenaQr } from "./ArenaQr.js";
import { ARENA } from "./arena.config.js";
import { designText } from "./designText.js";
import { shortAddress, usdcApprox } from "./format.js";
import { type Lang, useI18n } from "./i18n.js";
import { type LiveAttempt, type ReceiptState, useLiveMonitor } from "./liveMonitor.js";
import { SiteShell } from "./SiteShell.js";
import { StatusPill } from "./StatusPill.js";
import "./operations.css";
import "./live-feed.css";

const locale = (lang: Lang) => (lang === "vi" ? "vi-VN" : "en-GB");

function relativeTime(elapsedMs: number, lang: Lang) {
  const minutes = Math.trunc(elapsedMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (Math.abs(minutes) < 1) return formatter.format(0, "second");
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.trunc(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.trunc(hours / 24), "day");
}

function AttemptRow({
  row,
  receipt,
  now,
  lang,
}: {
  row: LiveAttempt;
  receipt?: ReceiptState | undefined;
  now: number;
  lang: Lang;
}) {
  const t = designText(lang).live;
  const refused = row.result === "rejected";
  const state = receipt?.kind;
  const blockLabel = refused
    ? t.notIncluded
    : state === "included"
      ? t.included
      : state === "reverted"
        ? t.reverted
        : state === "pending"
          ? t.pending
          : t.unknown;
  const date = new Date(row.ts);
  const validDate = Number.isFinite(date.getTime());
  const fullTime = validDate
    ? date.toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "medium" })
    : t.noData;
  const amount =
    typeof row.value === "string" && /^\d{1,78}$/.test(row.value)
      ? usdcApprox(BigInt(row.value))
      : undefined;
  const to = (receipt?.kind === "included" ? receipt.to : row.to) || undefined;
  return (
    <tr>
      <td className="attempt-clock">
        <time dateTime={validDate ? date.toISOString() : undefined} title={fullTime}>
          {validDate
            ? date.toLocaleString(locale(lang), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : t.noData}
        </time>
        {validDate && <span className="attempt-age">{relativeTime(row.ts - now, lang)}</span>}
      </td>
      <td className="attempt-payment">
        <strong>{amount === undefined ? "—" : `${amount} USDC`}</strong>
        <code title={to}>{to ? shortAddress(to) : "—"}</code>
      </td>
      <td className="attempt-node">
        <StatusPill state={refused ? "refused" : "neutral"}>
          {refused ? t.refused : t.accepted}
        </StatusPill>
        {row.reason && <code>{row.reason}</code>}
      </td>
      <td className="attempt-receipt" data-refused={refused}>
        <StatusPill state={refused ? "neutral" : state === "included" ? "passed" : "caution"}>
          {blockLabel}
        </StatusPill>
        {receipt && "block" in receipt && <code>#{receipt.block.toString()}</code>}
        {row.hash && <code title={row.hash}>{shortAddress(row.hash)}</code>}
      </td>
    </tr>
  );
}

export default function LivePage() {
  const { lang, setLang } = useI18n();
  const t = designText(lang).live;
  const { chain, gateway, receipts } = useLiveMonitor();
  const screen = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const toggle = async () => {
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setFull(false);
    } else {
      setFull(true);
      // Browsers without the Fullscreen API retain the viewport-filling presentation.
      await screen.current?.requestFullscreen?.().catch(() => undefined);
    }
  };
  useEffect(() => {
    const onFull = () => setFull(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    document.addEventListener("fullscreenchange", onFull);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFull);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const time = (at: number) =>
    new Date(at).toLocaleString(locale(lang), { dateStyle: "short", timeStyle: "medium" });
  const balance = chain.data ? usdcApprox(chain.data.agent.balance) : undefined;
  const head = chain.data?.head.toString();
  const displayedAt = Date.now();
  function sourceStatus(snapshot: { failed: boolean; at?: number }) {
    if (snapshot.failed && !snapshot.at)
      return lang === "vi" ? "Chưa kết nối được" : "Connection unavailable";
    if (snapshot.failed) return t.stale;
    return snapshot.at ? `${t.updated}: ${time(snapshot.at)}` : t.waiting;
  }
  return (
    <SiteShell current="live" lang={lang} setLang={setLang}>
      <div ref={screen} className={`live-display${full ? " is-full" : ""}`}>
        <header className="live-heading">
          <div>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <a className="landing-button button-primary live-mobile-open" href="/arena">
            {t.open} →
          </a>
          <button
            className="landing-button button-secondary live-full-toggle"
            type="button"
            onClick={() => void toggle()}
          >
            {full ? t.exit : t.fullscreen}
          </button>
        </header>
        <div className="live-overview">
          <section className="live-agent" aria-label={t.publicKey}>
            <dl className="live-readings">
              <div>
                <dt>{t.balance}</dt>
                <dd>
                  {balance !== undefined ? (
                    <>
                      <span className="reading-value" key={balance}>
                        {balance}
                      </span>{" "}
                      <small>USDC</small>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>{t.latestBlock}</dt>
                <dd>
                  {head ? (
                    <span className="reading-value" key={head}>
                      {head}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <div className="live-identity">
              <div>
                <p className="micro-label">{t.publicKey}</p>
                <code>{ARENA.agent}</code>
              </div>
              <a className="text-link" href="/arena">
                {t.open} →
              </a>
            </div>
          </section>
          <aside className="live-join">
            <a href={ARENA.url}>
              <ArenaQr url={ARENA.url} label={t.qrAlt} />
            </a>
            <div className="live-qr-copy">
              <strong>{t.scan}</strong>
              <a href={ARENA.url}>{ARENA.url}</a>
            </div>
          </aside>
        </div>
        <section className="source-status">
          <h2>{lang === "vi" ? "Trạng thái nguồn dữ liệu" : "Data source status"}</h2>
          <div className="live-sources" aria-live="polite">
            {[
              { label: t.rpc, snapshot: chain },
              { label: t.gateway, snapshot: gateway },
            ].map(({ label, snapshot }) => (
              <div className="live-source" key={label}>
                <strong>{label}</strong>
                <StatusPill
                  state={snapshot.failed ? "caution" : snapshot.at ? "passed" : "neutral"}
                >
                  {sourceStatus(snapshot)}
                </StatusPill>
              </div>
            ))}
          </div>
        </section>
        <section className="live-feed" aria-label={t.recent}>
          <h2>{t.recent}</h2>
          {!gateway.data ? (
            <p className="live-empty">{gateway.failed ? t.noData : t.waiting}</p>
          ) : gateway.data.length === 0 ? (
            <p className="live-empty">{t.empty}</p>
          ) : (
            <table className="monitor-feed" aria-label={t.recent}>
              <thead>
                <tr>
                  <th scope="col">{lang === "vi" ? "Thời điểm" : "Time"}</th>
                  <th scope="col">
                    {lang === "vi" ? "Khoản thanh toán yêu cầu" : "Requested payment"}
                  </th>
                  <th scope="col">{lang === "vi" ? "Phản hồi của node" : "Node response"}</th>
                  <th scope="col">{lang === "vi" ? "Biên nhận trên chain" : "On-chain receipt"}</th>
                </tr>
              </thead>
              <tbody>
                {gateway.data.map((row, index) => (
                  <AttemptRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: Consecutive identical gateway entries have no independent ID.
                    key={`${row.ts}-${row.hash}-${index}`}
                    row={row}
                    receipt={receipts[row.hash]}
                    now={displayedAt}
                    lang={lang}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="caption live-note">{t.pendingNote}</p>
      </div>
    </SiteShell>
  );
}
