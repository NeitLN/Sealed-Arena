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
