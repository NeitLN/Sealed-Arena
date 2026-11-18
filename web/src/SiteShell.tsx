import { type ReactNode, useEffect, useRef } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { BrandMark } from "./BrandMark.js";
import type { Lang } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import "./landing.css";

export type Current = "home" | "owner" | "arena" | "rules" | "compare" | "business";
export function SiteShell({
  lang,
  setLang,
  current,
  maxWidth = 1120,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  current: Current;
  maxWidth?: number;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const t = landingText(lang);
  const a = arenaText(lang);
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const nav = [
    ["/arena", a.navArena],
    ["/compare", a.navCompare],
    ["/#how-it-works", t.navHow],
    ["/business", t.navBusiness],
    ["/arena/rules", a.navRules],
  ];
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <>
      <div className="landing site-header">
        <a className="landing-skip" href="#site-main">
          {t.skip}
        </a>
        <header className="landing-header">
          <div className="landing-nav-wrap">
            <a
              className="landing-brand"
              href="/"
              aria-label="Sealed Arena"
              aria-current={current === "home" ? "page" : undefined}
            >
              <BrandMark size={32} />
              <span>
                Sealed<span className="brand-light"> Arena</span>
              </span>
            </a>
            <span className="network-badge">{t.testnetBadge}</span>
            <nav className="landing-desktop-nav" aria-label={t.menu}>
              {nav.map(([href, label]) => (
                <a key={href} href={href} aria-current={href === path ? "page" : undefined}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="landing-header-actions">
              <fieldset className="language-control" aria-label={t.language}>
                {(["en", "vi"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => setLang(l)}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </fieldset>
              <a
                className="console-link"
                href="/console"
                aria-current={current === "owner" ? "page" : undefined}
              >
                {t.ownerConsole}
                <LandingIcon name="arrow" size={16} />
              </a>
              <details className="landing-mobile-menu" ref={menu}>
                <summary>
                  {t.menu}
                  <span aria-hidden="true">☰</span>
                </summary>
                <nav aria-label={t.menu}>
                  {nav.map(([href, label]) => (
                    <a
                      key={href}
                      href={href}
                      aria-current={href === path ? "page" : undefined}
                      onClick={() => {
                        if (menu.current) menu.current.open = false;
                      }}
                    >
                      {label}
                    </a>
                  ))}
                  <a href="/console" aria-current={current === "owner" ? "page" : undefined}>
                    {t.ownerConsole}
                  </a>
                </nav>
              </details>
            </div>
          </div>
        </header>
      </div>
      <main
        id="site-main"
        className={current === "home" ? undefined : "site-content"}
        style={current === "home" ? undefined : { maxWidth }}
      >
        {current !== "home" && <p className="page-eyebrow">{t.footerNetwork}</p>}
        {children}
      </main>
      <div className="landing">
        <footer className="landing-footer landing-container">
          <div className="footer-main">
            <div>
              <a className="landing-brand" href="/">
                <BrandMark size={29} />
                <span>
                  Sealed<span className="brand-light"> Arena</span>
                </span>
              </a>
              <p>{t.footerLine}</p>
            </div>
            <div className="footer-links">
              <a href="/arena/rules">{a.navRules}</a>
              <a href={ARENA.source}>GitHub ↗</a>
              <a href={ARENA.deployments}>{t.deployment} ↗</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>{a.testnet}</span>
            <span>{t.footerNetwork}</span>
          </div>
        </footer>
      </div>
    </>
  );
}
