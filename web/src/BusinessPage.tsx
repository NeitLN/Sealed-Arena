import { Button } from "@astryxdesign/core/Button";
import { useEffect, useRef, useState } from "react";
import { ARENA } from "./arena.config.js";
import { businessText } from "./businessText.js";
import { designText } from "./designText.js";
import { useI18n } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { SiteShell } from "./SiteShell.js";
import { StatusPill } from "./StatusPill.js";
import "./reading.css";

export default function BusinessPage() {
  const { lang, setLang } = useI18n();
  const t = businessText(lang);
  const d = designText(lang);
  const partnerUrl = `${ARENA.source}/issues/new?${new URLSearchParams({ title: t.partnerTitle, body: t.partnerBody })}`;
  const flow = useRef<HTMLElement>(null);
  const [flowSeen, setFlowSeen] = useState(false);
  useEffect(() => {
    const element = flow.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setFlowSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const sources = [
    `${ARENA.source}/tree/main/chain`,
    ARENA.deployments,
    `${ARENA.source}/blob/main/docs/EVALUATION.md`,
    "/arena/rules",
  ];
  return (
    <SiteShell lang={lang} setLang={setLang} current="business">
      <header className="business-hero">
        <div className="page-title">
          <StatusPill state="caution">{t.hypothesisBadge}</StatusPill>
          <h1>{d.businessTitle}</h1>
          <p>{d.businessLead}</p>
          <div className="hero-actions">
            <Button label={t.ctaConsole} href="/console" variant="primary" />
            <Button label={d.partner} href={partnerUrl} variant="secondary" />
          </div>
        </div>
        <figure className="settlement-figure" ref={flow} data-seen={flowSeen}>
          <figcaption>
            {lang === "vi" ? "Dòng thanh toán cho người bán" : "Seller payment flow"}
          </figcaption>
          <ol className="settlement-path">
            {t.paymentFlow.map((label, index) => (
              <li key={label}>
                <span className="settlement-symbol">
                  <LandingIcon
                    name={index === 0 ? "key" : index === 1 ? "layers" : "check"}
                    size={24}
                  />
                </span>
                <strong>{label}</strong>
              </li>
            ))}
          </ol>
          <div className="settlement-subscription">
            <p className="micro-label">
              {lang === "vi" ? "Phí nền tảng dự kiến" : "Proposed platform fee"}
            </p>
            <strong>{t.subscriptionFlow}</strong>
            <p>{t.subscriptionNote}</p>
          </div>
        </figure>
      </header>
      <section className="page-section business-audience">
        <h2>{t.whoTitle}</h2>
        <div className="business-columns">
          {t.who.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="page-section">
        <h2>{t.useTitle}</h2>
        <div className="use-case-grid">
          {t.use.map(([title, body], index) => (
            <article key={title}>
              <LandingIcon
                name={index === 0 ? "arrow" : index === 1 ? "layers" : "key"}
                size={28}
              />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="page-section business-model">
        <div>
          <StatusPill state="caution">{t.hypothesisBadge}</StatusPill>
          <h2>{t.moneyTitle}</h2>
          <p>{t.hypothesisNote}</p>
        </div>
        <dl>
          {t.money.map(([title, body]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="page-section business-limits">
        <h2>{t.notTitle}</h2>
        <ul>
          {t.not.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <a className="text-link" href="/arena/rules">
          {d.rules} →
        </a>
      </section>
      <section className="page-section">
        <h2>{t.checkTitle}</h2>
        <div className="source-grid">
          {t.check.map(([title, body], index) => (
            <a href={sources[index]} key={title}>
              <h3>
                {title}
                <span aria-hidden="true">{sources[index]?.startsWith("/") ? "→" : "↗"}</span>
              </h3>
              <p>{body}</p>
            </a>
          ))}
        </div>
      </section>
      <section className="partner-panel page-section" id="design-partner">
        <div>
          <p className="micro-label">{t.hypothesisBadge}</p>
          <h2>{d.partner}</h2>
          <p>{d.partnerNote}</p>
          <p>{t.partnerPrivacy}</p>
        </div>
        <Button label={d.partnerAction} variant="primary" href={partnerUrl} />
      </section>
    </SiteShell>
  );
}
