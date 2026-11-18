import { useState } from "react";
import { BrandMark } from "./BrandMark.js";
import type { landingText } from "./landingText.js";

type Copy = ReturnType<typeof landingText>;

export function LandingIcon({
  name,
  size = 20,
}: {
  name: "arrow" | "key" | "check" | "layers" | "pause" | "play" | "cross";
  size?: number;
}) {
  const paths = {
    arrow: "M5 12h14m-5-5 5 5-5 5",
    key: "M12 8a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM11 11l9 9m-5-5 3-3m-1 5 3-3",
    check: "m5 12 4 4L19 6",
    layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8V4Z",
    cross: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function LandingVisual({
  t,
  paused,
  onPause,
}: {
  t: Copy;
  paused: boolean;
  onPause: () => void;
}) {
  const [allowed, setAllowed] = useState(false);
  return (
    <div className={`mandate-visual ${allowed ? "is-allowed" : "is-denied"}`}>
      <div className="visual-topline">
        <span className="micro-label">{t.simulation}</span>
        <button
          className="motion-control"
          type="button"
          onClick={onPause}
          aria-label={paused ? t.play : t.pause}
          aria-pressed={paused}
        >
          <LandingIcon name={paused ? "play" : "pause"} size={15} />
        </button>
      </div>
      <p className="landing-sr-only">{t.sceneDescription}</p>
      <div className="mandate-scene" aria-hidden="true">
        <div className="scene-orbit orbit-one" />
        <div className="scene-orbit orbit-two" />
        <svg className="transaction-paths" viewBox="0 0 580 450" fill="none" aria-hidden="true">
          <path
            className="route-base"
            d="M40 270H115Q145 270 145 240V190Q145 160 175 160H330Q365 160 365 195V310Q365 340 400 340H540"
          />
          <path
            className="route-flow"
            d="M40 270H115Q145 270 145 240V190Q145 160 175 160H330Q365 160 365 195V310Q365 340 400 340H540"
          />
          <circle className="route-particle" r="4" />
        </svg>
        <div className="glass-foundation foundation-back" />
        <div className="glass-foundation foundation-front">
          <span>SEALED / L1</span>
        </div>
        <div className="mandate-card">
          <div className="mandate-card-head">
            <BrandMark size={35} />
            <span>Sealed Arena</span>
          </div>
          <div className="card-title">{t.mandate}</div>
          <div className="mandate-fields">
            <div>
              <span>{t.payees}</span>
              <strong>{t.payeeValue}</strong>
            </div>
            <div>
              <span>{t.limits}</span>
              <strong>{t.limitsValue}</strong>
            </div>
            <div>
              <span>{t.expiry}</span>
              <strong>{t.expiryValue}</strong>
            </div>
          </div>
          <div className="card-seal">
            <LandingIcon name="check" size={27} />
          </div>
        </div>
        <div className="signed-chip">
          <span className="mini-icon">
            <LandingIcon name="check" size={14} />
          </span>
          {t.ownerSigned}
        </div>
        <div className="agent-chip">
          <span className="agent-glyph">⌘</span>
          <div>
            <span className="micro-label">{t.agentKey}</span>
            <strong>{t.signedTx}</strong>
          </div>
        </div>
        <div className="rule-chip">
          <span className="rule-icon">
            <LandingIcon name="layers" size={20} />
          </span>
          <div>
            <span className="micro-label">{t.ruleLabel}</span>
            <strong>AgentPolicy</strong>
          </div>
        </div>
        <div className="boundary-label">
          <span />
          {t.boundary}
        </div>
      </div>
      <div className="visual-bottom">
        <fieldset className="scenario-switch" aria-label={t.simulation}>
          <button type="button" aria-pressed={!allowed} onClick={() => setAllowed(false)}>
            <span className="scenario-dot denied-dot" />
            {t.denied}
          </button>
          <button type="button" aria-pressed={allowed} onClick={() => setAllowed(true)}>
            <span className="scenario-dot allowed-dot" />
            {t.allowed}
          </button>
        </fieldset>
        <div className="scenario-result" role="status" aria-live="polite">
          <span className="result-icon">
            <LandingIcon name={allowed ? "check" : "cross"} size={18} />
          </span>
          <div>
            <strong>{allowed ? t.acceptedTitle : t.deniedTitle}</strong>
            <p>{allowed ? t.acceptedBody : t.deniedBody}</p>
          </div>
          {!allowed && <code>{t.deniedCode}</code>}
        </div>
        <p className="simulation-disclaimer">{t.simulationNote}</p>
      </div>
    </div>
  );
}
