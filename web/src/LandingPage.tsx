import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { BrandMark } from "./BrandMark.js";
import r from "./compare-result.json";
import { designText } from "./designText.js";
import { AgentEvidence, EvidenceMatrix } from "./Evidence.js";
import { useI18n } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
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
  const [counts, setCounts] = useState<LiveCounts>();
  const [failed, setFailed] = useState(false);
  useEffect(
    () =>
      poll(async () => {
        try {
          const response = await fetch(`${GATEWAY_URL}/attempts/summary?from=${ARENA.agent}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error("unavailable");
          const result = (await response.json()) as LiveCounts;
          if (![result.rejected, result.accepted, result.distinctSenders].every(Number.isFinite))
            throw new Error("unavailable");
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
            <span className="eyebrow-square" />
            {t.eyebrow}
          </p>
          <h1 id="hero-title">
            {t.headline}
            <br />
            <em>{t.headlineAccent}</em>
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
        <div className="hero-art">
          <div className="card-register">
            <span className="micro-label">SEALED / AGENT POLICY</span>
            <span className="registration-stamp">L1</span>
          </div>
          <div className="spending-card">
            <div className="spending-card-top">
              <BrandMark size={38} />
              <span>{d.permission}</span>
            </div>
            <p className="spending-card-title">{t.mandate}</p>
            <div className="card-chip" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <dl>
              <div>
                <dt>{d.perPayment}</dt>
                <dd>
                  {r.S.caps.perTx}
                  <small>USDC</small>
                </dd>
              </div>
              <div>
                <dt>{d.perDay}</dt>
                <dd>
                  {r.S.caps.daily}
                  <small>USDC</small>
                </dd>
              </div>
            </dl>
            <div className="card-signature">
              <span>{t.ownerSigned}</span>
              <LandingIcon name="check" />
              <span>Sealed L1</span>
            </div>
          </div>
          <div className="boundary-track" role="img" aria-label={d.receipt}>
            <span>
              <LandingIcon name="key" />
              {t.agentKey}
            </span>
            <i />
            <strong>
              <LandingIcon name="layers" />
              {d.rule}
            </strong>
            <i />
            <span>{t.payees}</span>
          </div>
          <p className="caption">
            {d.cardCaption} · {(r.atS ?? r.at).slice(0, 10)}
          </p>
        </div>
        <div className="hero-trust">
          <span className="network-dot" />
          {t.heroNote}
        </div>
        <p className="hero-risk">{d.risk}</p>
      </section>
      {trying && (
        <section ref={panel} id="hero-transaction" className="landing-container hero-transaction">
          <Suspense fallback={<p role="status">{t.loading}</p>}>
            <HeroChallenge lang={lang} />
          </Suspense>
        </section>
      )}
      <section className="mechanism-band">
        <div className="landing-container">
          <span className="micro-label">AGENT POLICY</span>
          <p>{d.mechanism}</p>
        </div>
      </section>
      <section className="landing-container evidence-section" id="evidence">
        <div className="section-heading">
          <p className="micro-label">{t.compareEyebrow}</p>
          <h2>{d.evidence}</h2>
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
      </section>
      <section className="how-section" id="how-it-works">
        <div className="landing-container">
          <div className="section-heading">
            <p className="micro-label">{t.howEyebrow}</p>
            <h2>{t.howHeading}</h2>
            <p>{t.howLead}</p>
          </div>
          <div className="process-grid">
            {[
              { title: t.step1Title, body: t.step1, icon: "key" },
              { title: t.step2Title, body: t.step2, icon: "arrow" },
              { title: t.step3Title, body: t.step3, icon: "layers" },
            ].map((step, i) => (
              <article key={step.title}>
                <span className="process-number">0{i + 1}</span>
                <LandingIcon name={step.icon as "key" | "arrow" | "layers"} size={28} />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="landing-container live-section" id="live-proof">
        <div className="challenge-panel">
          <div>
            <p className="micro-label">{t.challengeEyebrow}</p>
            <h2>{d.liveTitle}</h2>
            <p>{d.liveBody}</p>
            <a className="landing-button button-white" href="/arena">
              {t.tryIt}
              <LandingIcon name="arrow" />
            </a>
          </div>
          <div className="challenge-key">
            <span className="micro-label">PRIVATE KEY / TESTNET ONLY</span>
            <code>{ARENA.agentPrivateKey}</code>
            <a href="/arena/rules">{t.rules} →</a>
          </div>
        </div>
        <div className="live-heading">
          <span className={`network-dot ${failed ? "is-waiting" : ""}`} />
          <p>{failed ? d.liveUnavailable : counts ? d.liveSource : d.waiting}</p>
        </div>
        <div className="live-metrics">
          {[
            [t.refusedShort, counts?.rejected],
            [d.accepted, counts?.accepted],
            [t.senders, counts?.distinctSenders],
          ].map(([label, value]) => (
            <div className="live-metric" key={String(label)}>
              <span>{label}</span>
              <strong>
                {typeof value === "number" ? (
                  value.toLocaleString(lang)
                ) : (
                  <span
                    className="metric-loading"
                    role="img"
                    aria-label={failed ? d.unavailable : d.waiting}
                  >
                    —
                  </span>
                )}
              </strong>
            </div>
          ))}
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
