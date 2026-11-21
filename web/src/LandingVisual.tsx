export function LandingIcon({
  name,
  size = 20,
}: {
  name:
    | "arrow"
    | "key"
    | "check"
    | "layers"
    | "pause"
    | "play"
    | "cross"
    | "crosshair"
    | "pulse"
    | "chart"
    | "blocks"
    | "book";
  size?: number;
}) {
  const paths = {
    arrow: "M5 12h14m-5-5 5 5-5 5",
    key: "M12 8a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM11 11l9 9m-5-5 3-3m-1 5 3-3",
    check: "m5 12 4 4L19 6",
    layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8V4Z",
    crosshair:
      "M12 3v3m0 12v3M3 12h3m12 0h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    pulse: "M2 12h5l3-7 4 14 3-7h5",
    chart: "M4 4v15h16M8 15v-4m5 4V6m5 9v-6",
    blocks: "M3 5h7v6H3zM14 5h7v14h-7zM3 15h7v4H3z",
    book: "M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v13",
    cross: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
