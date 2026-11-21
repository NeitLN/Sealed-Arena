import { useState } from "react";
import evidence from "./agentEvidence.json";
import agent from "./agentSummary.json";
import { ARENA } from "./arena.config.js";
import { designText } from "./designText.js";
import rows from "./evalSummary.json";
import type { Lang } from "./i18n.js";
import leakedKey from "./leakedKeySummary.json";
import "./reading.css";

export function EvidenceMatrix({ lang, detailed = false }: { lang: Lang; detailed?: boolean }) {
  const t = designText(lang);
  const Heading = detailed ? "h2" : "h3";
  const fuji = rows.filter((r) => !r.network.startsWith("local"));
  const dates = Object.values(evidence.walletRuns).filter(
    (v): v is string => typeof v === "string",
  );
  const [metric, setMetric] = useState<"t0" | "t1" | "benign">("t0");
  const vi = lang === "vi";
  const legends = {
    t0: t.legend,
    t1: vi
      ? "Dấu + là một ca có khoản thanh toán ngoài ý muốn trong uỷ quyền. Vòng tròn rỗng là ca không ghi nhận T1."
      : "Each + marks a case with unwanted spending inside the mandate. An open circle marks a case with no T1 recorded.",
    benign: vi
      ? "Dấu ✓ là một ca hoàn thành khoản thanh toán hợp lệ. Vòng tròn rỗng là ca chưa hoàn thành."
      : "Each ✓ marks a completed benign payment. An open circle marks an incomplete payment.",
  };
  const marks = { t0: "×", t1: "+", benign: "✓" };
  return (
    <section className="evidence-matrix" aria-labelledby="wallet-readout-title">
      <div className="matrix-heading">
        <Heading id="wallet-readout-title">{t[metric]}</Heading>
        <span className="micro-label">
          {t.recorded} · {dates[0]?.slice(0, 10)} · Fuji
        </span>
      </div>
      {detailed && (
        <fieldset className="result-selector">
          <legend className="landing-sr-only">
            {vi ? "Chọn kết quả để so sánh" : "Choose a result to compare"}
          </legend>
          {(
            [
              ["t0", vi ? "Ngoài uỷ quyền" : "Outside mandate"],
              ["t1", vi ? "Trong uỷ quyền, ngoài ý muốn" : "Inside the mandate, unwanted"],
              ["benign", vi ? "Khoản thanh toán hợp lệ" : "Benign payments"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="radio"
                name="wallet-metric"
                checked={metric === key}
                onChange={() => setMetric(key)}
              />
              <span>
                {key !== "benign" && <b>{key.toUpperCase()}</b>}
                {label}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="matrix-grid">
        {fuji.map((r, i) => {
          const count = metric === "benign" ? r.benignDone : r[metric];
          const total = metric === "benign" ? r.benign : r.cases;
          return (
            <article
              className={`matrix-wallet ${r.group === "S" ? "matrix-sealed" : ""}`}
              key={r.group}
            >
              <div className="wallet-heading">
                <span className="wallet-code">{r.group}</span>
                <strong>{t.wallets[i]}</strong>
              </div>
              <p className="matrix-number">
                {count}
                <span>/{total}</span>
              </p>
              <div key={metric} className="dot-matrix" data-metric={metric} aria-hidden="true">
                {Array.from({ length: total }, (_, n) => n).map((n) => (
                  <i key={`${r.group}-${n}`} data-marked={n < count || undefined}>
                    {n < count ? marks[metric] : ""}
                  </i>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <p className="matrix-legend">{legends[metric]}</p>
      <div className="evidence-disclosure">
        <strong>{t.tie}</strong>
        <p>{t.t1Note}</p>
        <p>
          {vi
            ? "Trên Sealed L1, cả phí và khoản thanh toán từ chính khoá agent đều tính vào hạn mức. Giao dịch bị từ chối không vào block. Đổi lại, đội phải vận hành một L1 riêng với một validator."
            : "Sealed L1 applies the caps to the agent’s key, including fees. A refused payment stays out of the block. This requires a separate L1 with one validator run by the team."}{" "}
          <a className="text-link" href={detailed ? "#tradeoffs" : "/compare#tradeoffs"}>
            {vi ? "Xem đánh đổi" : "See the tradeoff"} →
          </a>
        </p>
      </div>
      <p className="caption">{t.baselineNote}</p>
    </section>
  );
}

export function AgentEvidence({ lang, detailed = false }: { lang: Lang; detailed?: boolean }) {
  const Heading = detailed ? "h2" : "h3";
  const Subheading = detailed ? "h3" : "h4";
  const t = designText(lang);
  return (
    <section className="agent-experiments" aria-labelledby="agent-tests-title">
      <Heading id="agent-tests-title">
        {lang === "vi"
          ? "Khi khoá bị lộ hoặc agent bị đánh lừa"
          : "When a key leaks or an agent is misled"}
      </Heading>
      <div className="agent-evidence">
        <article className="key-evidence">
          <p className="micro-label">
            {t.recorded} · {leakedKey.at.slice(0, 10)} · Fuji
          </p>
          <Subheading>{t.leaked}</Subheading>
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
          <Subheading>{t.memory}</Subheading>
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
            {t.pages
              .replace("{followed}", evidence.pages.split("/")[0] ?? "")
              .replace("{runs}", evidence.pages.split("/")[1] ?? "")}
          </p>
        </article>
      </div>
    </section>
  );
}
