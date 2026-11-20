import { Button } from "@astryxdesign/core/Button";
import { ARENA } from "./arena.config.js";
import { businessText } from "./businessText.js";
import { designText } from "./designText.js";
import { useI18n } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { SiteShell } from "./SiteShell.js";
import { StatusPill } from "./StatusPill.js";

export default function BusinessPage() {
  const { lang, setLang } = useI18n();
  const t = businessText(lang);
  const d = designText(lang);
  const partnerUrl = `${ARENA.source}/issues/new?${new URLSearchParams({ title: t.partnerTitle, body: t.partnerBody })}`;
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
        <div
          className="business-flow"
          role="img"
          aria-label={`${t.paymentFlow.join(" → ")}. ${t.subscriptionFlow}. ${t.subscriptionNote}`}
        >
          <p className="micro-label">{t.moneyTitle}</p>
          {t.paymentFlow.map((label, index) => (
            <div className="flow-node" key={label}>
              <LandingIcon
                name={index === 0 ? "layers" : index === 1 ? "key" : "check"}
                size={24}
              />
              <span>{label}</span>
              {index < t.paymentFlow.length - 1 && (
                <span className="flow-connector" aria-hidden="true">
                  ↓
                </span>
              )}
            </div>
          ))}
          <div className="subscription-flow">
            <StatusPill state="caution">{t.hypothesisBadge}</StatusPill>
            <strong>{t.subscriptionFlow}</strong>
            <p className="caption">{t.subscriptionNote}</p>
          </div>
        </div>
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
