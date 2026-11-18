import evidence from "./agentEvidence.json";
import agent from "./agentSummary.json";
import { ARENA } from "./arena.config.js";
import { designText } from "./designText.js";
import rows from "./evalSummary.json";
import type { Lang } from "./i18n.js";
import leakedKey from "./leakedKeySummary.json";

export function StatusPill({
  state,
  children,
}: {
  state: "refused" | "passed" | "breach" | "caution" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span className={`status-pill status-${state}`}>
      <span aria-hidden="true">
        {state === "refused" ? "⊣" : state === "passed" ? "✓" : state === "breach" ? "×" : "·"}
      </span>
      {children}
    </span>
  );
}

export function EvidenceMatrix({ lang, detailed = false }: { lang: Lang; detailed?: boolean }) {
  const t = designText(lang);
  const fuji = rows.filter((r) => !r.network.startsWith("local"));
  const dates = Object.values(evidence.walletRuns).filter(
    (v): v is string => typeof v === "string",
  );
  return (
    <section className="evidence-matrix" aria-label={t.t0}>
      <div className="matrix-heading">
        <span>{t.t0}</span>
        <span className="micro-label">
          {t.recorded} · {dates[0]?.slice(0, 10)} · Fuji
        </span>
      </div>
      <div className="matrix-grid">
        {fuji.map((r, i) => (
          <article
            className={`matrix-wallet ${r.group === "S" ? "matrix-sealed" : ""}`}
            key={r.group}
          >
            <div className="wallet-heading">
              <span className="wallet-code">{r.group}</span>
              <h3>{t.wallets[i]}</h3>
            </div>
            <p className="matrix-number">
              {r.t0}
              <span>/{r.cases}</span>
            </p>
            <div className="dot-matrix" aria-hidden="true">
              {Array.from({ length: r.cases }, (_, n) => n).map((n) => (
                <i key={`${r.group}-${n}`} className={n < r.t0 ? "dot-breach" : ""}>
                  {n < r.t0 ? "×" : ""}
                </i>
              ))}
            </div>
            {detailed && (
              <dl className="matrix-details">
                <div>
                  <dt>{t.t1}</dt>
                  <dd>
                    {r.t1}/{r.cases}
                  </dd>
                </div>
                <div>
                  <dt>{t.benign}</dt>
                  <dd>
                    {r.benignDone}/{r.benign}
                  </dd>
                </div>
              </dl>
            )}
          </article>
        ))}
      </div>
      <p className="matrix-legend">{t.legend}</p>
      <div className="evidence-disclosure">
        <strong>{t.tie}</strong>
        <p>{t.t1Note}</p>
      </div>
      <p className="caption">{t.baselineNote}</p>
    </section>
  );
}

export function AgentEvidence({ lang }: { lang: Lang }) {
  const t = designText(lang);
  return (
    <div className="agent-evidence">
      <article className="key-evidence">
        <p className="micro-label">
          {t.recorded} · {leakedKey.at.slice(0, 10)} · Fuji
        </p>
        <h3>{t.leaked}</h3>
        <p className="evidence-number">
          {leakedKey.passed}
          <span>/{leakedKey.cases}</span>
        </p>
        <p>{t.leakedLabel}</p>
        <a className="text-link" href={`${ARENA.source}/blob/main/${leakedKey.source}`}>
          {lang === "vi" ? "Xem từng ca thử" : "Inspect every case"} ↗
        </a>
      </article>
      <article className="memory-evidence">
        <p className="micro-label">
          {t.recorded} · {agent.memory.at.slice(0, 10)} · Local L1
        </p>
        <h3>{t.memory}</h3>
        <div className="memory-counts">
          <p>
            <strong>
              {agent.memory.followed}/{agent.memory.runs}
            </strong>
            <span>{t.followed}</span>
          </p>
          <span aria-hidden="true">→</span>
          <p>
            <strong>
              {agent.toAttacker.refused}/{agent.toAttacker.tried}
            </strong>
            <span>{t.refused}</span>
          </p>
        </div>
        <p>{t.memoryNote}</p>
        <p className="caption">
          {t.pages}: {evidence.pages}.
        </p>
      </article>
    </div>
  );
}
