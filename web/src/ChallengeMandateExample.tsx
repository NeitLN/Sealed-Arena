import type { Lang, T } from "./i18n.js";
import "./console-example.css";

// The public Fuji gateway's /state snapshot at 2026-11-21T11:09:21.652Z.
const example = {
  capturedAt: "2026-11-21T11:09:21.652Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  perPayment: "0.5 USDC",
  daily: "1 USDC",
  payees: [
    "0x67d4a4664ff232e84FA89135EeFEb42DF3660819",
    "0x576Aa08Fe728115542f45b3f6b8eF017F34b5F21",
  ],
};

export function ChallengeMandateExample({ lang, t }: { lang: Lang; t: T }) {
  const vi = lang === "vi";
  const date = new Intl.DateTimeFormat(vi ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
  return (
    <aside className="console-example" aria-labelledby="example-mandate-title">
      <p className="micro-label">{vi ? "Ví dụ chỉ đọc · Fuji" : "Read-only example · Fuji"}</p>
      <h2 id="example-mandate-title">
        {vi ? "Uỷ quyền của agent thử thách" : "Challenge agent’s mandate"}
      </h2>
      <dl>
        <div>
          <dt>{vi ? "Mỗi lần thanh toán, gồm phí" : "Per payment, including fees"}</dt>
          <dd>{example.perPayment}</dd>
        </div>
        <div>
          <dt>{vi ? "Mỗi ngày UTC" : "Per UTC day"}</dt>
          <dd>{example.daily}</dd>
        </div>
        <div>
          <dt>{t("expires")} (UTC)</dt>
          <dd>
            <time dateTime={example.expiresAt}>{date.format(new Date(example.expiresAt))}</time>
          </dd>
        </div>
      </dl>
      <details>
        <summary>
          {t("payees")} ({example.payees.length})
        </summary>
        <ul>
          {example.payees.map((payee) => (
            <li key={payee}>
              <code>{payee}</code>
            </li>
          ))}
        </ul>
      </details>
      <p className="caption">
        {vi ? "Ghi nhận" : "Recorded"}{" "}
        <time dateTime={example.capturedAt}>{date.format(new Date(example.capturedAt))}</time>
        {" · "}
        <a href="https://sealed-arena.duckdns.org/state">
          {vi ? "Nguồn dữ liệu" : "Data source"} ↗
        </a>
        {" · "}
        <a href="/arena">{vi ? "Xem thử thách" : "Open challenge"} →</a>
      </p>
    </aside>
  );
}
