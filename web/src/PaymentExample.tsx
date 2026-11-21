import { type AnimationEvent, useEffect, useRef, useState } from "react";
import { BrandMark } from "./BrandMark.js";
import type { Lang } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import "./payment-example.css";

export function PaymentExample({ lang }: { lang: Lang }) {
  const t = landingText(lang);
  const [approved, setApproved] = useState(true);
  const [run, setRun] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Until the visitor picks a payee, the two cases take turns: when the coin's run ends, the
  // verdict stays readable for a moment, then the other payee plays. Without motion (reduced
  // motion) no run ends, so nothing switches by itself.
  const [touched, setTouched] = useState(false);
  const next = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(next.current), []);
  const onRunEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (touched || !/^payment-(pass|stop)$/.test(event.animationName)) return;
    window.clearTimeout(next.current);
    next.current = window.setTimeout(() => setApproved((value) => !value), 1800);
  };
  const choose = (allowed: boolean) => {
    window.clearTimeout(next.current);
    setTouched(true);
    setApproved(allowed);
  };
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const replayLabel = lang === "vi" ? "Phát lại minh hoạ" : "Replay illustration";
  return (
    <section className="payment-example" aria-labelledby="example-title">
      <div
        ref={stage}
        className="transfer-stage"
        data-visible={visible}
        data-route={approved ? "allowed" : "refused"}
      >
        <header>
          <div className="transfer-heading">
            <LandingIcon name="pulse" size={17} />
            <h2 id="example-title">{t.example}</h2>
          </div>
          <button
            className="transfer-replay"
            type="button"
            aria-label={replayLabel}
            title={replayLabel}
            onClick={() => setRun((value) => value + 1)}
          >
            <LandingIcon name="replay" size={16} />
          </button>
        </header>
        <div className="transfer-quote">
          <p className="transfer-fee">{t.paymentLabel}</p>
          <p className="transfer-amount">
            {lang === "vi" ? "0,40" : "0.40"} <span>USDC</span>
          </p>
        </div>
        <div
          className="transfer-scene"
          key={`${approved}-${run}`}
          aria-hidden="true"
          onAnimationEnd={onRunEnd}
        >
          <div className="transfer-floor" />
          <div className="transfer-shadow" />
          <div className="transfer-track">
            <i />
          </div>
          <div className="transfer-seal">
            <div className="seal-imprint">
              <BrandMark size={52} />
            </div>
          </div>
          <div className="transfer-coin">
            <span>$</span>
          </div>
          <div className="transfer-source" />
          <div className="transfer-destination">
            <LandingIcon name={approved ? "check" : "cross"} size={13} />
          </div>
        </div>
        <div className="transfer-axis" aria-hidden="true">
          <span>Agent</span>
          <strong>Sealed L1</strong>
          <span>{lang === "vi" ? "Người nhận" : "Payee"}</span>
        </div>
      </div>
      <div className="payment-slip">
        <fieldset>
          <legend>{t.choosePayee}</legend>
          <div className="payee-options">
            {[true, false].map((allowed) => (
              <label key={String(allowed)}>
                <input
                  type="radio"
                  name="example-payee"
                  checked={approved === allowed}
                  onChange={() => choose(allowed)}
                />
                <LandingIcon name={allowed ? "blocks" : "crosshair"} size={16} />
                <span>{allowed ? t.apiProvider : t.otherPayee}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div
          className="example-verdict"
          data-approved={approved}
          role="status"
          aria-live={touched ? "polite" : "off"}
          aria-atomic="true"
        >
          <span className="verdict-icon">
            <LandingIcon name={approved ? "check" : "cross"} size={15} />
          </span>
          <div>
            <strong>{approved ? t.matchesPayee : t.missesPayee}</strong>
            <p>{approved ? t.matchesNote : t.missesNote}</p>
          </div>
        </div>
        <p className="example-caption">{t.simulationNote}</p>
      </div>
    </section>
  );
}
