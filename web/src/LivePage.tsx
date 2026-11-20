import { useEffect, useRef, useState } from "react";
import { ArenaQr } from "./ArenaQr.js";
import { ARENA } from "./arena.config.js";
import { designText } from "./designText.js";
import { usdcApprox } from "./format.js";
import { useI18n } from "./i18n.js";
import { useLiveMonitor } from "./liveMonitor.js";
import { SiteShell } from "./SiteShell.js";
import { StatusPill } from "./StatusPill.js";

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
  const time = (at: number | undefined) => (at ? new Date(at).toLocaleTimeString(lang) : t.noData);
  return (
    <SiteShell current="live" lang={lang} setLang={setLang}>
      <div ref={screen} className={`live-display${full ? " is-full" : ""}`}>
        <header className="live-heading">
          <div>
            <p className="micro-label">{t.nav}</p>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <button
            className="landing-button button-secondary"
            type="button"
            onClick={() => void toggle()}
          >
            {full ? t.exit : t.fullscreen}
          </button>
        </header>
        <div className="live-overview">
          <section className="live-agent">
            <p className="micro-label">{t.publicKey}</p>
            <code>{ARENA.agent}</code>
            <dl>
              <div>
                <dt>{t.balance}</dt>
                <dd>{chain.data ? `${usdcApprox(chain.data.agent.balance)} USDC` : "—"}</dd>
              </div>
              <div>
                <dt>{t.latestBlock}</dt>
                <dd>{chain.data?.head.toString() ?? "—"}</dd>
              </div>
            </dl>
            <a className="text-link" href="/arena">
              {t.open} →
            </a>
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
        <div className="live-sources" aria-live="polite">
          {[
            { label: t.rpc, snapshot: chain },
            { label: t.gateway, snapshot: gateway },
          ].map(({ label, snapshot }) => (
            <div className="live-source" key={label}>
              <strong>{label}</strong>
              <StatusPill state={snapshot.failed ? "caution" : snapshot.at ? "passed" : "neutral"}>
                {snapshot.failed
                  ? t.stale
                  : snapshot.at
                    ? `${t.updated}: ${time(snapshot.at)}`
                    : t.waiting}
              </StatusPill>
            </div>
          ))}
        </div>
        <section aria-label={t.recent}>
          <div className="live-lanes" aria-hidden="true">
            {t.lanes.map((lane, i) => (
              <span key={lane}>
                {lane}
                {i < 3 && <b>→</b>}
              </span>
            ))}
          </div>
          {!gateway.data ? (
            <p className="live-empty">{gateway.failed ? t.noData : t.waiting}</p>
          ) : gateway.data.length === 0 ? (
            <p className="live-empty">{t.empty}</p>
          ) : (
            <ol className="live-attempts">
              {gateway.data.map((row, index) => {
                const refused = row.result === "rejected";
                const receipt = receipts[row.hash];
                const included = receipt?.kind === "included";
                const mined = receipt && "block" in receipt;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Gateway rows have no IDs; disambiguate identical stateless observations.
                  <li key={`${row.ts}-${row.hash}-${index}`}>
                    <div className="live-cell">
                      <small>{t.lanes[0]}</small>
                      <time dateTime={new Date(row.ts).toISOString()}>{time(row.ts)}</time>
                      <code>{row.from}</code>
                    </div>
                    <div className="live-cell">
                      <small>{t.lanes[1]}</small>
                      <StatusPill state={refused ? "refused" : "neutral"}>
                        {refused ? t.refused : t.accepted}
                      </StatusPill>
                      {row.reason && <code>{row.reason}</code>}
                    </div>
                    <div className="live-cell">
                      <small>{t.lanes[2]}</small>
                      <StatusPill state={refused ? "neutral" : included ? "passed" : "caution"}>
                        {refused
                          ? t.notIncluded
                          : receipt?.kind === "included"
                            ? t.included
                            : receipt?.kind === "reverted"
                              ? t.reverted
                              : receipt?.kind === "pending"
                                ? t.pending
                                : t.unknown}
                      </StatusPill>
                      {mined && <code>#{receipt.block.toString()}</code>}
                      {row.hash && <code>{row.hash}</code>}
                    </div>
                    <div className="live-cell">
                      <small>{t.lanes[3]}</small>
                      <strong>{included ? t.paid : t.noPayment}</strong>
                      <code>{included && "to" in receipt ? receipt.to : row.to}</code>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <p className="caption live-note">{t.pendingNote}</p>
      </div>
    </SiteShell>
  );
}
