import { useEffect, useRef, useState } from "react";
import evaluation from "./agentEvidence.json";
import agent from "./agentSummary.json";
import { ARENA } from "./arena.config.js";
import { BrandMark } from "./BrandMark.js";
import r from "./compare-result.json";
import { useI18n } from "./i18n.js";
import { LandingIcon, LandingVisual } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import { SiteShell } from "./SiteShell.js";
import { useArenaLive } from "./useArenaLive.js";

/** USDC·hours from the recorder's score (coin·seconds with 18 decimals). */
export const survivalHours = (score: bigint) => Number(score / 10n ** 15n) / 1000 / 3600;

export default function LandingPage() {
  const { lang, setLang } = useI18n();
  const t = landingText(lang);

  const live = useArenaLive(1);
  const hours = live.rec ? survivalHours(live.rec.score) : undefined;
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const help = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (!help.current?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        help.current.querySelector("summary")?.focus();
      } else if (e.target instanceof Node && help.current.contains(e.target)) return;
      help.current.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  useEffect(() => {
    const sections = root.current?.querySelectorAll(".reveal");
    if (!sections || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const fill = (s: string) =>
    s
      .replace("{passed}", String(r.O.passedVerifyBeforeSettle))
      .replace("{attempts}", String(r.O.attempts))
      .replace("{reverted}", String(r.O.revertedOnChain));
  const value = (v: number | undefined, decimals = 0) =>
    v === undefined ? (
      <span className="metric-loading">
        <span className="metric-skeleton" aria-hidden="true" />
        <span className="landing-sr-only">{live.error ? t.dataUnavailable : t.loading}</span>
      </span>
    ) : (
      v.toLocaleString(lang, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
    );

  return (
    <SiteShell current="home" lang={lang} setLang={setLang}>
      <div className="landing" ref={root} data-motion={paused ? "paused" : "running"}>
        <section className="landing-hero landing-container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="avalanche-symbol" aria-hidden="true">
                ▲
              </span>
              {t.eyebrow}
              <span className="eyebrow-line" />
            </div>
            <h1 id="hero-title">
              {t.headline} <span>{t.headlineAccent}</span>
            </h1>
            <p className="hero-thesis">{t.thesis}</p>
            <p className="hero-lead">{t.lead}</p>
            <div className="hero-actions">
              <a className="landing-button button-primary" href="/arena">
                {t.tryIt}
                <LandingIcon name="arrow" />
              </a>
              <a className="landing-button button-secondary" href="/compare">
                {t.seeCompare}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-note">
              <LandingIcon name="key" size={15} />
              {t.heroNote}
            </p>
          </div>
          <LandingVisual t={t} paused={paused} onPause={() => setPaused((p) => !p)} />
          <div className="hero-baseline">
            <span>{t.stackNote}</span>
            <a href="#live-proof">
              {t.scroll}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>

        <section className="live-section" id="live-proof" aria-labelledby="live-title">
          <div className="landing-container">
            <div className="live-heading">
              <div>
                <p className="micro-label">{t.liveEyebrow}</p>
                <h2 id="live-title" className="live-title">
                  <span
                    className={`live-indicator ${live.error || !live.rec || !live.summary ? "is-waiting" : ""}`}
                  />
                  {t.liveTitle}
                </h2>
              </div>
              <a className="text-link" href="/arena">
                {t.liveLink}
                <LandingIcon name="arrow" size={17} />
              </a>
            </div>
            <div className="live-metrics">
              <div className="live-metric">
                <p>{t.refusedShort}</p>
                <strong>{value(live.summary?.rejected)}</strong>
                <span>{t.refusedSource}</span>
              </div>
              <div className="live-metric">
                <p>{t.senders}</p>
                <strong>{value(live.summary?.distinctSenders)}</strong>
                <span>{t.refusedSource}</span>
              </div>
              <div className="live-metric">
                <div className="metric-label">
                  {t.survival}
                  <details className="metric-help" ref={help}>
                    <summary aria-label={t.aboutSurvival}>i</summary>
                    <div>{t.survivalHelp}</div>
                  </details>
                </div>
                <strong>
                  {value(hours, 1)}
                  <small>{t.survivalUnit}</small>
                </strong>
                <span>{t.onChain}</span>
              </div>
              <div className="live-metric metric-status">
                <p>{t.status}</p>
                <strong className={live.rec?.breached ? "status-breached" : ""}>
                  {live.rec ? (
                    <>
                      <span className="status-symbol">
                        <LandingIcon name={live.rec.breached ? "cross" : "check"} size={23} />
                      </span>
                      {live.rec.breached ? t.breached : t.intact}
                    </>
                  ) : (
                    value(undefined)
                  )}
                </strong>
                <span>{t.onChain}</span>
              </div>
            </div>
            <p className="live-note">{live.error ? t.liveDown : t.liveNote}</p>
          </div>
        </section>

        <section
          className="how-section landing-container reveal"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="section-heading">
            <div>
              <p className="micro-label">{t.howEyebrow}</p>
              <h2 id="how-title" className="landing-section-title">
                {t.howHeading}
              </h2>
            </div>
            <p className="section-intro">{t.howLead}</p>
          </div>
          <div className="process-grid">
            {(
              [
                { title: t.step1Title, body: t.step1, tag: t.step1Tag, icon: "key" },
                { title: t.step2Title, body: t.step2, tag: t.step2Tag, icon: "arrow" },
                { title: t.step3Title, body: t.step3, tag: t.step3Tag, icon: "layers" },
              ] as const
            ).map((step, i) => (
              <article className="process-step" key={step.title}>
                <div className="process-step-top">
                  <span className="step-icon">
                    <LandingIcon name={step.icon} size={25} />
                  </span>
                  <span className="step-number">0{i + 1}</span>
                </div>
                <p className="micro-label">{step.tag}</p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {i < 2 && (
                  <span className="step-connector" aria-hidden="true">
                    <LandingIcon name="arrow" size={17} />
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="evidence-section" id="evidence" aria-labelledby="evidence-title">
          <div className="landing-container reveal">
            <div className="section-heading">
              <div>
                <p className="micro-label">{t.compareEyebrow}</p>
                <h2 id="evidence-title" className="landing-section-title">
                  {t.compareHeading}
                </h2>
              </div>
              <div className="section-intro">
                <p>{t.compareTitle}.</p>
                <p>{t.compareNote}</p>
              </div>
            </div>
            <div className="comparison-grid">
              <article className="comparison-card plain-card">
                <span className="micro-label">{t.plainBaseline}</span>
                <h3>{t.plain}</h3>
                <p className="test-tag">{t.injectedTag}</p>
                <div className="comparison-amount">
                  −{r.P.attackerReceived}
                  <small>USDC</small>
                </div>
                <p className="comparison-outcome">
                  <span className="outcome-dot" />
                  {t.plainLabel}
                </p>
                <div className="comparison-track" aria-hidden="true">
                  <span>AGENT</span>
                  <i />
                  <span>BLOCK</span>
                  <i />
                  <span>↗</span>
                </div>
                <p className="comparison-detail">
                  {t.plainResult
                    .replace("{pages}", evaluation.pages)
                    .replace("{memory}", `${agent.memory.followed}/${agent.memory.runs}`)}
                </p>
              </article>
              <article className="comparison-card contract-card">
                <span className="micro-label">{t.contractBaseline}</span>
                <h3>{t.limit}</h3>
                <p className="test-tag">{t.burstTag.replace("{attempts}", String(r.O.attempts))}</p>
                <div className="comparison-amount">
                  {r.O.revertedOnChain}
                  <small>/ {r.O.attempts}</small>
                </div>
                <p className="comparison-outcome">
                  <span className="outcome-dot" />
                  {t.limitLabel}
                </p>
                <div className="comparison-track" aria-hidden="true">
                  <span>AGENT</span>
                  <i />
                  <span>BLOCK</span>
                  <i />
                  <span>×</span>
                </div>
                <p className="comparison-detail">{fill(t.limitResult)}.</p>
              </article>
              <article className="comparison-card sealed-card">
                <div className="sealed-card-label">
                  <span className="micro-label">{t.projectLabel}</span>
                  <BrandMark size={26} />
                </div>
                <h3>{t.sealed}</h3>
                <p className="test-tag">{t.burstTag.replace("{attempts}", String(r.S.attempts))}</p>
                <dl className="burst-counts">
                  {[
                    [t.inBlocks, r.S.settledOnChain],
                    [t.keptOut, r.S.leftOutOfBlocks],
                    [t.reverted, r.S.txs.filter((tx) => tx.status === "reverted").length],
                  ].map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                <p className="comparison-detail">
                  {t.poolResult
                    .replace("{accepted}", String(r.S.acceptedByPool))
                    .replace("{refused}", String(r.S.refusedByPool))}{" "}
                  {t.sealedResult}
                </p>
                <p className="test-tag">{t.injectionLabel}</p>
                <code>{r.S.injection.reason}</code>
              </article>
            </div>
            <div className="evidence-footer">
              <p>{t.compareCaveat}</p>
              <div>
                <a className="text-link" href="/compare">
                  {t.fullResults}
                  <LandingIcon name="arrow" size={17} />
                </a>
                <a
                  className="text-link secondary-text-link"
                  href={`${ARENA.source}/blob/main/docs/EVALUATION.md`}
                >
                  {t.evaluation}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className="landing-container challenge-section reveal"
          aria-labelledby="challenge-title"
        >
          <div className="challenge-panel">
            <div className="challenge-rings" aria-hidden="true">
              <span />
              <span />
              <span />
              <BrandMark size={110} />
            </div>
            <div className="challenge-copy">
              <p className="micro-label">{t.challengeEyebrow}</p>
              <h2 id="challenge-title" className="landing-section-title challenge-title">
                {t.challengeTitle}
              </h2>
              <p>{t.challengeBody}</p>
              <div className="hero-actions">
                <a className="landing-button button-light" href="/arena">
                  {t.tryIt}
                  <LandingIcon name="arrow" />
                </a>
                <a className="challenge-rules" href="/arena/rules">
                  {t.rules}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
