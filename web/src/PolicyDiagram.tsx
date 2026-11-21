import { useEffect, useRef, useState } from "react";
import run from "./compare-result.json";
import { designText } from "./designText.js";
import type { Lang } from "./i18n.js";
import { LandingIcon } from "./LandingVisual.js";
import { landingText } from "./landingText.js";
import "./policy-diagram.css";

const entry = "M42 215 H88 Q92 215 98 212 L151 183 Q156 180 163 184 L247 228";
const exit = "M287 230 L364 191 Q371 187 376 190 L401 202 Q407 205 412 202 L461 177 H500";

export function PolicyDiagram({ lang }: { lang: Lang }) {
  const t = landingText(lang);
  const vi = lang === "vi";
  const d = designText(lang);
  const [overBudget, setOverBudget] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const figure = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const refused = vi
    ? `Node từ chối ${run.S.refusedByPool}/${run.S.attempts} khoản thanh toán ngay khi nhận vì vượt hạn mức ngày. ${run.S.settledOnChain} khoản còn lại đã vào block.`
    : `The node refused ${run.S.refusedByPool} of ${run.S.attempts} payments on arrival because they exceeded the daily cap. The other ${run.S.settledOnChain} settled.`;
  const settled = vi
    ? `Gửi ${run.S.attempts} khoản thanh toán cùng lúc. ${run.S.settledOnChain} khoản nằm trong hạn mức ngày và vào block. Node từ chối ${run.S.refusedByPool} khoản còn lại ngay khi nhận.`
    : `${run.S.attempts} payments were sent at once. ${run.S.settledOnChain} fit the daily cap and settled. The node refused the other ${run.S.refusedByPool} on arrival.`;
  return (
    <figure
      ref={figure}
      className="policy-diagram"
      data-over-budget={overBudget}
      data-visible={visible}
    >
      <fieldset className="policy-scenarios">
        <legend className="landing-sr-only">
          {vi ? "Chọn trường hợp minh hoạ" : "Choose a payment scenario"}
        </legend>
        {[
          { outside: false, label: vi ? "Trong ngân sách" : "Within budget" },
          { outside: true, label: vi ? "Vượt ngân sách" : "Over budget" },
        ].map(({ outside, label }) => (
          <button
            type="button"
            key={String(outside)}
            aria-pressed={overBudget === outside}
            onClick={() => {
              setAutomatic(false);
              setOverBudget(outside);
            }}
          >
            <LandingIcon name={outside ? "cross" : "check"} size={14} />
            {label}
          </button>
        ))}
      </fieldset>
      <div className="policy-scene">
        <svg viewBox="0 0 540 300" className="policy-drawing" aria-hidden="true">
          <defs>
            <linearGradient
              id="policy-top"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
              gradientUnits="objectBoundingBox"
            >
              <stop stopColor="#93b1ff" />
              <stop offset=".34" stopColor="#597fe9" />
              <stop offset=".73" stopColor="#3159cf" />
              <stop offset="1" stopColor="#2647a4" />
            </linearGradient>
            <linearGradient id="policy-light">
              <stop stopColor="white" stopOpacity="0" />
              <stop offset=".65" stopColor="white" stopOpacity=".34" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <clipPath id="policy-face-clip">
              <rect x="-66" y="-66" width="132" height="132" rx="8" />
            </clipPath>
            <linearGradient id="policy-edge">
              <stop stopColor="#284594" />
              <stop offset=".49" stopColor="#1e397f" />
              <stop offset=".51" stopColor="#466acc" />
              <stop offset="1" stopColor="#7593e3" />
            </linearGradient>
            <linearGradient id="policy-glass" x2=".85" y2="1">
              <stop stopColor="#fff" stopOpacity=".96" />
              <stop offset=".6" stopColor="#dce7ff" stopOpacity=".9" />
              <stop offset="1" stopColor="#a8c1ff" stopOpacity=".9" />
            </linearGradient>
            <radialGradient id="policy-shadow">
              <stop stopColor="#526aa7" stopOpacity=".33" />
              <stop offset="1" stopColor="#7082aa" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="policy-field-fade">
              <stop offset=".3" stopColor="white" />
              <stop offset=".96" stopColor="black" />
            </radialGradient>
            <mask id="policy-field-mask">
              <ellipse cx="270" cy="195" rx="265" ry="105" fill="url(#policy-field-fade)" />
            </mask>
            <pattern
              id="policy-field-grid"
              width="34"
              height="34"
              patternUnits="userSpaceOnUse"
              patternTransform="matrix(.92 .48 -.92 .48 270 165)"
            >
              <path d="M34 0H0V34" fill="none" stroke="#a1b8e0" strokeWidth="1.2" />
              <circle r="1.6" fill="#809bc9" />
            </pattern>
            <pattern id="policy-dots" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".66" fill="#fff" opacity=".4" />
            </pattern>
            <path
              id="policy-deck"
              d="M142 161 261 99 Q270 94 279 99 L398 161 Q406 165 398 170 L279 232 Q270 237 261 232 L142 170 Q134 165 142 161Z"
            />
          </defs>
          <rect
            x="0"
            y="55"
            width="540"
            height="245"
            fill="url(#policy-field-grid)"
            mask="url(#policy-field-mask)"
          />
          <ellipse cx="268" cy="238" rx="159" ry="39" fill="url(#policy-shadow)" />
          <g fill="none" stroke="#b9c9e7" strokeWidth="1.5" strokeLinecap="round">
            <path d={entry} />
            <path d={exit} className="policy-exit" />
            <path opacity=".6" d="M68 224 H94 L143 198 M390 215 L406 223 466 191 H484" />
          </g>
          <g fill="var(--paper)" stroke="#6686c8" strokeWidth="1.6">
            <circle cx="42" cy="215" r="4" />
            <circle cx="500" cy="177" r="4" />
          </g>
          <g
            className="policy-wire-posts"
            stroke="#8aa4d8"
            strokeDasharray="2 4"
            strokeWidth="1"
            opacity=".7"
          >
            <path d="M140 141v40 M270 209v39 M400 141v40" />
          </g>
          <g key={String(overBudget)}>
            <g fill="none" stroke="var(--seal)" strokeWidth="1.4">
              <circle className="policy-ring ring-source" cx="42" cy="215" r="8" />
              {!overBudget && <circle className="policy-ring ring-payee" cx="500" cy="177" r="8" />}
            </g>
            <g fill="none" stroke="var(--seal)" strokeWidth="3" strokeLinecap="round">
              <path className="policy-packet packet-in" d={entry} pathLength="100" />
              {!overBudget && (
                <path className="policy-packet packet-out" d={exit} pathLength="100" />
              )}
            </g>
            <g transform="translate(0 17)">
              <use href="#policy-deck" y="5" fill="#9eb5de" stroke="#819bc9" />
              <use href="#policy-deck" fill="url(#policy-glass)" stroke="#99b2de" />
              <g
                transform="matrix(.94 .49 -.94 .49 270 165)"
                fill="none"
                stroke="#92a9d1"
                strokeWidth="1.3"
              >
                <rect x="-58" y="-58" width="116" height="116" rx="6" />
                <path d="M-61 -39 H-68 M-61 -23 H-68 M-61 -7 H-68 M61 7 H68 M61 23 H68 M61 39 H68 M-24 60 V68 M-7 60 V68 M10 60 V68" />
              </g>
            </g>
            <g className="policy-film">
              <use href="#policy-deck" fill="#c6d8fa" stroke="#91aadd" />
              <use href="#policy-deck" y="-4" fill="url(#policy-glass)" stroke="#afc4e7" />
            </g>
            <g
              className="policy-core"
              onAnimationIteration={(event) => {
                if (automatic && event.target === event.currentTarget)
                  setOverBudget((value) => !value);
              }}
            >
              <use href="#policy-deck" y="-24" fill="url(#policy-edge)" stroke="#365497" />
              <path
                d="M138 126 270 186 402 126 V141 L278 207 Q270 212 262 207 L138 142Z"
                fill="url(#policy-edge)"
              />
              <use href="#policy-deck" y="-40" fill="url(#policy-top)" stroke="#6788d7" />
              <g transform="matrix(.94 .49 -.94 .49 270 125)">
                <rect
                  x="-66"
                  y="-66"
                  width="132"
                  height="132"
                  rx="8"
                  fill="url(#policy-dots)"
                  stroke="#bed0ff"
                  strokeOpacity=".65"
                />
                <g clipPath="url(#policy-face-clip)">
                  <path
                    className="policy-scan"
                    d="M-118-68h32l-28 136h-32Z"
                    fill="url(#policy-light)"
                  />
                </g>
                <g fill="#d5e1ff">
                  {[-55, 55].flatMap((x) =>
                    [-55, 55].map((y) => <circle key={`${x}:${y}`} cx={x} cy={y} r="2" />),
                  )}
                </g>
                <g
                  transform="translate(0 -10)"
                  stroke="white"
                  fill="none"
                  strokeWidth="3.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <path
                    fill="#ffffff18"
                    d="M0-26 22-17 V0 C22 14 11 22 0 28 -11 22 -22 14 -22 0 V-17Z"
                  />
                  <path
                    className="policy-check"
                    pathLength="1"
                    d={overBudget ? "M-7 -7 7 7 M-7 7 7 -7" : "m-9 0 6 6L10-8"}
                  />
                </g>
                <text
                  x="0"
                  y="39"
                  textAnchor="middle"
                  fill="#fff"
                  fontFamily="var(--mono)"
                  fontSize="12"
                  letterSpacing="1.4"
                >
                  SEALED L1
                </text>
              </g>
            </g>
          </g>
        </svg>
        <span className="policy-label label-key">
          <LandingIcon name="key" size={15} />
          {t.agentKey}
        </span>
        <span className="policy-label label-payee">
          <LandingIcon name={overBudget ? "cross" : "check"} size={15} />
          {overBudget ? (vi ? "Chưa chuyển tiền" : "No payment") : t.payees}
        </span>
      </div>
      <div className="policy-outcome" aria-live={automatic ? "off" : "polite"}>
        {[settled, refused].map((description, index) => {
          const outside = index === 1;
          return (
            <p className="policy-result" key={String(outside)} aria-hidden={outside !== overBudget}>
              <LandingIcon name={outside ? "cross" : "check"} size={16} />
              {description}
            </p>
          );
        })}
      </div>
      <dl className="policy-caps">
        <div>
          <dt>{d.perPayment}</dt>
          <dd>
            {run.S.caps.perTx} <small>USDC</small>
          </dd>
        </div>
        <div>
          <dt>{d.perDay}</dt>
          <dd>
            {run.S.caps.daily} <small>USDC</small>
          </dd>
        </div>
      </dl>
      <figcaption>
        <span>
          {vi
            ? "Minh hoạ · lượt gửi đồng thời trên Fuji"
            : "Illustration · concurrent payments on Fuji"}{" "}
          · {(run.atS ?? run.at).slice(0, 10)}
        </span>
      </figcaption>
    </figure>
  );
}
