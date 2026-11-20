import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Text } from "@astryxdesign/core/Text";
import { ARENA } from "./arena.config.js";
import result from "./compare-result.json";
import { compareText, type EvalRow, type Result, whyText } from "./compareText.js";
import { designText } from "./designText.js";
import { AgentEvidence, EvidenceMatrix } from "./Evidence.js";
import evalSummary from "./evalSummary.json";
import { useI18n } from "./i18n.js";
import { SiteShell } from "./SiteShell.js";
import { StatusPill } from "./StatusPill.js";

const r = result as unknown as Result;

export default function ComparePage() {
  const { lang, setLang } = useI18n();
  const t = compareText(lang, r);
  const d = designText(lang);
  const why = whyText(lang, r, evalSummary as EvalRow[]);
  const vi = lang === "vi";
  const bursts = [
    {
      name: t.oName,
      date: r.at,
      total: r.O.attempts,
      states: [
        { label: d.settled, count: r.O.settledOnChain, state: "settled" },
        { label: d.reverted, count: r.O.revertedOnChain, state: "reverted" },
      ],
      txs: r.O.txs,
    },
    {
      name: t.sName,
      date: r.atS ?? r.at,
      total: r.S.attempts,
      states: [
        { label: d.settled, count: r.S.settledOnChain, state: "settled" },
        { label: d.poolRefused, count: r.S.refusedByPool, state: "refused" },
      ],
      txs: r.S.txs,
    },
  ];
  return (
    <SiteShell lang={lang} setLang={setLang} current="compare">
      <header className="page-title">
        <h1>{d.compareTitle}</h1>
        <p>{d.evidenceIntro}</p>
      </header>
      <EvidenceMatrix lang={lang} detailed />
      <AgentEvidence lang={lang} />
      <section className="page-section">
        <div className="section-heading">
          <p className="micro-label">{vi ? "ĐÁNH ĐỔI" : "THE TRADEOFF"}</p>
          <h2>{why.title}</h2>
          <p>{why.intro}</p>
        </div>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">{vi ? "Điểm so sánh" : "What changes"}</th>
                <th scope="col">{why.oPlus}</th>
                <th scope="col">{why.s}</th>
              </tr>
            </thead>
            <tbody>
              {why.rows.map(([label, a, b]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td data-label={why.oPlus}>{a}</td>
                  <td data-label={why.s}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="decision-pair">
          <article>
            <span className="wallet-code">O+</span>
            <p>{why.whenOPlus}</p>
          </article>
          <article>
            <span className="wallet-code">S</span>
            <p>{why.whenS}</p>
          </article>
        </div>
        <p className="caption">{why.note}</p>
      </section>
      <section className="page-section">
        <div className="section-heading">
          <p className="micro-label">{vi ? "PHÉP THỬ BỔ SUNG" : "SECONDARY EXPERIMENT"}</p>
          <h2>{d.burst}</h2>
          <p>{d.burstIntro}</p>
        </div>
        <div className="burst-grid">
          {bursts.map((b) => (
            <article className="burst-panel" key={b.name}>
              <p className="micro-label">
                {d.recorded} · {b.date.slice(0, 10)}
              </p>
              <h3>{b.name}</h3>
              <div
                className="burst-track"
                role="img"
                aria-label={`${b.total} ${vi ? "giao dịch" : "transactions"}`}
              >
                {b.states
                  .flatMap((s) =>
                    Array.from({ length: s.count }, (_, n) => ({
                      id: `${s.state}-${n}`,
                      state: s.state,
                    })),
                  )
                  .map((dot) => (
                    <i key={dot.id} className={`burst-dot burst-${dot.state}`} aria-hidden="true">
                      {dot.state === "reverted" ? "×" : dot.state === "refused" ? "−" : ""}
                    </i>
                  ))}
              </div>
              <dl className="burst-legend">
                {b.states.map((s) => (
                  <div key={s.state}>
                    <dt>{s.label}</dt>
                    <dd>{s.count}</dd>
                  </div>
                ))}
              </dl>
              {b.name === t.sName && (
                <p className="caption">
                  <code>{Object.keys(result.S.refusals).join(" · ")}</code>
                </p>
              )}
              <Collapsible trigger={<Text>{t.txs}</Text>} defaultIsOpen={false}>
                <ul className="transaction-list">
                  {b.txs.map((tx) => (
                    <li key={tx.tx}>
                      {b.name === t.oName ? (
                        <a href={`${r.explorers.cChain}${tx.tx}`}>
                          <code>{tx.tx}</code>
                        </a>
                      ) : (
                        <code>{tx.tx}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </article>
          ))}
        </div>
        <p className="section-note">
          {vi
            ? "Cả hai giữ hạn mức ngày trong lượt chạy này. Sealed tính cả khoản trong pool vào ngân sách và từ chối khoản vượt hạn mức ngay khi nhận. O+ không nằm trong phép thử này."
            : "Both stayed within the daily cap in this run. Sealed counts pooled payments toward the budget and refuses excess payments on arrival. O+ was not included in this experiment."}
        </p>
      </section>
      <section className="scripted-panel">
        <div>
          <p className="micro-label">
            {vi ? "KỊCH BẢN SOẠN SẴN · KHÔNG CHẠY MODEL THẬT" : "SCRIPTED RUN · NO LIVE MODEL"}
          </p>
          <h2>{t.injection}</h2>
          <p className="caption">
            {d.recorded} · {r.at.slice(0, 10)}
          </p>
        </div>
        <div>
          <h3>{t.pName}</h3>
          <p>−{r.P.attackerReceived} USDC</p>
          <a href={`${r.explorers.cChain}${r.P.tx}`}>
            {vi ? "Xem giao dịch" : "View transaction"} ↗
          </a>
        </div>
        <div>
          <h3>{t.sName}</h3>
          <StatusPill state={r.S.injection.refused ? "refused" : "breach"}>
            {r.S.injection.refused ? d.refusedStatus : d.accepted}
          </StatusPill>
          <code>{r.S.injection.reason}</code>
        </div>
        <p className="caption">
          {t.oName}: {t.notRun}
        </p>
      </section>
      <section className="page-section method-section">
        <h2>{vi ? "Cách đo và lưu ý" : "Method and caveats"}</h2>
        <ul>
          {t.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <a className="text-link" href={`${ARENA.source}/tree/main/services/attacks/compare`}>
          {t.source} ↗
        </a>
      </section>
    </SiteShell>
  );
}
