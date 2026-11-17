/**
 * The Sealed Arena mark: a card (what the agent is given) with the owner's seal on its corner.
 * The card follows the text colour; the seal uses the brand tokens in global.css.
 * The same drawing, with fixed colours, is web/public/favicon.svg.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <rect x="2" y="6" width="23" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="2" y="10" width="23" height="3" fill="currentColor" />
      <rect x="6" y="16.5" width="7" height="2" rx="1" fill="currentColor" opacity="0.45" />
      <circle cx="24" cy="23" r="6" fill="var(--brand-seal)" />
      <path
        d="M21.2 23.1l2 2 3.7-4"
        stroke="var(--brand-on-seal)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
