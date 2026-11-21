import { type ReactNode, useEffect, useRef } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { BrandMark } from "./BrandMark.js";
import { designText } from "./designText.js";
import type { Lang } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import "./landing.css";
import "./routes.css";
import "./site-shell.css";

export type Current = "home" | "owner" | "arena" | "rules" | "compare" | "business" | "live";
export function SiteShell({
  lang,
  setLang,
  current,
  maxWidth: _maxWidth = 1120,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  current: Current;
  maxWidth?: number;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.current?.open) return;
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    };
    const closeOnOutside = (event: PointerEvent) => {
      const dropdown = menu.current;
      if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target))
        dropdown.open = false;
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutside);
    };
  }, []);
  const t = landingText(lang);
  const a = arenaText(lang);
  const d = designText(lang);
  const labels = {
    home: "Sealed Arena",
    arena: d.arena,
    rules: d.rules,
    compare: d.compare,
    business: d.business,
    owner: d.console,
    live: d.live.nav,
  };
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const vi = lang === "vi";
  const pageTitle = current === "home" ? "Sealed Arena" : `${labels[current]} · Sealed Arena`;
  const nav = [
    ["/live", vi ? "Trực tiếp" : d.live.nav, "pulse"],
    ["/compare", vi ? "Bằng chứng" : "Evidence", "chart"],
    ["/#how-it-works", t.navHow, "layers"],
    ["/business", vi ? "Nhà phát triển" : d.business, "blocks"],
    ["/console", vi ? "Bảng điều khiển" : t.ownerConsole, "key"],
  ] as const;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = pageTitle;
  }, [lang, pageTitle]);
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
              <span className="brand-tile">
                <BrandMark size={25} />
              </span>
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
                href="/arena"
                aria-current={current === "arena" ? "page" : undefined}
              >
                {vi ? "Vào thử thách" : "Try the challenge"}
                <LandingIcon name="arrow" size={16} />
              </a>
              <details className="landing-mobile-menu" ref={menu}>
                <summary>
                  {t.menu}
                  <span className="menu-glyph" aria-hidden="true" />
                </summary>
                <nav aria-label={t.menu}>
                  {nav.map(([href, label, icon]) => (
                    <a
                      key={href}
                      href={href}
                      aria-current={href === path ? "page" : undefined}
                      onClick={() => {
                        if (menu.current) menu.current.open = false;
                      }}
                    >
                      <LandingIcon name={icon} size={18} />
                      {label}
                    </a>
                  ))}
                  <a href="/arena/rules" aria-current={current === "rules" ? "page" : undefined}>
                    <LandingIcon name="book" size={18} />
                    {a.navRules}
                  </a>
                  <a
                    className="menu-console"
                    href="/arena"
                    aria-current={current === "arena" ? "page" : undefined}
                  >
                    <LandingIcon name="crosshair" size={18} />
                    {vi ? "Vào thử thách" : "Try the challenge"}
                  </a>
                </nav>
              </details>
            </div>
          </div>
        </header>
      </div>
      <main
        id="site-main"
        tabIndex={-1}
        className={current === "home" ? "landing-main" : `site-content page-${current}`}
      >
        {current !== "home" && (
          <div className="page-context">
            <nav className="route-crumb" aria-label={vi ? "Đường dẫn trang" : "Breadcrumb"}>
              <a href="/">Sealed Arena</a>
              <span aria-hidden="true">/</span>
              {current === "rules" && (
                <>
                  <a href="/arena">{a.navArena}</a>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <span className="page-eyebrow" aria-current="page">
                {labels[current]}
              </span>
            </nav>
            <p className="trust-note">
              <LandingIcon name="layers" size={14} />
              {d.trust}
            </p>
          </div>
        )}
        {children}
      </main>
      <footer className="site-footer">
        <div className="landing-container">
          <div className="footer-directory">
            <div className="footer-identity">
              <a className="landing-brand" href="/">
                <span className="brand-tile">
                  <BrandMark size={25} />
                </span>
                <span>
                  Sealed<span className="brand-light"> Arena</span>
                </span>
              </a>
              <p>
                {vi
                  ? "Uỷ quyền chi tiêu cho agent bằng passkey trên Avalanche L1."
                  : "Passkey-signed spending limits for agents on an Avalanche L1."}
              </p>
            </div>
            <nav aria-labelledby="footer-explore">
              <h2 id="footer-explore">{vi ? "Khám phá" : "Explore"}</h2>
              <a href="/arena">{a.navArena}</a>
              <a href="/live">{d.live.nav}</a>
              <a href="/compare">{vi ? "Bằng chứng" : "Evidence"}</a>
              <a href="/console">{t.ownerConsole}</a>
            </nav>
            <nav aria-labelledby="footer-reference">
              <h2 id="footer-reference">{vi ? "Tài liệu" : "Resources"}</h2>
              <a href="/arena/rules">{a.navRules}</a>
              <a href="/business">{d.business}</a>
              <a href={ARENA.source}>
                GitHub <span aria-hidden="true">↗</span>
              </a>
              <a href={ARENA.deployments}>
                {t.deployment} <span aria-hidden="true">↗</span>
              </a>
            </nav>
          </div>
          <div className="footer-colophon">
            <span>Team1 Vietnam UniHack 2026 · Build on Avalanche</span>
            <span>{a.testnet}</span>
            <a href="#site-main">
              {vi ? "Về đầu trang" : "Back to top"} <span aria-hidden="true">↑</span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
