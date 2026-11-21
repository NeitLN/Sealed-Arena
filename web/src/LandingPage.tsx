import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { isStateAnswer } from "./arenaState.js";
import { designText } from "./designText.js";
import { AgentEvidence, EvidenceMatrix } from "./Evidence.js";
import { usdcApprox } from "./format.js";
import { useI18n } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import { PolicyDiagram } from "./PolicyDiagram.js";
import { poll } from "./poll.js";
import { SiteShell } from "./SiteShell.js";

const HeroChallenge = lazy(() => import("./HeroChallenge.js"));
type LiveCounts = { rejected: number; accepted: number; distinctSenders: number };

export default function LandingPage() {
  const { lang, setLang } = useI18n();
  const t = landingText(lang);
  const d = designText(lang);
  const [trying, setTrying] = useState(false);
  const panel = useRef<HTMLElement>(null);
  // The panel opens below the hero: bring it into view so the click visibly does something.
  useEffect(() => {
    if (!trying) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
  }, [trying]);
  // This page is loaded lazily, so when a link from another page opens "/#how-it-works" the
  // browser's own jump finds no section yet. Scroll to it once the page has rendered.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const [counts, setCounts] = useState<LiveCounts>();
  const [chain, setChain] = useState<{ breached: boolean; balance: string; stale: boolean }>();
  const [failed, setFailed] = useState(false);
  useEffect(
    () =>
      poll(async () => {
        try {
          const response = await fetch(`${GATEWAY_URL}/state`, {
            signal: AbortSignal.timeout(8000),
          });
          let result: LiveCounts;
          let nextChain: typeof chain;
          if (response.status === 404) {
            // Older gateways still expose attempt counts, but have no chain snapshot.
            const legacy = await fetch(`${GATEWAY_URL}/attempts/summary?from=${ARENA.agent}`, {
              signal: AbortSignal.timeout(8000),
            });
            if (!legacy.ok) throw new Error("unavailable");
            result = (await legacy.json()) as LiveCounts;
          } else {
            if (!response.ok) throw new Error("unavailable");
            const state: unknown = await response.json();
            if (
              !isStateAnswer(state) ||
              typeof state.recorder.breached !== "boolean" ||
              !/^\d+$/.test(state.balance)
            )
              throw new Error("unavailable");
            result = state.summary as LiveCounts;
            nextChain = {
              breached: state.recorder.breached,
              balance: usdcApprox(BigInt(state.balance)),
              stale: state.stale === true,
            };
          }
          if (
            !result ||
            ![result.rejected, result.accepted, result.distinctSenders].every(Number.isFinite)
          )
            throw new Error("unavailable");
          setChain(nextChain);
          setCounts(result);
          setFailed(false);
          return true;
        } catch {
          setFailed(true);
          return false;
        }
      }, 15000),
    [],
  );
  return (
    <SiteShell current="home" lang={lang} setLang={setLang}>
      <section className="landing-hero landing-container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="micro-label hero-eyebrow">
            <LandingIcon name="layers" size={16} />
            {t.eyebrow}
          </p>
          <h1 id="hero-title">
            <span>{t.headline}</span> <span className="hero-accent">{t.headlineAccent}</span>
          </h1>
          <p className="hero-lead">{t.lead}</p>
          <div className="hero-actions">
            <button
              className="landing-button button-primary"
              type="button"
              onClick={() => setTrying(!trying)}
              aria-expanded={trying}
              aria-controls="hero-transaction"
            >
              {d.liveLoad}
              <LandingIcon name="arrow" />
            </button>
            <a className="landing-button button-secondary" href="/compare">
              {t.seeCompare}
              <LandingIcon name="layers" />
            </a>
          </div>
          <p className="hero-action-note">{d.liveHint}</p>
        </div>
        <PolicyDiagram lang={lang} />
      </section>
      {trying && (
        <section ref={panel} id="hero-transaction" className="landing-container hero-transaction">
          <Suspense fallback={<p role="status">{t.loading}</p>}>
            <HeroChallenge lang={lang} />
          </Suspense>
        </section>
      )}
      <aside className="network-strip">
        <div className="landing-container">
          <div className="network-identity">
            <span className="network-symbol" aria-hidden="true">
              <LandingIcon name="layers" size={24} />
            </span>
            <div>
              <span>{lang === "vi" ? "Mạng thử nghiệm" : "Test network"}</span>
              <strong>Avalanche Fuji</strong>
            </div>
          </div>
          <div>
            <span>Chain ID</span>
            <strong>{Number(ARENA.chainIdHex)}</strong>
          </div>
          <div>
            <span>{lang === "vi" ? "Validator do đội vận hành" : "Team-run validator"}</span>
            <strong>{ARENA.validators.length}</strong>
          </div>
          <a href="/live">
            {d.live.nav}
            <LandingIcon name="arrow" size={17} />
          </a>
        </div>
      </aside>
      <section className="evidence-section" id="evidence" aria-labelledby="evidence-title">
        <div className="landing-container">
          <div className="section-heading chapter-intro">
            <p className="micro-label">{t.compareEyebrow}</p>
            <h2 id="evidence-title">{d.evidence}</h2>
            <p>{d.evidenceIntro}</p>
          </div>
          <EvidenceMatrix lang={lang} />
          <AgentEvidence lang={lang} />
          <div className="section-links">
            <a className="text-link" href="/compare">
              {t.fullResults}
              <LandingIcon name="arrow" />
            </a>
            <a className="text-link" href={`${ARENA.source}/blob/main/docs/EVALUATION.md`}>
              {t.evaluation} ↗
            </a>
          </div>
        </div>
      </section>
      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-container">
          <div className="section-heading chapter-intro">
            <p className="micro-label">{t.howEyebrow}</p>
            <h2 id="how-title">{t.howHeading}</h2>
            <p>{t.howLead}</p>
          </div>
          <ol className="process-grid">
            {[
              { title: t.step1Title, body: t.step1, icon: "key" },
              { title: t.step2Title, body: t.step2, icon: "arrow" },
              { title: t.step3Title, body: t.step3, icon: "layers" },
            ].map((step, i) => (
              <li key={step.title}>
                <span className="process-number" aria-hidden="true">
                  0{i + 1}
                </span>
                <LandingIcon name={step.icon as "key" | "arrow" | "layers"} size={28} />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="policy-notes">
            <p>{d.mechanism}</p>
            <p>{d.risk}</p>
          </div>
        </div>
      </section>
      <section
        className="landing-container live-section"
        id="live-proof"
        aria-labelledby="challenge-title"
      >
        <div className="challenge-panel">
          <div className="challenge-intro">
            <p className="micro-label">{t.challengeEyebrow}</p>
            <h2 id="challenge-title">{d.liveTitle}</h2>
            <p>{d.liveBody}</p>
            <div className="hero-actions">
              <a className="landing-button button-primary" href="/arena">
                {t.tryIt}
                <LandingIcon name="arrow" />
              </a>
              <a className="text-link" href="/arena/rules">
                {t.rules} →
              </a>
            </div>
            <details className="challenge-key">
              <summary>
                {lang === "vi" ? "Xem khoá riêng đã công bố" : "View the published challenge key"}
              </summary>
              <span>
                {lang === "vi"
                  ? "Khoá riêng · Chỉ dùng trên testnet"
                  : "Private key · Testnet only"}
              </span>
              <code>{ARENA.agentPrivateKey}</code>
            </details>
          </div>
          <div className="gateway-readout">
            <h3>{lang === "vi" ? "Trạng thái thử thách" : "Challenge status"}</h3>
            <div className="gateway-line">
              <span
                className={`network-dot ${failed || !chain || chain.stale ? "is-waiting" : ""}`}
              />
              <p role="status">
                {failed
                  ? chain || counts
                    ? d.live.stale
                    : d.liveUnavailable
                  : chain?.stale
                    ? d.live.stale
                    : chain
                      ? lang === "vi"
                        ? "Dữ liệu trên chain qua gateway"
                        : "Chain state via the gateway"
                      : counts
                        ? d.liveUnavailable
                        : d.waiting}
              </p>
            </div>
            <div className="live-metrics">
              {[
                [
                  lang === "vi"
                    ? "Vi phạm đã ghi trên chain (T0)"
                    : "Breaches recorded on chain (T0)",
                  chain ? Number(chain.breached).toString() : undefined,
                ],
                [
                  lang === "vi" ? "Số dư đang thử thách" : "Balance at stake",
                  chain ? `${chain.balance} USDC` : undefined,
                ],
              ].map(([label, value]) => (
                <div className="live-metric" key={label}>
                  <span>{label}</span>
                  <strong>
                    {value ?? (
                      <span
                        className="metric-loading"
                        role="img"
                        aria-label={failed || counts ? d.unavailable : d.waiting}
                      >
                        —
                      </span>
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <p className="gateway-counts">
              {lang === "vi" ? "Gateway · ngoài chain" : "Gateway · off-chain"}
              <br />
              {t.refusedShort}: {counts?.rejected.toLocaleString(lang) ?? "—"} · {d.accepted}:{" "}
              {counts?.accepted.toLocaleString(lang) ?? "—"} · {t.senders}:{" "}
              {counts?.distinctSenders.toLocaleString(lang) ?? "—"}
            </p>
          </div>
        </div>
      </section>
      <section className="avalanche-band">
        <div className="landing-container">
          <div>
            <p className="micro-label">AVALANCHE / FUJI</p>
            <h2>{d.avalanche}</h2>
            <p>{d.avalancheBody}</p>
          </div>
          <div className="integration-links">
            {[
              [d.precompile, `${ARENA.source}/tree/main/chain`],
              [d.bridge, ARENA.deployments],
              [d.payment, `${ARENA.source}/tree/main/services/facilitator`],
              [d.registry, ARENA.deployments],
            ].map(([label, href]) => (
              <a key={label} href={href}>
                {label}
                <span>↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
